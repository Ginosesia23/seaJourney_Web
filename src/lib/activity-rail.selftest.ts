/**
 * Self-test: activity rail log-gap helper.
 * Run: npx tsx src/lib/activity-rail.selftest.ts
 */

import {
  addActivityRailUtcDays,
  resolveActivityRailLogWindowStart,
  summarizeActivityRailLogGaps,
} from './activity-rail';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

assert(addActivityRailUtcDays('2026-10-22', -1) === '2026-10-21', 'yesterday');
assert(addActivityRailUtcDays('2026-03-01', -1) === '2026-02-28', 'month boundary');

assert(
  resolveActivityRailLogWindowStart({
    today: '2026-10-22',
    assignmentStart: '2026-10-20',
    lookbackDays: 90,
  }) === '2026-10-20',
  'window starts at assignment when recent',
);

assert(
  resolveActivityRailLogWindowStart({
    today: '2026-10-22',
    assignmentStart: '2026-01-01',
    lookbackDays: 90,
  }) === '2026-07-24',
  'window clamps old assignments to lookback',
);

assert(
  resolveActivityRailLogWindowStart({
    today: '2026-10-22',
    assignmentStart: '2026-10-23',
  }) === null,
  'future assignment is skipped',
);

const todayMissing = summarizeActivityRailLogGaps({
  today: '2026-10-22',
  windowStart: '2026-10-20',
  loggedDates: ['2026-10-20', '2026-10-21'],
});
assert(todayMissing.todayMissing === true, 'today unlogged');
assert(todayMissing.missingExcludingToday.length === 0, 'no prior gaps');

const midGap = summarizeActivityRailLogGaps({
  today: '2026-10-22',
  windowStart: '2026-10-18',
  loggedDates: ['2026-10-18', '2026-10-20', '2026-10-22'],
});
assert(midGap.todayMissing === false, 'today logged');
assert(
  midGap.missingExcludingToday.join(',') === '2026-10-19,2026-10-21',
  'holes in the calendar are reported, not auto-filled',
);

const noLogs = summarizeActivityRailLogGaps({
  today: '2026-10-22',
  windowStart: '2026-10-22',
  loggedDates: [],
});
assert(noLogs.todayMissing === true, 'assignment started today still flags today');
assert(noLogs.missingExcludingToday.length === 0, 'no backfill of older days');

console.log('activity-rail.selftest ok');
