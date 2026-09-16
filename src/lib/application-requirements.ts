/**
 * Shared requirement catalogs + progress evaluation for Career Documents
 * application packs (OOW MSF 4274, Nav Watch MSF 4371, …).
 */

import type { Testimonial } from '@/lib/types';
import {
  certificateMatchesPreset,
  type CertificateMatchInput,
} from '@/lib/certificates/match';
import { getPresetById } from '@/lib/certificates/presets';
import {
  getOowRouteRequirements,
  type OowTrainingRoute,
} from '@/lib/oow-application';
import {
  NAV_WATCH_REQUIRED_SEA_DAYS,
  selectTestimonialsCoveringSeaDays,
} from '@/lib/nav-watch-submission-pack';
import { summariseBridgeWatchkeepingDays } from '@/lib/oow-submission-pack';
import type { NavWatchLogRow } from '@/lib/watch-history-summary';

export type ApplicationRequirementKind =
  | 'certificate'
  | 'document'
  | 'sea_service'
  | 'watchkeeping'
  | 'watch_hours';

export type ApplicationRequirementDef = {
  id: string;
  label: string;
  kind: ApplicationRequirementKind;
  /** When kind === 'certificate' — catalog preset id(s) to match. */
  presetIds?: string[];
  /** Optional / route-dependent. */
  optional?: boolean;
  /** Checklist / supporting_evidence key when applicable. */
  checklistKey?: string;
  hint?: string;
};

export type ApplicationRequirementStatus = ApplicationRequirementDef & {
  met: boolean;
  detail: string;
  /** Matched certificate name when kind === certificate && met */
  matchedCertificateName?: string | null;
};

export type ApplicationProgressSummary = {
  items: ApplicationRequirementStatus[];
  metRequired: number;
  totalRequired: number;
  metOptional: number;
  totalOptional: number;
  percent: number;
};

export type ApplicationProgressContext = {
  certificates: CertificateMatchInput[];
  testimonials: Testimonial[];
  watchLogs?: NavWatchLogRow[];
  /** Saved or draft checklist / supporting_evidence ticks. */
  checklist?: Record<string, boolean | undefined> | null;
  watchkeepingHours?: number | null;
  userId?: string | null;
  oowTrainingRoute?: OowTrainingRoute;
  navWatchCertificateType?: 'navigational_ii4' | 'navigational_iii4' | 'electro_technical' | string;
};

function findMatchingCertificate(
  certificates: CertificateMatchInput[],
  presetIds: string[],
): CertificateMatchInput | null {
  for (const presetId of presetIds) {
    const match = certificates.find((c) => certificateMatchesPreset(c, presetId));
    if (match) return match;
  }
  return null;
}

function certLabel(presetIds: string[]): string {
  const names = presetIds
    .map((id) => getPresetById(id)?.name)
    .filter(Boolean);
  return names[0] || presetIds.join(' / ');
}

/** Certificate + document requirements for OOW / CoC (MSF 4274). */
export const OOW_REQUIREMENT_DEFS: ApplicationRequirementDef[] = [
  {
    id: 'stcwBasicTraining',
    label: 'STCW Basic Safety Training',
    kind: 'certificate',
    presetIds: ['stcw-bst'],
    checklistKey: 'stcwBasicTraining',
  },
  {
    id: 'securityAwareness',
    label: 'Security Awareness',
    kind: 'certificate',
    presetIds: ['stcw-security'],
    checklistKey: 'securityAwareness',
  },
  {
    id: 'medical',
    label: 'ENG1 / Medical fitness',
    kind: 'certificate',
    presetIds: ['eng1', 'ml5'],
    checklistKey: 'medical',
  },
  {
    id: 'advancedFireFighting',
    label: 'Advanced Fire Fighting',
    kind: 'certificate',
    presetIds: ['stcw-aff'],
    checklistKey: 'advancedFireFighting',
    optional: true,
  },
  {
    id: 'medicalFirstAid',
    label: 'Medical First Aid',
    kind: 'certificate',
    presetIds: ['stcw-mfa'],
    checklistKey: 'medicalFirstAid',
    optional: true,
  },
  {
    id: 'efficientDeckHand',
    label: 'Efficient Deck Hand (EDH)',
    kind: 'certificate',
    presetIds: ['edh'],
    checklistKey: 'efficientDeckHand',
    optional: true,
    hint: 'Often required on the OOW pathway before / with CoC issue',
  },
  {
    id: 'gmdssGoc',
    label: 'GMDSS GOC',
    kind: 'certificate',
    presetIds: ['gmdss'],
    checklistKey: 'gmdssGoc',
    optional: true,
  },
  {
    id: 'attestedPassport',
    label: 'Attested passport copy',
    kind: 'document',
    checklistKey: 'attestedPassport',
  },
  {
    id: 'passportPhoto',
    label: 'Passport photos',
    kind: 'document',
    checklistKey: 'passportPhoto',
  },
  {
    id: 'dischargeBookOrCd',
    label: 'Discharge book / certificates of discharge',
    kind: 'document',
    checklistKey: 'dischargeBookOrCd',
  },
  {
    id: 'payment',
    label: 'Application fee ready',
    kind: 'document',
    checklistKey: 'payment',
  },
  {
    id: 'seaServiceTestimonials',
    label: 'Sea service testimonials (with watchkeeping)',
    kind: 'document',
    checklistKey: 'seaServiceTestimonials',
  },
  {
    id: 'sea_service',
    label: 'Approved sea service days',
    kind: 'sea_service',
  },
  {
    id: 'watchkeeping',
    label: 'Bridge watchkeeping days',
    kind: 'watchkeeping',
  },
];

export function getNavWatchRequirementDefs(
  certificateType?: string,
): ApplicationRequirementDef[] {
  const isEtr = certificateType === 'electro_technical';
  const certs: ApplicationRequirementDef[] = [
    {
      id: 'stcwBasicTraining',
      label: 'STCW Basic Safety Training',
      kind: 'certificate',
      presetIds: ['stcw-bst'],
      checklistKey: 'stcwBasicTraining',
    },
    {
      id: 'securityAwareness',
      label: 'Security Awareness',
      kind: 'certificate',
      presetIds: ['stcw-security'],
      checklistKey: 'securityAwareness',
    },
    {
      id: 'medical',
      label: 'ENG1 / Medical fitness',
      kind: 'certificate',
      presetIds: ['eng1', 'ml5'],
      checklistKey: 'medical',
    },
  ];

  if (!isEtr) {
    certs.push({
      id: 'profInSurvivalCraft',
      label: 'Proficiency in Survival Craft (PSC)',
      kind: 'certificate',
      presetIds: ['stcw-psc'],
      checklistKey: 'profInSurvivalCraft',
    });
  }

  const docs: ApplicationRequirementDef[] = [
    {
      id: 'attestedPassport',
      label: 'Attested passport copy',
      kind: 'document',
      checklistKey: 'attestedPassport',
    },
    {
      id: 'passportPhoto',
      label: 'Passport photos',
      kind: 'document',
      checklistKey: 'passportPhoto',
    },
    {
      id: 'dischargeBookOrCd',
      label: 'Discharge book / certificates of discharge',
      kind: 'document',
      checklistKey: 'dischargeBookOrCd',
    },
    {
      id: 'payment',
      label: 'Application fee ready',
      kind: 'document',
      checklistKey: 'payment',
    },
    {
      id: 'seaServiceTestimonials',
      label: 'Sea service testimonials',
      kind: 'document',
      checklistKey: 'seaServiceTestimonials',
    },
    {
      id: isEtr ? 'electroTechnicalTraining' : 'watchRatingTrainingRecordBook',
      label: isEtr ? 'Electro-technical training evidence' : 'Watch Rating Training Record Book',
      kind: 'document',
      checklistKey: isEtr ? 'electroTechnicalTraining' : 'watchRatingTrainingRecordBook',
    },
    {
      id: isEtr ? 'electroTechnicalRecordBook' : 'mntb',
      label: isEtr ? 'Electro-technical record book' : 'MNTB (if applicable)',
      kind: 'document',
      checklistKey: isEtr ? 'electroTechnicalRecordBook' : 'mntb',
      optional: !isEtr,
    },
    {
      id: 'sea_service',
      label: 'Approved sea service (~180 days)',
      kind: 'sea_service',
    },
    {
      id: 'watch_hours',
      label: 'Watchkeeping hours logged',
      kind: 'watch_hours',
      optional: true,
    },
  ];

  return [...certs, ...docs];
}

export function evaluateApplicationRequirements(
  defs: ApplicationRequirementDef[],
  ctx: ApplicationProgressContext,
): ApplicationProgressSummary {
  const route = getOowRouteRequirements(ctx.oowTrainingRoute || 'examination');
  const seaTarget =
    ctx.oowTrainingRoute != null ? route.seaDays : NAV_WATCH_REQUIRED_SEA_DAYS;
  const watchTarget = route.watchkeepingDays;
  const seaCoverage = selectTestimonialsCoveringSeaDays(ctx.testimonials, seaTarget);
  const watchSummary = summariseBridgeWatchkeepingDays(
    ctx.watchLogs || [],
    ctx.userId || '',
  );

  const items: ApplicationRequirementStatus[] = defs.map((def) => {
    if (def.kind === 'certificate' && def.presetIds?.length) {
      const match = findMatchingCertificate(ctx.certificates, def.presetIds);
      const name =
        (match as any)?.certificate_name ||
        (match as any)?.certificateName ||
        null;
      return {
        ...def,
        met: !!match,
        detail: match
          ? `On file${name ? `: ${name}` : ''}`
          : `Not found in Certificates (need ${certLabel(def.presetIds)})`,
        matchedCertificateName: name,
      };
    }

    if (def.kind === 'document') {
      const ticked = !!(def.checklistKey && ctx.checklist?.[def.checklistKey]);
      // Sea-service testimonials: also treat approved testimonials as evidence
      if (def.checklistKey === 'seaServiceTestimonials') {
        const hasApproved = ctx.testimonials.some((t) => t.status === 'approved');
        const met = ticked || hasApproved;
        return {
          ...def,
          met,
          detail: met
            ? hasApproved
              ? `Approved testimonials on file (${seaCoverage.availableDays} sea days)`
              : 'Marked ready on checklist'
            : 'No approved testimonials yet — request them under Testimonials',
        };
      }
      return {
        ...def,
        met: ticked,
        detail: ticked ? 'Marked ready' : 'Not marked yet',
      };
    }

    if (def.kind === 'sea_service') {
      const met = seaCoverage.availableDays >= seaTarget;
      return {
        ...def,
        met,
        detail: `${seaCoverage.availableDays} / ~${seaTarget} approved sea days`,
      };
    }

    if (def.kind === 'watchkeeping') {
      const met = watchSummary.watchkeepingDays >= watchTarget;
      return {
        ...def,
        met,
        detail: `${watchSummary.watchkeepingDays} / ~${watchTarget} bridge watchkeeping days`,
      };
    }

    if (def.kind === 'watch_hours') {
      const hoursFromForm = Number(ctx.watchkeepingHours || 0);
      const hoursFromLogs = summariseBridgeWatchkeepingDays(
        ctx.watchLogs || [],
        ctx.userId || '',
      ).totalHours;
      const hours = hoursFromForm > 0 ? hoursFromForm : hoursFromLogs;
      const met = hours > 0;
      return {
        ...def,
        met,
        detail: met ? `${hours} hours from watch log` : 'No watchkeeping hours filled yet',
      };
    }

    return { ...def, met: false, detail: 'Unknown requirement' };
  });

  const required = items.filter((i) => !i.optional);
  const optional = items.filter((i) => i.optional);
  const metRequired = required.filter((i) => i.met).length;
  const totalRequired = required.length;
  const percent =
    totalRequired === 0 ? 100 : Math.round((metRequired / totalRequired) * 100);

  return {
    items,
    metRequired,
    totalRequired,
    metOptional: optional.filter((i) => i.met).length,
    totalOptional: optional.length,
    percent,
  };
}

/** Auto-tick checklist keys for certificates the user already holds. */
export function checklistDefaultsFromCertificates(
  defs: ApplicationRequirementDef[],
  certificates: CertificateMatchInput[],
  existing?: Record<string, boolean | undefined> | null,
): Record<string, boolean> {
  const next: Record<string, boolean> = { ...(existing as any) };
  for (const def of defs) {
    if (def.kind !== 'certificate' || !def.checklistKey || !def.presetIds?.length) continue;
    if (findMatchingCertificate(certificates, def.presetIds)) {
      next[def.checklistKey] = true;
    }
  }
  return next;
}

export function certificateRequirementDefs(
  defs: ApplicationRequirementDef[],
): ApplicationRequirementDef[] {
  return defs.filter((d) => d.kind === 'certificate');
}
