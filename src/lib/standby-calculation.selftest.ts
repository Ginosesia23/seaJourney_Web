/**
 * Self-test: yacht officer vs deckhand at-anchor rules.
 * Run: npx tsx src/lib/standby-calculation.selftest.ts
 */

import { format } from 'date-fns';
import type { StateLog } from './types';
import { calculateStandbyDays } from './standby-calculation';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function log(date: string, state: StateLog['state']): StateLog {
  return {
    id: date,
    userId: 'u1',
    vesselId: 'v1',
    date,
    state,
  };
}

// 3 days underway, then 5 at-anchor, then 2 in-port.
const logs: StateLog[] = [
  log('2026-06-01', 'underway'),
  log('2026-06-02', 'underway'),
  log('2026-06-03', 'underway'),
  log('2026-06-04', 'at-anchor'),
  log('2026-06-05', 'at-anchor'),
  log('2026-06-06', 'at-anchor'),
  log('2026-06-07', 'at-anchor'),
  log('2026-06-08', 'at-anchor'),
  log('2026-06-09', 'in-port'),
  log('2026-06-10', 'in-port'),
];

const officer = calculateStandbyDays(logs, undefined, undefined, {
  atAnchorAsSeaService: true,
});
assert(officer.totalSeaDays === 8, `officer sea days: expected 8 (3 underway + 5 at-anchor), got ${officer.totalSeaDays}`);
assert(officer.totalStandbyDays === 2, `officer standby: expected 2 in-port (capped by 3-day voyage), got ${officer.totalStandbyDays}`);
assert(officer.standbyPeriods.length === 1, 'officer has one standby period');
assert(
  format(officer.standbyPeriods[0].startDate, 'yyyy-MM-dd') === '2026-06-09',
  `officer standby should start on in-port 2026-06-09, got ${format(officer.standbyPeriods[0].startDate, 'yyyy-MM-dd')}`,
);

const deckhand = calculateStandbyDays(logs);
// Voyage is 3 days, so at-anchor/in-port standby is capped at 3.
assert(deckhand.totalSeaDays === 3, `deckhand sea days: expected 3 underway, got ${deckhand.totalSeaDays}`);
assert(deckhand.totalStandbyDays === 3, `deckhand standby: expected 3 (voyage cap), got ${deckhand.totalStandbyDays}`);

console.log('standby-calculation.selftest: ok');
