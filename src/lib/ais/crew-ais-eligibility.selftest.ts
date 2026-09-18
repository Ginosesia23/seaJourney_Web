/**
 * Self-test: crew leave must not couple to vessel AIS scheduling.
 * Run: npx tsx src/lib/ais/crew-ais-eligibility.selftest.ts
 */

import { getNextAisCheckAt } from './adaptive-scheduler';
import { crewAisSeaServiceEligibilityFromFacts } from '@/lib/crew-rotation/onboard-leave-side-effects';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const nowMs = Date.parse('2026-09-16T10:00:00.000Z');

// Scenario 1 — vessel underway; Crew A onboard, Crew B on leave
{
  const vessel = getNextAisCheckAt({ currentState: 'underway', nowMs });
  assert(vessel.intervalMinutes === 5, 'vessel still polls every 5 min underway');

  const crewA = crewAisSeaServiceEligibilityFromFacts({
    dailyState: 'underway',
    forceOnLeaveFromTracker: false,
  });
  assert(crewA.eligible, 'onboard crew A should get AIS sea-service');

  const crewB = crewAisSeaServiceEligibilityFromFacts({
    dailyState: 'on-leave',
    forceOnLeaveFromTracker: false,
  });
  assert(!crewB.eligible, 'leave crew B must skip AIS sea-service');
}

// Scenario 2 — all crew on leave; vessel AIS schedule unchanged
{
  const vessel = getNextAisCheckAt({
    currentState: 'at-anchor',
    previousState: 'at-anchor',
    stateStableSince: '2026-09-16T08:00:00.000Z',
    nowMs,
  });
  assert(vessel.intervalMinutes === 30, 'vessel anchor polling independent of crew');

  const leaveCrew = crewAisSeaServiceEligibilityFromFacts({
    dailyState: 'on-leave',
    forceOnLeaveFromTracker: true,
  });
  assert(!leaveCrew.eligible, 'leave crew skipped');
}

// Scenario 3 — onboard → leave: eligibility flips; vessel schedule input unchanged
{
  const before = crewAisSeaServiceEligibilityFromFacts({
    dailyState: null,
    forceOnLeaveFromTracker: false,
  });
  assert(before.eligible, 'onboard eligible');

  const after = crewAisSeaServiceEligibilityFromFacts({
    dailyState: 'on-leave',
    forceOnLeaveFromTracker: true,
  });
  assert(!after.eligible, 'after leave not eligible');

  const vesselStill = getNextAisCheckAt({ currentState: 'underway', nowMs });
  assert(vesselStill.intervalMinutes === 5, 'vessel schedule not derived from crew leave');
}

// Scenario 4 — leave → onboard resumes (no backfill implied — only today eligible)
{
  const resumed = crewAisSeaServiceEligibilityFromFacts({
    dailyState: null,
    forceOnLeaveFromTracker: false,
  });
  assert(resumed.eligible, 'return from leave resumes eligibility');

  // Historical leave day remains ineligible (would be skipped if sync ran for that date)
  const leaveDay = crewAisSeaServiceEligibilityFromFacts({
    dailyState: 'on-leave',
    forceOnLeaveFromTracker: false,
  });
  assert(!leaveDay.eligible, 'leave-period day stays ineligible — no AIS credit');
}

// Scenario 5 — vessel qualifying underway does not force crew leave day to underway
{
  const vesselDay = getNextAisCheckAt({ currentState: 'underway', nowMs });
  assert(vesselDay.trackingMode === 'fast', 'vessel underway');
  const crewOnLeave = crewAisSeaServiceEligibilityFromFacts({
    dailyState: 'on-leave',
    forceOnLeaveFromTracker: true,
  });
  assert(!crewOnLeave.eligible, 'crew leave day not auto-underway from vessel');
}

// Scenario 6 — mixed crew: eligibility is per-member
{
  const onboard = crewAisSeaServiceEligibilityFromFacts({
    dailyState: 'at-anchor',
    forceOnLeaveFromTracker: false,
  });
  const onLeave = crewAisSeaServiceEligibilityFromFacts({
    dailyState: null,
    forceOnLeaveFromTracker: true,
  });
  assert(onboard.eligible && !onLeave.eligible, 'mixed eligibility');
}

console.log('crew-ais-eligibility.selftest: all scenarios passed');
