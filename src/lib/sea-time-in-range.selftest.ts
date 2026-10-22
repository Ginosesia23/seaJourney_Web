/**
 * Self-test: position-aware sea time in a date range.
 * Run: npx tsx src/lib/sea-time-in-range.selftest.ts
 */

import type { StateLog } from './types';
import { computeSeaTimeInDateRange } from './sea-time-in-range';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function log(date: string, state: StateLog['state']): StateLog {
  return { id: date, userId: 'u1', vesselId: 'v1', date, state };
}

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

const officer = computeSeaTimeInDateRange({
  filteredLogs: logs,
  rangeStart: '2026-06-01',
  rangeEnd: '2026-06-10',
  useCrewLogs: false,
  vesselType: 'motor-yacht',
  watchDates: new Set(),
  position: 'Chief Officer',
});
assert(officer.atSeaDays === 8, `officer at sea: expected 8, got ${officer.atSeaDays}`);
assert(officer.standbyDays === 2, `officer standby: expected 2 in-port, got ${officer.standbyDays}`);

const deckhand = computeSeaTimeInDateRange({
  filteredLogs: logs,
  rangeStart: '2026-06-01',
  rangeEnd: '2026-06-10',
  useCrewLogs: false,
  vesselType: 'motor-yacht',
  watchDates: new Set(),
  position: 'Deckhand',
});
assert(deckhand.atSeaDays === 3, `deckhand at sea: expected 3, got ${deckhand.atSeaDays}`);
assert(deckhand.standbyDays === 3, `deckhand standby: expected 3 (voyage cap), got ${deckhand.standbyDays}`);

const commercial = computeSeaTimeInDateRange({
  filteredLogs: logs,
  rangeStart: '2026-06-01',
  rangeEnd: '2026-06-10',
  useCrewLogs: false,
  vesselType: 'cargo-ship',
  watchDates: new Set(),
  position: 'Deckhand',
});
assert(commercial.atSeaDays === 10, `commercial at sea: expected 10, got ${commercial.atSeaDays}`);
assert(commercial.standbyDays === 0, `commercial standby: expected 0, got ${commercial.standbyDays}`);

console.log('sea-time-in-range.selftest: ok');
