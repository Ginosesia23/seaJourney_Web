/**
 * Self-test: stationary → underway passage-start backfill selection.
 * Run: npx tsx src/lib/ais/backfill-passage-start.selftest.ts
 */

import type { DatalasticVesselPosition } from '@/lib/datalastic/client';
import {
  historyPositionsToFixes,
  isPassageMotion,
  lookbackStartMs,
  PASSAGE_BACKFILL_MAX_LOOKBACK_MS,
  PASSAGE_BACKFILL_STEP_MS,
  selectPassageStartBackfill,
  shouldBackfillPassageStart,
} from './backfill-passage-start';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function pos(
  utc: string,
  speed: number,
  nav: string,
  lat = 50.0,
  lon = -1.0,
): DatalasticVesselPosition {
  return {
    lat,
    lon,
    speed,
    navigational_status: nav,
    navigation_status: nav,
    last_position_UTC: utc,
  };
}

const nowMs = Date.parse('2026-06-01T12:00:00.000Z');

{
  assert(
    shouldBackfillPassageStart({
      previousState: 'in-port',
      currentState: 'underway',
      previousFetchedAtMs: nowMs - 45 * 60_000,
      nowMs,
    }),
    'moored/port 45m gap → backfill',
  );
  assert(
    shouldBackfillPassageStart({
      previousState: 'at-anchor',
      currentState: 'underway',
      previousFetchedAtMs: nowMs - 30 * 60_000,
      nowMs,
    }),
    'anchor 30m gap → backfill',
  );
  assert(
    !shouldBackfillPassageStart({
      previousState: 'underway',
      currentState: 'underway',
      previousFetchedAtMs: nowMs - 45 * 60_000,
      nowMs,
    }),
    'already underway → no backfill',
  );
  assert(
    !shouldBackfillPassageStart({
      previousState: 'in-port',
      currentState: 'underway',
      previousFetchedAtMs: nowMs - 5 * 60_000,
      nowMs,
    }),
    '5m gap already on fast poll → skip',
  );
  assert(
    !shouldBackfillPassageStart({
      previousState: 'in-port',
      currentState: 'at-anchor',
      previousFetchedAtMs: nowMs - 45 * 60_000,
      nowMs,
    }),
    'still stationary → skip',
  );
}

{
  const start = lookbackStartMs({
    previousFetchedAtMs: nowMs - 10 * 60 * 60 * 1000,
    nowMs,
  });
  assert(
    nowMs - start === PASSAGE_BACKFILL_MAX_LOOKBACK_MS,
    'lookback capped at 4h even if last poll is older',
  );
}

{
  assert(isPassageMotion(pos('2026-06-01T11:00:00.000Z', 0.1, 'Moored')) === false, 'moored slow');
  assert(isPassageMotion(pos('2026-06-01T11:00:00.000Z', 6, 'Underway using engine')), 'nav underway');
  assert(
    isPassageMotion(pos('2026-06-01T11:00:00.000Z', 4.2, 'Moored')),
    'speed still counts as passage start while nav lags',
  );
}

{
  const lastPoll = Date.parse('2026-06-01T11:00:00.000Z');
  const live = Date.parse('2026-06-01T12:00:00.000Z');
  const history: DatalasticVesselPosition[] = [
    pos('2026-06-01T11:00:00.000Z', 0.0, 'Moored', 50.0, -1.0),
    pos('2026-06-01T11:18:00.000Z', 0.1, 'Moored', 50.001, -1.001),
    pos('2026-06-01T11:22:00.000Z', 3.4, 'Underway using engine', 50.01, -1.02),
    pos('2026-06-01T11:27:00.000Z', 7.1, 'Underway using engine', 50.03, -1.05),
    pos('2026-06-01T11:41:00.000Z', 8.0, 'Underway using engine', 50.08, -1.12),
    pos('2026-06-01T11:56:00.000Z', 8.2, 'Underway using engine', 50.14, -1.2),
    pos('2026-06-01T12:00:00.000Z', 8.4, 'Underway using engine', 50.16, -1.22),
  ];

  const points = selectPassageStartBackfill({
    history: historyPositionsToFixes(history),
    lookbackStartMs: lastPoll,
    liveFixMs: live,
    stepMs: PASSAGE_BACKFILL_STEP_MS,
  });

  assert(points.length >= 3, `expected several underway points, got ${points.length}`);
  assert(points[0]!.state === 'underway', 'first backfill point is underway');
  assert(
    points[0]!.atMs === Date.parse('2026-06-01T11:22:00.000Z'),
    `passage start should be first moving fix, got ${new Date(points[0]!.atMs).toISOString()}`,
  );
  assert(
    points.every((p) => p.atMs < live),
    'does not include the live fix',
  );
  assert(
    points.every((p, i) => i === 0 || p.atMs > points[i - 1]!.atMs),
    'chronological',
  );
}

{
  const lastPoll = Date.parse('2026-06-01T11:30:00.000Z');
  const live = Date.parse('2026-06-01T12:00:00.000Z');
  const history: DatalasticVesselPosition[] = [
    pos('2026-06-01T11:55:00.000Z', 0.0, 'At anchor', 50.0, -1.0),
    pos('2026-06-01T12:00:00.000Z', 5.0, 'Underway using engine', 50.02, -1.02),
  ];
  const points = selectPassageStartBackfill({
    history: historyPositionsToFixes(history),
    lookbackStartMs: lastPoll,
    liveFixMs: live,
  });
  assert(points.length === 0, 'stationary 5m before live → nothing to insert');
}

{
  const lastPoll = Date.parse('2026-06-01T11:00:00.000Z');
  const live = Date.parse('2026-06-01T11:40:00.000Z');
  const sparse: DatalasticVesselPosition[] = [
    pos('2026-06-01T11:00:00.000Z', 0.0, 'Moored'),
    pos('2026-06-01T11:12:00.000Z', 5.5, 'Underway using engine', 50.04, -1.04),
    pos('2026-06-01T11:33:00.000Z', 6.0, 'Underway using engine', 50.1, -1.1),
    pos('2026-06-01T11:40:00.000Z', 6.1, 'Underway using engine', 50.12, -1.12),
  ];
  const points = selectPassageStartBackfill({
    history: historyPositionsToFixes(sparse),
    lookbackStartMs: lastPoll,
    liveFixMs: live,
  });
  const uniqueTimes = new Set(points.map((p) => p.atMs));
  assert(uniqueTimes.size === points.length, 'duplicate AIS pings are not double-logged');
  assert(
    points[0]!.atMs === Date.parse('2026-06-01T11:12:00.000Z'),
    'sparse history still finds the departure ping',
  );
}

console.log('backfill-passage-start.selftest: all scenarios passed');
