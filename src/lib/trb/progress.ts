import type { TrbTaskStatus } from '@/lib/trb/constants';

export type ProgressCounts = {
  total: number;
  approved: number;
  awaitingSignoff: number;
  readyForAssessment: number;
  inProgress: number;
  notStarted: number;
  changesRequested: number;
  rejected: number;
  remaining: number;
  percentComplete: number;
};

export function calculateTrbProgress(
  statuses: TrbTaskStatus[],
): ProgressCounts {
  const total = statuses.length;
  let approved = 0;
  let awaitingSignoff = 0;
  let readyForAssessment = 0;
  let inProgress = 0;
  let notStarted = 0;
  let changesRequested = 0;
  let rejected = 0;
  for (const s of statuses) {
    if (s === 'approved') approved += 1;
    else if (s === 'awaiting_signoff') awaitingSignoff += 1;
    else if (s === 'ready_for_assessment') readyForAssessment += 1;
    else if (s === 'in_progress') inProgress += 1;
    else if (s === 'not_started') notStarted += 1;
    else if (s === 'changes_requested') changesRequested += 1;
    else if (s === 'rejected') rejected += 1;
  }
  const remaining = Math.max(0, total - approved);
  const percentComplete = total === 0 ? 0 : Math.round((approved / total) * 100);
  return {
    total,
    approved,
    awaitingSignoff,
    readyForAssessment,
    inProgress,
    notStarted,
    changesRequested,
    rejected,
    remaining,
    percentComplete,
  };
}

export function groupProgressBySection<
  T extends { sectionId: string; status: TrbTaskStatus },
>(
  rows: T[],
): Record<string, ProgressCounts> {
  const bySection: Record<string, TrbTaskStatus[]> = {};
  for (const row of rows) {
    if (!bySection[row.sectionId]) bySection[row.sectionId] = [];
    bySection[row.sectionId].push(row.status);
  }
  const out: Record<string, ProgressCounts> = {};
  for (const [sectionId, statuses] of Object.entries(bySection)) {
    out[sectionId] = calculateTrbProgress(statuses);
  }
  return out;
}
