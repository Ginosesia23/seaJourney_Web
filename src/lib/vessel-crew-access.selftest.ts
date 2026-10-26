/**
 * Self-test: vessel plan coverage auto-access marker.
 * Run: npx tsx src/lib/vessel-crew-access.selftest.ts
 */

import { isAutoGrantedVesselAccessNote, VESSEL_PLAN_ACCESS_MARKER } from './vessel-crew-access';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

assert(
  isAutoGrantedVesselAccessNote(
    `${VESSEL_PLAN_ACCESS_MARKER} Auto-approved while covered by this vessel subscription`,
  ),
  'auto-grant notes are recognised',
);
assert(
  !isAutoGrantedVesselAccessNote('Crew approved from Inbox'),
  'manual approvals are left alone',
);
assert(!isAutoGrantedVesselAccessNote(null), 'empty notes are not auto-grants');

console.log('vessel-crew-access.selftest ok');
