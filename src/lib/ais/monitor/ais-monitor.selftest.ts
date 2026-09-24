/**
 * Self-tests for the admin AIS Monitor + provider request auditing.
 * Run: npx tsx src/lib/ais/monitor/ais-monitor.selftest.ts
 *
 * Covers: trigger normalisation, error sanitisation, HTTP-layer request meta
 * (mocked fetch — no network, no DB), alert/health/savings/duplicate logic,
 * log window clamping, admin guard presence on every monitor API route, and a
 * static proof that monitor code cannot reach the AIS provider.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import {
  normalizeAisTriggerSource,
  sanitiseProviderError,
  type AisProviderRequestMeta,
} from '@/lib/ais/fetch-audit-shared';
import {
  AIS_FIXED_BASELINE_PULLS_PER_DAY,
  AIS_MONITOR_MAX_LOG_WINDOW_DAYS,
  AIS_MONITOR_THRESHOLDS,
  clampLogWindow,
  computeAdaptiveSavings,
  computeAisMonitorAlerts,
  computeAisMonitorHealth,
  emptyRequestStats,
  isLikelyLegitimateDuplicate,
  logFilterConstraints,
} from '@/lib/ais/monitor/metrics';
import type { AisMonitorRequestStats, AisMonitorSchedulerHealth } from '@/lib/ais/monitor/types';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

let passed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function stats(p: Partial<AisMonitorRequestStats>): AisMonitorRequestStats {
  return { ...emptyRequestStats(), ...p };
}

function scheduler(p: Partial<AisMonitorSchedulerHealth>): AisMonitorSchedulerHealth {
  return {
    eligible: 0,
    enabled: 0,
    enabledNeverScheduled: 0,
    due: 0,
    overdue: 0,
    farOverdue: 0,
    failing: 0,
    failing5Plus: 0,
    modes: { fast: 0, normal: 0, slow: 0, transition: 0, failure_retry: 0 },
    lastSchedulerRequestAt: null,
    thresholds: { overdueMinutes: 15, farOverdueMinutes: 60 },
    ...p,
  };
}

const ROOT = join(__dirname, '..', '..', '..', '..');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx)$/.test(name) && !name.includes('.selftest.')) out.push(p);
  }
  return out;
}

async function main() {
  console.log('AIS monitor self-tests');

  await test('trigger normalisation never mislabels legacy strings', () => {
    assert(normalizeAisTriggerSource('adaptive_scheduler') === 'adaptive_scheduler', 'typed passthrough');
    assert(normalizeAisTriggerSource('vessel-sync:cron') === 'adaptive_scheduler', 'cron legacy');
    assert(normalizeAisTriggerSource('api:force') === 'manual_user', 'force legacy');
    assert(normalizeAisTriggerSource('crew-enable') === 'premium_enabled', 'crew enable legacy');
    // Ambiguous: used by both manual sync and initial tracking start.
    assert(normalizeAisTriggerSource('vessel-sync:manual') === 'unknown', 'ambiguous → unknown');
    assert(normalizeAisTriggerSource('passages-map:live') === 'unknown', 'cache caller → unknown');
    assert(normalizeAisTriggerSource(null) === 'unknown', 'null → unknown');
  });

  await test('sanitiseProviderError strips credentials and URL queries', () => {
    const raw =
      'fetch failed https://api.datalastic.com/api/v0/vessel?api-key=SECRET123&mmsi=1 api-key=SECRET123 token: abc';
    const out = sanitiseProviderError(raw) ?? '';
    assert(!out.includes('SECRET123'), 'api key removed');
    assert(!out.includes('abc'), 'token removed');
    assert(out.includes('https://api.datalastic.com/api/v0/vessel?[redacted]'), 'url path kept, query redacted');
    assert((sanitiseProviderError('x'.repeat(2000)) ?? '').length <= 500, 'truncated');
    assert(sanitiseProviderError(null) === null, 'null passthrough');
  });

  await test('HTTP layer reports request meta and never leaks the API key', async () => {
    process.env.DATALASTIC_API_KEY = 'unit-test-secret-key';
    const { fetchVesselPosition, DatalasticApiError } = await import('@/lib/datalastic/client');
    const realFetch = globalThis.fetch;
    const calls: string[] = [];
    try {
      globalThis.fetch = (async (url: string | URL | Request) => {
        calls.push(String(url));
        return new Response(JSON.stringify({ data: { lat: 1, lon: 2, mmsi: '123456789' } }), { status: 200 });
      }) as typeof fetch;
      let meta: AisProviderRequestMeta | null = null;
      await fetchVesselPosition(
        { mmsi: '123-456-789' },
        { triggerSource: 'unknown', onRequestComplete: (m) => (meta = m) },
      );
      const ok = meta as AisProviderRequestMeta | null;
      assert(ok, 'meta captured');
      assert(ok.success && ok.httpStatus === 200 && ok.endpoint === 'vessel', 'success meta');
      assert(ok.mmsi === '123-456-789', 'mmsi passed through (normalised at insert)');
      assert(ok.responseTimeMs >= 0 && ok.completedAt >= ok.requestedAt, 'timing');
      assert(!JSON.stringify(ok).includes('unit-test-secret-key'), 'no key in meta');
      assert(calls.length === 1, 'exactly one HTTP request');

      globalThis.fetch = (async () =>
        new Response(JSON.stringify({ message: 'Too many requests' }), { status: 429 })) as typeof fetch;
      meta = null;
      let threw = false;
      try {
        await fetchVesselPosition({ mmsi: '1' }, { triggerSource: 'retry', onRequestComplete: (m) => (meta = m) });
      } catch (e) {
        threw = e instanceof DatalasticApiError && e.status === 429;
      }
      const rl = meta as AisProviderRequestMeta | null;
      assert(threw, '429 still throws DatalasticApiError');
      assert(rl && !rl.success && rl.httpStatus === 429, '429 meta recorded');

      globalThis.fetch = (async () => {
        throw new Error('connect ECONNREFUSED');
      }) as typeof fetch;
      meta = null;
      threw = false;
      try {
        await fetchVesselPosition({ mmsi: '1' }, { triggerSource: 'retry', onRequestComplete: (m) => (meta = m) });
      } catch {
        threw = true;
      }
      const ne = meta as AisProviderRequestMeta | null;
      assert(threw && ne && ne.httpStatus === null && !ne.success, 'network error meta (no status)');

      // No audit context → client writes the row itself; DB unavailable in tests
      // must NOT break the provider call.
      const savedKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      const origWarn = console.warn;
      console.warn = () => {};
      globalThis.fetch = (async () =>
        new Response(JSON.stringify({ data: { lat: 1, lon: 2 } }), { status: 200 })) as typeof fetch;
      try {
        const pos = await fetchVesselPosition({ mmsi: '1' });
        assert(pos.lat === 1, 'provider result returned despite audit insert failure');
      } finally {
        console.warn = origWarn;
        if (savedKey) process.env.SUPABASE_SERVICE_ROLE_KEY = savedKey;
      }
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  await test('alerts: 429, 401/403, failure rate, consecutive failures, no success, stalled scheduler', () => {
    const now = Date.parse('2026-09-24T12:00:00Z');
    const alerts = computeAisMonitorAlerts({
      nowMs: now,
      last1h: stats({ total: 20, failed: 5, rateLimited: 2 }),
      last24h: stats({ total: 100, failed: 12, authFailed: 1, lastSuccessAt: '2026-09-24T09:00:00Z' }),
      scheduler: scheduler({ enabled: 3, due: 2, failing5Plus: 1, farOverdue: 1, lastSchedulerRequestAt: '2026-09-24T11:00:00Z' }),
    });
    const ids = new Set(alerts.map((a) => a.id));
    for (const id of ['rate_limited', 'auth_failed', 'high_failure_rate', 'consecutive_failures', 'no_recent_success', 'scheduler_stalled', 'far_overdue'] as const) {
      assert(ids.has(id), `alert ${id}`);
    }
    assert(alerts.find((a) => a.id === 'rate_limited')?.severity === 'critical', 'recent 429 is critical');
    assert(alerts.every((a) => a.dedupeKey.startsWith('ais:')), 'dedupe keys for future notifier');
    assert(computeAisMonitorHealth({ alerts, last24h: stats({ total: 100 }), scheduler: scheduler({ enabled: 3 }) }) === 'down', 'down');
  });

  await test('alerts: quiet when healthy; small samples do not trip failure rate', () => {
    const now = Date.parse('2026-09-24T12:00:00Z');
    const alerts = computeAisMonitorAlerts({
      nowMs: now,
      last1h: stats({ total: 3, failed: 2 }),
      last24h: stats({ total: 10, failed: 2, lastSuccessAt: '2026-09-24T11:55:00Z' }),
      scheduler: scheduler({ enabled: 2, due: 0, lastSchedulerRequestAt: '2026-09-24T11:58:00Z' }),
    });
    assert(alerts.length === 0, `expected no alerts, got ${alerts.map((a) => a.id).join(',')}`);
    assert(computeAisMonitorHealth({ alerts, last24h: stats({ total: 10 }), scheduler: scheduler({ enabled: 2 }) }) === 'healthy', 'healthy');
    assert(computeAisMonitorHealth({ alerts: [], last24h: stats({}), scheduler: scheduler({}) }) === 'idle', 'idle');
    assert(AIS_MONITOR_THRESHOLDS.noSuccessMinutes === 90, 'no-success threshold derived from slow interval');
  });

  await test('savings estimate vs 288/day baseline', () => {
    assert(AIS_FIXED_BASELINE_PULLS_PER_DAY === 288, '288 per day');
    const s = computeAdaptiveSavings({ trackedVesselDays: 10, actualRequests: 720, windowDays: 30 });
    assert(s.fixedIntervalRequests === 2880 && s.avoidedRequests === 2160 && s.savingsPercent === 75, 'math');
    assert(s.approximate === true, 'always labelled approximate');
    const none = computeAdaptiveSavings({ trackedVesselDays: 0, actualRequests: 0, windowDays: 30 });
    assert(none.savingsPercent === null, 'no baseline → null, not 0% or 100%');
    const over = computeAdaptiveSavings({ trackedVesselDays: 1, actualRequests: 400, windowDays: 30 });
    assert(over.avoidedRequests === 0 && over.savingsPercent === 0, 'never negative');
  });

  await test('duplicate classification', () => {
    assert(!isLikelyLegitimateDuplicate({ triggerSource: 'adaptive_scheduler', previousTriggerSource: 'adaptive_scheduler', previousSuccess: true }), 'scheduler→scheduler is suspicious');
    assert(isLikelyLegitimateDuplicate({ triggerSource: 'manual_user', previousTriggerSource: 'adaptive_scheduler', previousSuccess: true }), 'manual explains');
    assert(isLikelyLegitimateDuplicate({ triggerSource: 'adaptive_scheduler', previousTriggerSource: 'initial_tracking_start', previousSuccess: true }), 'tracking start explains');
    assert(isLikelyLegitimateDuplicate({ triggerSource: 'retry', previousTriggerSource: 'adaptive_scheduler', previousSuccess: false }), 'failure explains');
  });

  await test('log window is bounded and filters map correctly', () => {
    const now = Date.parse('2026-09-24T12:00:00Z');
    const w = clampLogWindow('2020-01-01T00:00:00Z', null, now);
    const days = (Date.parse(w.to) - Date.parse(w.from)) / 86_400_000;
    assert(days <= AIS_MONITOR_MAX_LOG_WINDOW_DAYS + 0.01, 'clamped to max window');
    const inverted = clampLogWindow('2026-09-24T12:00:00Z', '2026-09-20T00:00:00Z', now);
    assert(Date.parse(inverted.from) < Date.parse(inverted.to), 'inverted range fixed');
    assert(logFilterConstraints('scheduler').triggers?.includes('retry'), 'scheduler includes retry');
    assert(logFilterConstraints('failed').success === false, 'failed filter');
  });

  await test('every monitor API route enforces requireAdmin server-side', () => {
    const apiDir = join(ROOT, 'src/app/api/admin/ais-monitor');
    const routes = walk(apiDir).filter((f) => f.endsWith('route.ts'));
    assert(routes.length >= 6, `expected ≥6 routes, found ${routes.length}`);
    for (const file of routes) {
      const src = readFileSync(file, 'utf8');
      const rel = relative(ROOT, file);
      assert(src.includes("from '@/lib/applications/auth'") && src.includes('requireAdmin(req)'), `${rel} uses requireAdmin`);
      const guardIdx = src.indexOf('requireAdmin(req)');
      const firstQuery = src.indexOf('await getAisMonitor');
      assert(firstQuery > guardIdx, `${rel} guards before querying`);
      assert(src.includes("if ('error' in auth) return auth.error"), `${rel} returns on auth failure`);
    }
  });

  await test('ZERO provider calls: monitor code cannot reach Datalastic or the AIS service', () => {
    const files = [
      ...walk(join(ROOT, 'src/lib/ais/monitor')),
      ...walk(join(ROOT, 'src/app/api/admin/ais-monitor')),
      ...walk(join(ROOT, 'src/components/admin/ais-monitor')),
      ...walk(join(ROOT, 'src/app/dashboard/ais-monitor')),
      ...walk(join(ROOT, 'src/app/admin/ais-monitor')),
    ];
    const forbidden = [
      /@\/lib\/datalastic\//,
      /@\/lib\/ais\/ais-service/,
      /@\/lib\/ais\/provider\//,
      /@\/lib\/ais\/sync-/,
      /@\/lib\/ais\/fetch-audit['"]/,
      /api\.datalastic\.com/,
      /\b(fetchVessel\w+|getVesselAIS|refreshVesselAIS|syncVesselStateFromAis)\s*\(/,
      /['"`]\/api\/ais\//,
    ];
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      for (const re of forbidden) {
        assert(!re.test(src), `${relative(ROOT, file)} must not match ${re}`);
      }
    }
    const clientFiles = files.filter((f) => readFileSync(f, 'utf8').startsWith("'use client'"));
    for (const file of clientFiles) {
      const src = readFileSync(file, 'utf8');
      assert(!/supabaseAdmin|SERVICE_ROLE/.test(src), `${relative(ROOT, file)} must not reference service role`);
      const urls = src.match(/['"`]\/api\/[^'"`]*/g) ?? [];
      for (const u of urls) {
        assert(u.slice(1).startsWith('/api/admin/ais-monitor/'), `${relative(ROOT, file)} only calls monitor APIs (${u})`);
      }
    }
    assert(files.length >= 15, `scanned ${files.length} files`);
  });

  console.log(`\n${passed} passed`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
