/**
 * Daily passage summary notification ("Luminance covered 243 NM in the
 * last 24 hours at an average of 10.1 kn").
 *
 * Reads only stored `crew_ais_state_samples` — never calls the AIS provider.
 * Recipients are crew with live AIS samples in the window (premium + live
 * tracking on, same audience as state-change notifications).
 *
 * Idempotent per user/vessel/day via `metadata.summaryType` +
 * `metadata.summaryDate` on `app_user_notifications`.
 */

import { haversineNm } from '@/lib/ais/analyze-daily-state';
import { sendUserNotification } from '@/lib/notifications/send-user-notification';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const WINDOW_MS = 24 * 60 * 60 * 1000;
/** Below this the day isn't worth a push (harbour shuffles, anchor swing). */
const MIN_SUMMARY_DISTANCE_NM = 5;
/** Hops faster than this are AIS glitches, not movement. */
const MAX_PLAUSIBLE_KN = 40;
/** A hop only counts toward moving time above this implied speed. */
const MOVING_KN = 1;

const SUMMARY_TYPE = 'daily_passage';

type SampleRow = {
  user_id: string;
  vessel_id: string;
  lat: number | string | null;
  lon: number | string | null;
  speed_kn: number | string | null;
  ais_position_at: string | null;
  sampled_at: string;
};

type Fix = { lat: number; lon: number; atMs: number; speedKn: number | null };

export type DailyPassageSummary = {
  userId: string;
  vesselId: string;
  vesselName: string;
  summaryDate: string;
  distanceNm: number;
  movingMs: number;
  avgSpeedKn: number | null;
  maxSpeedKn: number | null;
  fixCount: number;
};

export type DailyPassageSummaryResult = DailyPassageSummary & {
  status: 'sent' | 'skipped_short' | 'skipped_duplicate' | 'dry_run' | 'failed';
  reason?: string;
};

function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** Samples repeat the same AIS fix every sync — keep one row per fix. */
function toDistinctFixes(rows: SampleRow[]): Fix[] {
  const fixes: Fix[] = [];
  let lastKey = '';
  for (const r of rows) {
    const lat = num(r.lat);
    const lon = num(r.lon);
    const atMs = Date.parse(r.ais_position_at ?? r.sampled_at);
    if (lat == null || lon == null || !Number.isFinite(atMs)) continue;
    const key = `${r.ais_position_at ?? ''}|${lat.toFixed(5)}|${lon.toFixed(5)}`;
    if (key === lastKey) continue;
    lastKey = key;
    fixes.push({ lat, lon, atMs, speedKn: num(r.speed_kn) });
  }
  return fixes.sort((a, b) => a.atMs - b.atMs);
}

export function summariseFixes(
  fixes: Fix[],
  window: { startMs: number; endMs: number },
): {
  distanceNm: number;
  movingMs: number;
  avgSpeedKn: number | null;
  maxSpeedKn: number | null;
} {
  let distanceNm = 0;
  let movingMs = 0;
  for (let i = 1; i < fixes.length; i++) {
    const a = fixes[i - 1]!;
    const b = fixes[i]!;
    const dtMs = b.atMs - a.atMs;
    if (dtMs <= 0) continue;
    const hopNm = haversineNm(a.lat, a.lon, b.lat, b.lon);
    const impliedKn = hopNm / (dtMs / 3_600_000);
    if (impliedKn > MAX_PLAUSIBLE_KN) continue;
    // The first sample in the window can carry a fix from before it;
    // pro-rate that hop to the part inside the window.
    const inWindowMs =
      Math.min(b.atMs, window.endMs) - Math.max(a.atMs, window.startMs);
    if (inWindowMs <= 0) continue;
    distanceNm += hopNm * (inWindowMs / dtMs);
    // Distance is only counted for plausible hops, so every moving hop's
    // time counts too — even across AIS silence mid-passage.
    if (impliedKn >= MOVING_KN) movingMs += inWindowMs;
  }
  const speeds = fixes
    .map((f) => f.speedKn)
    .filter((s): s is number => s != null && s >= 0 && s <= MAX_PLAUSIBLE_KN);
  const avgSpeedKn = movingMs > 15 * 60_000 ? distanceNm / (movingMs / 3_600_000) : null;
  return {
    distanceNm,
    movingMs,
    avgSpeedKn,
    maxSpeedKn: speeds.length > 0 ? Math.max(...speeds) : null,
  };
}

function formatHours(ms: number): string {
  const totalMin = Math.round(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function dailyPassageSummaryCopy(s: DailyPassageSummary): { title: string; body: string } {
  const distance = s.distanceNm >= 100 ? Math.round(s.distanceNm).toString() : s.distanceNm.toFixed(1);
  const avg = s.avgSpeedKn != null ? ` at an average of ${s.avgSpeedKn.toFixed(1)} kn` : '';
  const extras = [
    s.movingMs > 0 ? `${formatHours(s.movingMs)} underway` : null,
    s.maxSpeedKn != null ? `top speed ${s.maxSpeedKn.toFixed(1)} kn` : null,
  ].filter(Boolean);
  return {
    title: 'Daily passage summary',
    body: `${s.vesselName} covered ${distance} NM in the last 24 hours${avg}.${
      extras.length ? ` ${extras.join(' · ')}.` : ''
    }`,
  };
}

async function alreadySent(userId: string, vesselId: string, summaryDate: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('app_user_notifications')
    .select('id')
    .eq('user_id', userId)
    .eq('metadata->>summaryType', SUMMARY_TYPE)
    .eq('metadata->>summaryDate', summaryDate)
    .eq('metadata->>vesselId', vesselId)
    .limit(1);
  if (error) {
    console.warn('[daily-passage-summary] duplicate check failed', { userId, error });
    return true;
  }
  return (data?.length ?? 0) > 0;
}

export async function runDailyPassageSummaries(options?: {
  endAt?: Date;
  dryRun?: boolean;
}): Promise<DailyPassageSummaryResult[]> {
  const endAt = options?.endAt ?? new Date();
  const startAt = new Date(endAt.getTime() - WINDOW_MS);
  const summaryDate = endAt.toISOString().slice(0, 10);

  const PAGE = 1000;
  const allRows: SampleRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabaseAdmin
      .from('crew_ais_state_samples')
      .select('user_id, vessel_id, lat, lon, speed_kn, ais_position_at, sampled_at')
      .gte('sampled_at', startAt.toISOString())
      .lte('sampled_at', endAt.toISOString())
      .order('sampled_at', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    allRows.push(...((data ?? []) as SampleRow[]));
    if ((data?.length ?? 0) < PAGE) break;
  }

  const groups = new Map<string, SampleRow[]>();
  for (const row of allRows) {
    const key = `${row.user_id}|${row.vessel_id}`;
    let list = groups.get(key);
    if (!list) groups.set(key, (list = []));
    list.push(row);
  }
  if (groups.size === 0) return [];

  const vesselIds = [...new Set([...groups.keys()].map((k) => k.split('|')[1]!))];
  const { data: vessels } = await supabaseAdmin.from('vessels').select('id, name').in('id', vesselIds);
  const nameById = new Map((vessels ?? []).map((v) => [v.id as string, (v.name as string) || 'Your vessel']));

  const results: DailyPassageSummaryResult[] = [];
  for (const [key, rows] of groups) {
    const [userId, vesselId] = key.split('|') as [string, string];
    const fixes = toDistinctFixes(rows);
    const stats = summariseFixes(fixes, { startMs: startAt.getTime(), endMs: endAt.getTime() });
    const summary: DailyPassageSummary = {
      userId,
      vesselId,
      vesselName: nameById.get(vesselId) ?? 'Your vessel',
      summaryDate,
      fixCount: fixes.length,
      ...stats,
    };

    if (summary.distanceNm < MIN_SUMMARY_DISTANCE_NM) {
      results.push({ ...summary, status: 'skipped_short' });
      continue;
    }
    if (await alreadySent(userId, vesselId, summaryDate)) {
      results.push({ ...summary, status: 'skipped_duplicate' });
      continue;
    }
    if (options?.dryRun) {
      results.push({ ...summary, status: 'dry_run', reason: dailyPassageSummaryCopy(summary).body });
      continue;
    }

    const { title, body } = dailyPassageSummaryCopy(summary);
    const sent = await sendUserNotification({
      userId,
      title,
      body,
      kind: 'sea_time',
      metadata: {
        summaryType: SUMMARY_TYPE,
        summaryDate,
        vesselId,
        vesselName: summary.vesselName,
        distanceNm: Number(summary.distanceNm.toFixed(1)),
        avgSpeedKn: summary.avgSpeedKn != null ? Number(summary.avgSpeedKn.toFixed(1)) : null,
        maxSpeedKn: summary.maxSpeedKn,
        movingMinutes: Math.round(summary.movingMs / 60_000),
        route: '/dashboard/current',
      },
    });
    results.push({
      ...summary,
      status: sent.ok ? 'sent' : 'failed',
      reason: sent.ok ? ('skipped' in sent ? sent.skipped : undefined) : sent.reason,
    });
  }
  return results;
}
