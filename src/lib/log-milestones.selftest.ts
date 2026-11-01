/**
 * Self-test: logbook milestone thresholds.
 * Run: npx tsx src/lib/log-milestones.selftest.ts
 */

import {
  acknowledgeLogMilestone,
  highestReachedThreshold,
  parseLogMilestoneProgress,
  pendingLogMilestones,
  seaDayKeysForPassage,
} from './log-milestones';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

assert(highestReachedThreshold([100, 365, 500], 99) === null, 'below first mark');
assert(highestReachedThreshold([100, 365, 500], 100) === 100, 'hits 100');
assert(highestReachedThreshold([100, 365, 500], 400) === 365, 'highest below value');

const first = pendingLogMilestones(
  { sea_days: 124, distance_nm: 1800, passages: 9 },
  {},
);
assert(first.length === 2, 'passages under 10 are skipped');
assert(first[0]?.id === 'milestone-sea_days-100', 'sea days uses highest reached');
assert(first[1]?.id === 'milestone-distance_nm-1000', 'distance uses highest reached');

const afterAck = pendingLogMilestones(
  { sea_days: 124, distance_nm: 1800, passages: 12 },
  acknowledgeLogMilestone(
    acknowledgeLogMilestone({}, 'sea_days', 100),
    'distance_nm',
    1000,
  ),
);
assert(afterAck.length === 1, 'acked metrics stay quiet');
assert(afterAck[0]?.id === 'milestone-passages-10', 'passages notify once they hit 10');

const later = pendingLogMilestones(
  { sea_days: 400, distance_nm: 1800, passages: 12 },
  { sea_days: 100, distance_nm: 1000, passages: 10 },
);
assert(later.length === 1 && later[0]?.id === 'milestone-sea_days-365', 'next sea-day mark');

assert(
  parseLogMilestoneProgress({ sea_days: '100', extra: true }).sea_days === 100,
  'parses numeric strings',
);
assert(Object.keys(parseLogMilestoneProgress([])).length === 0, 'ignores arrays');

const days = seaDayKeysForPassage(
  '2026-10-01T08:00:00.000Z',
  '2026-10-03T20:00:00.000Z',
);
assert(days.length >= 2, 'multi-day passage yields sea days');

console.log('log-milestones.selftest ok');
