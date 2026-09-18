/**
 * Lightweight self-test for adaptive AIS scheduling.
 * Run: npx tsx src/lib/ais/adaptive-scheduler.selftest.ts
 */

import {
  AIS_POLL_INTERVALS,
  AIS_STATE_STABILITY_MINUTES,
  getNextAisCheckAt,
  isInAisTransitionWindow,
  isVesselDueForProviderFetch,
  nextStabilityTimestamps,
} from './adaptive-scheduler';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function approxMinutesFrom(iso: string, nowMs: number): number {
  return Math.round((Date.parse(iso) - nowMs) / 60_000);
}

const nowMs = Date.parse('2026-06-01T10:00:00.000Z');

// Scenario 1 — underway → +5
{
  const r = getNextAisCheckAt({ currentState: 'underway', nowMs });
  assert(r.intervalMinutes === 5, `underway interval ${r.intervalMinutes}`);
  assert(r.trackingMode === 'fast', `underway mode ${r.trackingMode}`);
  assert(approxMinutesFrom(r.nextAisCheckAt, nowMs) === 5, 'underway next');
}

// Scenario 2 — stable anchor → +30
{
  const stableSince = new Date(
    nowMs - (AIS_STATE_STABILITY_MINUTES + 5) * 60_000,
  ).toISOString();
  const r = getNextAisCheckAt({
    currentState: 'at-anchor',
    previousState: 'at-anchor',
    stateStableSince: stableSince,
    nowMs,
  });
  assert(r.intervalMinutes === AIS_POLL_INTERVALS.anchor, `anchor ${r.intervalMinutes}`);
  assert(r.trackingMode === 'normal', `anchor mode ${r.trackingMode}`);
  assert(approxMinutesFrom(r.nextAisCheckAt, nowMs) === 30, 'anchor next');
}

// Scenario 3 — port → +60
{
  const stableSince = new Date(
    nowMs - (AIS_STATE_STABILITY_MINUTES + 5) * 60_000,
  ).toISOString();
  const r = getNextAisCheckAt({
    currentState: 'in-port',
    previousState: 'in-port',
    stateStableSince: stableSince,
    nowMs,
  });
  assert(r.intervalMinutes === 60, `port ${r.intervalMinutes}`);
  assert(approxMinutesFrom(r.nextAisCheckAt, nowMs) === 60, 'port next');
}

// Scenario 4 — underway → anchor stays fast until stability window
{
  const changeAt = new Date(nowMs).toISOString();
  assert(
    isInAisTransitionWindow({
      currentState: 'at-anchor',
      previousState: 'underway',
      stateStableSince: changeAt,
      nowMs,
    }),
    'should be in transition right after leaving underway',
  );

  const rFast = getNextAisCheckAt({
    currentState: 'at-anchor',
    previousState: 'at-anchor',
    stateStableSince: changeAt,
    nowMs: nowMs + 10 * 60_000,
  });
  assert(rFast.trackingMode === 'transition', `expected transition got ${rFast.trackingMode}`);
  assert(rFast.intervalMinutes === 5, 'transition interval');

  const afterStable = getNextAisCheckAt({
    currentState: 'at-anchor',
    previousState: 'at-anchor',
    stateStableSince: changeAt,
    nowMs: nowMs + (AIS_STATE_STABILITY_MINUTES + 1) * 60_000,
  });
  assert(afterStable.trackingMode === 'normal', `expected normal got ${afterStable.trackingMode}`);
  assert(afterStable.intervalMinutes === 30, 'post-stability anchor');
}

// Scenario 7 — failure backoff
{
  const f1 = getNextAisCheckAt({
    currentState: 'underway',
    consecutiveFetchFailures: 1,
    nowMs,
  });
  assert(f1.intervalMinutes === 5 && f1.trackingMode === 'failure_retry', 'fail1');
  const f2 = getNextAisCheckAt({
    currentState: 'underway',
    consecutiveFetchFailures: 2,
    nowMs,
  });
  assert(f2.intervalMinutes === 10, 'fail2');
  const f3 = getNextAisCheckAt({
    currentState: 'underway',
    consecutiveFetchFailures: 5,
    nowMs,
  });
  assert(f3.intervalMinutes === 30, 'fail3+');
}

// Scenario 8 — NULL next_ais_check_at is due
{
  assert(isVesselDueForProviderFetch(null, nowMs), 'null due');
  assert(isVesselDueForProviderFetch(undefined, nowMs), 'undefined due');
  assert(
    !isVesselDueForProviderFetch(new Date(nowMs + 60_000).toISOString(), nowMs),
    'future not due',
  );
  assert(
    isVesselDueForProviderFetch(new Date(nowMs - 1000).toISOString(), nowMs),
    'past due',
  );
}

// Stability clock resets on state change
{
  const s = nextStabilityTimestamps({
    previousState: 'underway',
    newState: 'at-anchor',
    previousStableSince: '2026-06-01T08:00:00.000Z',
    nowIso: '2026-06-01T10:00:00.000Z',
  });
  assert(s.stateStableSince === '2026-06-01T10:00:00.000Z', 'reset on change');
  const same = nextStabilityTimestamps({
    previousState: 'at-anchor',
    newState: 'at-anchor',
    previousStableSince: '2026-06-01T09:00:00.000Z',
    nowIso: '2026-06-01T10:00:00.000Z',
  });
  assert(same.stateStableSince === '2026-06-01T09:00:00.000Z', 'preserve stable');
}

// on-leave is NOT a vessel AIS state — must not enter stationary/transition
// scheduling (falls through to unknown_fast as unrecognised vessel state).
{
  assert(
    !isInAisTransitionWindow({
      currentState: 'on-leave',
      previousState: 'underway',
      stateStableSince: new Date(nowMs).toISOString(),
      nowMs,
    }),
    'on-leave must not be treated as vessel stationary/transition',
  );
  const r = getNextAisCheckAt({ currentState: 'on-leave', nowMs });
  assert(r.scheduledReason === 'unknown_fast', `got ${r.scheduledReason}`);
  assert(r.intervalMinutes === 5, 'unrecognised vessel state still polls fast');
}

console.log('adaptive-scheduler.selftest: all scenarios passed');
