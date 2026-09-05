import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateSeaTimeReportData } from '@/app/actions';
import {
  evaluateRequirements,
  progressFromEvaluations,
  sumDocumentedSea,
  type MilestoneProgressSnapshot,
} from '@/lib/applications/evaluate-requirements';
import {
  mapMilestoneRequirement,
  toApplicationRequirements,
  type CareerMilestone,
  type MilestoneRequirement,
} from '@/lib/applications/milestones';
import { resolveCareerStep } from '@/lib/applications/career-path';
import { collectCertificateGapsForNextTicket } from '@/lib/applications/career-certificate-gaps';
import { loadCertificateCatalog } from '@/lib/certificates/catalog.server';
import type { CertificatePreset } from '@/lib/certificates/presets';

export type MilestoneEvaluationResult = {
  milestone: CareerMilestone & { requirements: MilestoneRequirement[] };
  evaluations: ReturnType<typeof evaluateRequirements>;
  progress: ReturnType<typeof progressFromEvaluations>;
  completedManualIds: string[];
  achievedAt: string | null;
};

async function syncAchievedAt(
  userId: string,
  milestoneId: string,
  allRequiredMet: boolean,
  completedManualIds: string[],
  totalRequired: number,
): Promise<string | null> {
  const { data: existing } = await supabaseAdmin
    .from('crew_milestone_progress')
    .select('achieved_at, completed_manual_ids')
    .eq('user_id', userId)
    .eq('milestone_id', milestoneId)
    .maybeSingle();

  const achievedAt = (existing?.achieved_at as string | null) ?? null;

  if (allRequiredMet && totalRequired > 0 && !achievedAt) {
    const nowIso = new Date().toISOString();
    await supabaseAdmin.from('crew_milestone_progress').upsert(
      {
        user_id: userId,
        milestone_id: milestoneId,
        completed_manual_ids: completedManualIds,
        achieved_at: nowIso,
      },
      { onConflict: 'user_id,milestone_id' },
    );
    return nowIso;
  }

  if (existing || completedManualIds.length > 0) {
    await supabaseAdmin.from('crew_milestone_progress').upsert(
      {
        user_id: userId,
        milestone_id: milestoneId,
        completed_manual_ids: completedManualIds,
        achieved_at: achievedAt,
      },
      { onConflict: 'user_id,milestone_id' },
    );
  }

  return achievedAt;
}

export async function loadMilestoneWithRequirements(
  milestoneId: string,
): Promise<(CareerMilestone & { requirements: MilestoneRequirement[] }) | null> {
  const { data: milestone } = await supabaseAdmin
    .from('career_milestones')
    .select('*')
    .eq('id', milestoneId)
    .maybeSingle();

  if (!milestone) return null;

  const { data: requirements } = await supabaseAdmin
    .from('milestone_requirements')
    .select('*')
    .eq('milestone_id', milestoneId)
    .order('sort_order', { ascending: true });

  return {
    ...(milestone as CareerMilestone),
    requirements: (requirements || []).map(mapMilestoneRequirement),
  };
}

async function loadSharedUserData(userId: string) {
  const [
    { data: profile },
    { data: certificates },
    { data: testimonials },
    { data: proof },
  ] = await Promise.all([
    supabaseAdmin.from('users').select('*').eq('id', userId).maybeSingle(),
    supabaseAdmin.from('certificates').select('*').eq('user_id', userId),
    supabaseAdmin.from('testimonials').select('*').eq('user_id', userId),
    supabaseAdmin.from('proof_of_service').select('id').eq('crew_user_id', userId),
  ]);

  return { profile, certificates, testimonials, proof };
}

function buildMilestoneLookups(milestones: Array<{ id: string; level_key: string }>) {
  const milestoneByLevelKey: Record<string, string> = {};
  for (const m of milestones) {
    milestoneByLevelKey[m.level_key] = m.id;
  }
  return milestoneByLevelKey;
}

export async function evaluateMilestoneForUser(
  userId: string,
  milestoneId: string,
  options?: {
    milestoneProgress?: Map<string, MilestoneProgressSnapshot>;
    milestoneByLevelKey?: Record<string, string>;
    sharedUserData?: Awaited<ReturnType<typeof loadSharedUserData>>;
    certificateCatalog?: CertificatePreset[];
  },
): Promise<MilestoneEvaluationResult | { error: string; status: number }> {
  const milestone = await loadMilestoneWithRequirements(milestoneId);
  if (!milestone) {
    return { error: 'Milestone not found', status: 404 };
  }

  const sharedUserData =
    options?.sharedUserData ?? (await loadSharedUserData(userId));
  const { profile, certificates, testimonials, proof } = sharedUserData;

  const { data: progressRow } = await supabaseAdmin
    .from('crew_milestone_progress')
    .select('completed_manual_ids, achieved_at')
    .eq('user_id', userId)
    .eq('milestone_id', milestoneId)
    .maybeSingle();

  const mappedReqs = toApplicationRequirements(milestone.requirements);
  const needsTracked = mappedReqs.some(
    (r) =>
      r.requirement_type === 'sea_time_min' &&
      (r.config?.source || 'testimonials') === 'tracked',
  );

  let trackedSea: { atSeaDays: number; totalDays: number; standbyDays: number } | null = null;
  if (needsTracked) {
    try {
      const report = await generateSeaTimeReportData(userId, 'date_range', undefined, {
        from: new Date('1990-01-01T00:00:00Z'),
        to: new Date(),
      });
      trackedSea = {
        atSeaDays: report.totalSeaDays,
        totalDays: report.totalDays,
        standbyDays: report.totalStandbyDays,
      };
    } catch {
      trackedSea = { atSeaDays: 0, totalDays: 0, standbyDays: 0 };
    }
  }

  const completedManualIds = new Set<string>(
    (progressRow?.completed_manual_ids as string[] | null) || [],
  );

  const milestoneProgressRecord = options?.milestoneProgress
    ? Object.fromEntries(options.milestoneProgress)
    : undefined;

  const certificateCatalog =
    options?.certificateCatalog ??
    (await loadCertificateCatalog({ includeOther: true }));

  const evaluations = evaluateRequirements(mappedReqs, {
    profile: profile as Record<string, unknown> | null,
    certificates: certificates || [],
    testimonials: testimonials || [],
    proofOfService: proof || [],
    documentedSea: sumDocumentedSea(testimonials || []),
    trackedSea,
    completedManualIds,
    milestoneProgress: milestoneProgressRecord,
    milestoneByLevelKey: options?.milestoneByLevelKey,
    certificateCatalog,
  });

  const progress = progressFromEvaluations(evaluations);
  const completedManualIdsArr = Array.from(completedManualIds);
  const achievedAt = await syncAchievedAt(
    userId,
    milestoneId,
    progress.allRequiredMet,
    completedManualIdsArr,
    progress.totalRequired,
  );

  if (options?.milestoneProgress) {
    options.milestoneProgress.set(milestoneId, {
      label: milestone.label,
      levelKey: milestone.level_key,
      allRequiredMet: progress.allRequiredMet,
      achievedAt,
    });
  }

  return {
    milestone,
    evaluations,
    progress,
    completedManualIds: completedManualIdsArr,
    achievedAt,
  };
}

async function evaluateMilestonesInOrder(
  userId: string,
  milestones: CareerMilestone[],
  sharedUserData?: Awaited<ReturnType<typeof loadSharedUserData>>,
): Promise<Map<string, MilestoneEvaluationResult>> {
  const progressById = new Map<string, MilestoneEvaluationResult>();
  const milestoneProgress = new Map<string, MilestoneProgressSnapshot>();
  const milestoneByLevelKey = buildMilestoneLookups(milestones);

  const userDataCache = sharedUserData ?? (await loadSharedUserData(userId));
  const certificateCatalog = await loadCertificateCatalog({ includeOther: true });

  for (const m of milestones) {
    const evaluated = await evaluateMilestoneForUser(userId, m.id, {
      milestoneProgress,
      milestoneByLevelKey,
      sharedUserData: userDataCache,
      certificateCatalog,
    });
    if (!('error' in evaluated)) {
      progressById.set(m.id, evaluated);
    }
  }

  return progressById;
}

export async function loadPublishedMilestonesForUser(userId: string) {
  const { data: profile } = await supabaseAdmin
    .from('users')
    .select('position, role')
    .eq('id', userId)
    .maybeSingle();

  const career = resolveCareerStep((profile?.position as string | null) ?? null);

  const { data: milestones } = await supabaseAdmin
    .from('career_milestones')
    .select('*')
    .eq('status', 'published')
    .order('sort_order', { ascending: true });

  const trackFiltered = (milestones || []).filter(
    (m) => m.track === career.track || m.track === 'any' || career.track === 'any',
  ) as CareerMilestone[];

  const userDataCache = await loadSharedUserData(userId);
  const progressById = await evaluateMilestonesInOrder(
    userId,
    trackFiltered,
    userDataCache,
  );
  const documentedSea = sumDocumentedSea(userDataCache.testimonials || []);

  const nextKey = career.nextLevel;
  const nextMilestone =
    (nextKey
      ? trackFiltered.find((m) => m.level_key === nextKey)
      : trackFiltered[0]) ?? null;

  let nextProgress = null;
  if (nextMilestone) {
    const evaluated = progressById.get(nextMilestone.id);
    if (evaluated) {
      nextProgress = {
        milestone: evaluated.milestone,
        evaluations: evaluated.evaluations,
        progress: evaluated.progress,
        completedManualIds: evaluated.completedManualIds,
      };
    }
  }

  const milestonesWithProgress = trackFiltered.map((m) => {
    const evaluated = progressById.get(m.id);
    return {
      ...m,
      progress: evaluated?.progress ?? null,
      evaluations: evaluated?.evaluations ?? [],
    };
  });

  const progressForGaps = new Map<
    string,
    { milestone: CareerMilestone; evaluations: RequirementEvaluation[] }
  >();
  for (const [id, result] of progressById) {
    progressForGaps.set(id, {
      milestone: result.milestone,
      evaluations: result.evaluations,
    });
  }

  const certificateGaps = collectCertificateGapsForNextTicket({
    nextMilestone,
    progressByMilestoneId: progressForGaps,
    allMilestones: trackFiltered,
  });

  return {
    career,
    milestones: milestonesWithProgress,
    nextMilestone,
    nextProgress,
    certificateGaps,
    documentedSea,
    approvedTestimonialCount: (userDataCache.testimonials || []).filter(
      (t) => t.status === 'approved',
    ).length,
  };
}

export async function evaluateMilestoneWithDependencies(
  userId: string,
  milestoneId: string,
): Promise<MilestoneEvaluationResult | { error: string; status: number }> {
  const target = await loadMilestoneWithRequirements(milestoneId);
  if (!target) {
    return { error: 'Milestone not found', status: 404 };
  }

  const { data: siblings } = await supabaseAdmin
    .from('career_milestones')
    .select('*')
    .eq('status', 'published')
    .in('track', [target.track, 'any'])
    .order('sort_order', { ascending: true });

  const ordered = (siblings || []) as CareerMilestone[];
  const progressById = await evaluateMilestonesInOrder(userId, ordered);
  return progressById.get(milestoneId) ?? { error: 'Milestone not found', status: 404 };
}
