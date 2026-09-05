import { getPresetById } from '@/lib/certificates/presets';
import { certificateMatchesPreset } from '@/lib/certificates/match';
import type {
  CertificateValidityStatus,
  RequirementConfig,
  RequirementEvaluation,
} from '@/lib/applications/types';
import type { CareerMilestone } from '@/lib/applications/milestones';

export type CareerCertificateGap = {
  key: string;
  title: string;
  presetId?: string;
  certificateStatus: CertificateValidityStatus;
  detail: string;
  href: string;
  actionLabel: string;
  /** Milestone labels that need this certificate (deduped). */
  milestoneLabels: string[];
};

export type MilestoneEvaluationSource = {
  milestoneLabel: string;
  levelKey?: string;
  evaluations: RequirementEvaluation[];
};

/** Stable dedupe key for certificate requirements. */
export function certificateGapKey(config: RequirementConfig): string {
  if (config.presetId) return `preset:${config.presetId}`;
  const name = (config.nameContains || '').toString().trim().toLowerCase();
  const type = (config.certificateType || '').toString().trim().toLowerCase();
  if (name && type) return `match:${type}:${name}`;
  if (name) return `name:${name}`;
  if (type) return `type:${type}`;
  return '';
}

export function certificateGapKeyFromEvaluation(
  evaluation: RequirementEvaluation,
): string {
  return certificateGapKey(evaluation.config || {});
}

function gapActionLabel(status: CertificateValidityStatus): string {
  if (status === 'expired' || status === 'expiring_soon') return 'Renew / update';
  return 'Add certificate';
}

function gapTitle(evaluation: RequirementEvaluation): string {
  const presetId = evaluation.config?.presetId;
  if (presetId) {
    const preset = getPresetById(presetId);
    if (preset && preset.id !== 'other') return preset.name;
  }
  return evaluation.title;
}

/**
 * Merge unmet certificate requirements across milestones (deduped by preset/name).
 */
export function collectCertificateGaps(
  sources: MilestoneEvaluationSource[],
): CareerCertificateGap[] {
  const map = new Map<string, CareerCertificateGap>();

  for (const source of sources) {
    for (const evaluation of source.evaluations) {
      if (evaluation.requirementType !== 'certificate' || evaluation.met) continue;

      const key =
        certificateGapKeyFromEvaluation(evaluation) ||
        `req:${evaluation.requirementId}`;
      const status = evaluation.certificateStatus || 'missing';

      const existing = map.get(key);
      if (existing) {
        if (!existing.milestoneLabels.includes(source.milestoneLabel)) {
          existing.milestoneLabels.push(source.milestoneLabel);
        }
        if (status === 'expired') existing.certificateStatus = 'expired';
        else if (
          status === 'expiring_soon' &&
          existing.certificateStatus !== 'expired'
        ) {
          existing.certificateStatus = 'expiring_soon';
        }
        existing.actionLabel = gapActionLabel(existing.certificateStatus);
        continue;
      }

      map.set(key, {
        key,
        title: gapTitle(evaluation),
        presetId: evaluation.config?.presetId,
        certificateStatus: status,
        detail: evaluation.detail,
        href: evaluation.href || '/dashboard/certificates?add=1',
        actionLabel: gapActionLabel(status),
        milestoneLabels: [source.milestoneLabel],
      });
    }
  }

  return Array.from(map.values()).sort((a, b) =>
    a.title.localeCompare(b.title),
  );
}

/** Hide duplicate certificate rows within one milestone checklist. */
export function dedupeCertificateEvaluations(
  evaluations: RequirementEvaluation[],
): RequirementEvaluation[] {
  const seen = new Set<string>();
  return evaluations.filter((evaluation) => {
    if (evaluation.requirementType !== 'certificate') return true;
    const key =
      certificateGapKeyFromEvaluation(evaluation) ||
      `req:${evaluation.requirementId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Certificate gaps for the crew member's active ticket path: next milestone plus
 * prerequisite milestones that still block progress.
 */
export function collectCertificateGapsForNextTicket(args: {
  nextMilestone: CareerMilestone | null;
  progressByMilestoneId: Map<
    string,
    { milestone: CareerMilestone; evaluations: RequirementEvaluation[] }
  >;
  allMilestones: CareerMilestone[];
}): CareerCertificateGap[] {
  const { nextMilestone, progressByMilestoneId, allMilestones } = args;
  if (!nextMilestone) return [];

  const sources: MilestoneEvaluationSource[] = [];
  const nextResult = progressByMilestoneId.get(nextMilestone.id);
  if (nextResult) {
    sources.push({
      milestoneLabel: nextResult.milestone.label,
      levelKey: nextResult.milestone.level_key,
      evaluations: nextResult.evaluations,
    });

    for (const evaluation of nextResult.evaluations) {
      if (evaluation.requirementType !== 'prior_milestone' || evaluation.met) {
        continue;
      }
      const levelKey = evaluation.config?.levelKey;
      if (!levelKey) continue;
      const prereq = allMilestones.find((m) => m.level_key === levelKey);
      if (!prereq) continue;
      const prereqResult = progressByMilestoneId.get(prereq.id);
      if (prereqResult) {
        sources.push({
          milestoneLabel: prereqResult.milestone.label,
          levelKey: prereqResult.milestone.level_key,
          evaluations: prereqResult.evaluations,
        });
      }
    }
  }

  return collectCertificateGaps(sources);
}

/** Match a saved certificate row to a career gap (for highlighting on Certificates page). */
export function certificateMatchesGap(
  cert: {
    certificateName?: string | null;
    certificateType?: string | null;
    presetId?: string | null;
  },
  gap: CareerCertificateGap,
): boolean {
  if (gap.presetId) {
    return certificateMatchesPreset(
      {
        certificateName: cert.certificateName,
        certificateType: cert.certificateType,
        presetId: cert.presetId,
      },
      gap.presetId,
    );
  }
  const titleNeedle = (gap.title || '').trim().toLowerCase();
  const name = (cert.certificateName || '').trim().toLowerCase();
  if (!titleNeedle || !name) return false;
  return name.includes(titleNeedle) || titleNeedle.includes(name);
}
