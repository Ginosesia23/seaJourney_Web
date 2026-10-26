/**
 * Self-test: crew daily state ↔ onboard toggle intent.
 * Run: npx tsx src/lib/crew-rotation/crew-onboard-sync.selftest.ts
 */

import { crewDailyStateOnboardIntent } from './crew-onboard-sync';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const today = '2026-10-24';

assert(
  crewDailyStateOnboardIntent({
    todayIso: today,
    dateIso: today,
    state: 'on-leave',
    hasOpenToggleLeave: false,
    isVesselAccount: false,
  }) === 'mark_off',
  'crew on-leave today marks the vessel toggle off',
);

assert(
  crewDailyStateOnboardIntent({
    todayIso: today,
    dateIso: today,
    state: 'underway',
    hasOpenToggleLeave: true,
    isVesselAccount: false,
  }) === 'mark_on',
  'leaving on-leave with an open toggle leave marks them back onboard',
);

assert(
  crewDailyStateOnboardIntent({
    todayIso: today,
    dateIso: today,
    state: 'in-port',
    hasOpenToggleLeave: false,
    isVesselAccount: false,
  }) === 'none',
  'a normal log does not override a rotation off-board',
);

assert(
  crewDailyStateOnboardIntent({
    todayIso: today,
    dateIso: '2026-10-20',
    state: 'on-leave',
    hasOpenToggleLeave: false,
    isVesselAccount: false,
  }) === 'none',
  'past-day leave does not flip today’s onboard toggle',
);

assert(
  crewDailyStateOnboardIntent({
    todayIso: today,
    dateIso: today,
    state: 'on-leave',
    hasOpenToggleLeave: false,
    isVesselAccount: true,
  }) === 'none',
  'vessel-account logs do not drive the crew onboard toggle',
);

console.log('crew-onboard-sync.selftest ok');
