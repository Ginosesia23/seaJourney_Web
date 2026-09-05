import type {
  ApplicationRequirement,
  CertificateValidityStatus,
  MatchedCertificateSummary,
  RequirementConfig,
  RequirementEvaluation,
} from '@/lib/applications/types';
import {
  filterCertificatesForRequirement,
  type CertificateMatchInput,
} from '@/lib/certificates/match';
import type { CertificatePreset } from '@/lib/certificates/presets';
import { CERTIFICATE_PRESETS } from '@/lib/certificates/presets';

type ProfileRow = Record<string, unknown> & {
  id?: string;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  nationality?: string | null;
  date_of_birth?: string | null;
  discharge_book_number?: string | null;
  telephone?: string | null;
  address_line1?: string | null;
  firstName?: string | null;
  lastName?: string | null;
};

type CertificateRow = CertificateMatchInput & {
  issue_date?: string | null;
  issueDate?: string | null;
  expiry_date?: string | null;
  expiryDate?: string | null;
  renewal_notice_days?: number | null;
  renewalNoticeDays?: number | null;
  renewal_required?: boolean | null;
  renewalRequired?: boolean | null;
};

type TestimonialRow = {
  id: string;
  status: string;
  at_sea_days?: number | null;
  total_days?: number | null;
  standby_days?: number | null;
};

type ProofRow = { id: string };

export type MilestoneProgressSnapshot = {
  label: string;
  levelKey: string;
  allRequiredMet: boolean;
  achievedAt: string | null;
};

export type EvaluationContext = {
  profile: ProfileRow | null;
  certificates: CertificateRow[];
  testimonials: TestimonialRow[];
  proofOfService: ProofRow[];
  /** Documented totals from approved testimonials */
  documentedSea: { atSeaDays: number; totalDays: number; standbyDays: number };
  /** Live tracked totals from state logs (optional) */
  trackedSea?: { atSeaDays: number; totalDays: number; standbyDays: number } | null;
  completedManualIds: Set<string>;
  /** Progress on other milestones (for prior_milestone requirements) */
  milestoneProgress?: Record<string, MilestoneProgressSnapshot>;
  milestoneByLevelKey?: Record<string, string>;
  /** Admin catalog for preset matching (falls back to seed). */
  certificateCatalog?: CertificatePreset[];
};

function stringField(profile: ProfileRow | null, key: string): string {
  if (!profile) return '';
  const camel = key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
  const raw = profile[key] ?? profile[camel];
  return typeof raw === 'string' && raw.trim() ? raw.trim() : '';
}

function certName(c: CertificateRow): string {
  return (c.certificate_name || c.certificateName || '').toString();
}

function certType(c: CertificateRow): string {
  return (c.certificate_type || c.certificateType || '').toString();
}

function certExpiry(c: CertificateRow): string | null {
  const v = c.expiry_date ?? c.expiryDate;
  return typeof v === 'string' && v ? v : null;
}

function certIssueDate(c: CertificateRow): string | null {
  const v = c.issue_date ?? c.issueDate;
  return typeof v === 'string' && v ? v : null;
}

function monthsSince(isoDate: string): number {
  const start = new Date(isoDate);
  if (Number.isNaN(start.getTime())) return 0;
  const now = new Date();
  let months =
    (now.getFullYear() - start.getFullYear()) * 12 +
    (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) months -= 1;
  return Math.max(0, months);
}

function certNoticeDays(c: CertificateRow): number {
  const v = c.renewal_notice_days ?? c.renewalNoticeDays;
  return typeof v === 'number' && v > 0 ? v : 90;
}

function daysUntil(expiry: string | null): number | null {
  if (!expiry) return null;
  const d = new Date(`${expiry}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function classifyCertificateValidity(
  expiry: string | null,
  noticeDays = 90,
): CertificateValidityStatus {
  if (!expiry) return 'no_expiry';
  const days = daysUntil(expiry);
  if (days === null) return 'no_expiry';
  if (days < 0) return 'expired';
  if (days <= noticeDays) return 'expiring_soon';
  return 'valid';
}

function hrefForType(type: ApplicationRequirement['requirement_type']): string | undefined {
  switch (type) {
    case 'profile_fields':
      return '/dashboard/profile';
    case 'certificate':
      return '/dashboard/certificates';
    case 'testimonial':
    case 'sea_time_min':
      return '/dashboard/career-documents?tab=testimonials';
    case 'proof_of_service':
      return '/dashboard/career-documents?tab=proof';
    case 'prior_milestone':
      return '/dashboard/career-progress';
    default:
      return undefined;
  }
}

function certificateHref(config: RequirementConfig): string {
  const params = new URLSearchParams();
  params.set('add', '1');
  if (config.presetId) params.set('preset', config.presetId);
  if (config.nameContains) params.set('name', config.nameContains);
  if (config.certificateType) params.set('type', config.certificateType);
  return `/dashboard/certificates?${params.toString()}`;
}

function filterMatchingCertificates(
  certificates: CertificateRow[],
  config: RequirementConfig,
  catalog: CertificatePreset[] = CERTIFICATE_PRESETS,
): CertificateRow[] {
  return filterCertificatesForRequirement(
    certificates,
    config,
    catalog,
  ) as CertificateRow[];
}

function summarizeMatched(
  matches: CertificateRow[],
): MatchedCertificateSummary[] {
  return matches.map((c) => {
    const expiry = certExpiry(c);
    const status = classifyCertificateValidity(expiry, certNoticeDays(c));
    return {
      id: c.id,
      name: certName(c) || 'Certificate',
      expiryDate: expiry,
      status,
      daysUntilExpiry: daysUntil(expiry),
    };
  });
}

function worstStatus(
  statuses: CertificateValidityStatus[],
): CertificateValidityStatus {
  if (statuses.length === 0) return 'missing';
  if (statuses.includes('expired')) return 'expired';
  if (statuses.includes('expiring_soon')) return 'expiring_soon';
  if (statuses.every((s) => s === 'no_expiry')) return 'no_expiry';
  return 'valid';
}

function evaluateOne(
  req: ApplicationRequirement,
  ctx: EvaluationContext,
): RequirementEvaluation {
  const config: RequirementConfig = req.config || {};
  const base = {
    requirementId: req.id,
    title: req.title,
    description: req.description,
    requirementType: req.requirement_type,
    isRequired: req.is_required,
    config,
    href: hrefForType(req.requirement_type),
  };

  switch (req.requirement_type) {
    case 'profile_fields': {
      const fields = config.fields?.length
        ? config.fields
        : ['first_name', 'last_name', 'email', 'nationality', 'date_of_birth'];
      const missing = fields.filter((f) => !stringField(ctx.profile, f));
      const present = fields.filter((f) => stringField(ctx.profile, f));
      const met = missing.length === 0;
      return {
        ...base,
        met,
        current: present.length,
        target: fields.length,
        detail: met
          ? `Profile complete: ${present.map((f) => f.replace(/_/g, ' ')).join(', ')}`
          : `Missing on profile: ${missing.join(', ').replace(/_/g, ' ')}`,
      };
    }
    case 'certificate': {
      const minCount = Math.max(1, config.minCount ?? 1);
      // Default: expired certificates do not satisfy the requirement
      const mustNotExpired = config.mustNotExpired !== false;
      const allMatches = filterMatchingCertificates(
        ctx.certificates,
        config,
        ctx.certificateCatalog || CERTIFICATE_PRESETS,
      );
      const matchedCertificates = summarizeMatched(allMatches);
      const validMatches = matchedCertificates.filter(
        (c) => c.status !== 'expired',
      );
      const counting = mustNotExpired ? validMatches : matchedCertificates;
      const minMonthsHeld = Math.max(0, config.minMonthsHeld ?? 0);
      let monthsHeld = 0;
      if (minMonthsHeld > 0 && counting.length > 0) {
        const issueDates = allMatches
          .filter((c) =>
            counting.some((v) => v.id === c.id),
          )
          .map((c) => certIssueDate(c))
          .filter((d): d is string => Boolean(d));
        if (issueDates.length > 0) {
          const earliest = issueDates.sort()[0];
          monthsHeld = monthsSince(earliest);
        }
      }
      const durationMet = minMonthsHeld === 0 || monthsHeld >= minMonthsHeld;
      const met = counting.length >= minCount && durationMet;
      const certificateStatus = met
        ? worstStatus(counting.map((c) => c.status))
        : allMatches.length === 0
          ? 'missing'
          : worstStatus(matchedCertificates.map((c) => c.status));

      let detail: string;
      if (allMatches.length === 0) {
        detail = `No matching certificate on your Certificates page — add ${minCount === 1 ? 'one' : `${minCount}`} that matches this requirement`;
      } else if (!met && mustNotExpired && allMatches.length > 0) {
        const expiredOnly = matchedCertificates.every(
          (c) => c.status === 'expired',
        );
        detail = expiredOnly
          ? 'Found on file but expired — renew and update the dates'
          : `${counting.length} of ${minCount} valid matching certificate${minCount === 1 ? '' : 's'}`;
      } else if (certificateStatus === 'expiring_soon') {
        const soon = counting.find((c) => c.status === 'expiring_soon');
        const days = soon?.daysUntilExpiry;
        detail =
          days != null
            ? `On file — renew soon (${days} day${days === 1 ? '' : 's'} left)`
            : 'On file — renew soon';
      } else if (certificateStatus === 'expired') {
        detail = 'On file but expired — renew to stay compliant';
      } else if (certificateStatus === 'no_expiry') {
        const names = counting.map((c) => c.name).join(', ');
        detail = names
          ? `On file: ${names}`
          : `${counting.length} matching certificate${counting.length === 1 ? '' : 's'} on file (no expiry date)`;
      } else {
        const names = counting.map((c) => c.name).join(', ');
        detail = names
          ? `On file: ${names}`
          : `${counting.length} matching certificate${counting.length === 1 ? '' : 's'} on file and valid`;
      }

      if (minMonthsHeld > 0) {
        detail = durationMet
          ? `${detail} — held ${monthsHeld} months (required ${minMonthsHeld})`
          : counting.length >= minCount
            ? `Certificate on file — ${monthsHeld} of ${minMonthsHeld} months held`
            : detail;
      }

      return {
        ...base,
        met,
        current: minMonthsHeld > 0 ? monthsHeld : counting.length,
        target: minMonthsHeld > 0 ? minMonthsHeld : minCount,
        detail,
        href: certificateHref(config),
        certificateStatus,
        matchedCertificates,
      };
    }
    case 'testimonial': {
      const minCount = Math.max(1, config.minCount ?? 1);
      const status = (config.status || 'approved').toLowerCase();
      let matches = ctx.testimonials.filter((t) => t.status === status);
      if (typeof config.minAtSeaDays === 'number' && config.minAtSeaDays > 0) {
        matches = matches.filter((t) => (t.at_sea_days ?? 0) >= config.minAtSeaDays!);
      }
      const met = matches.length >= minCount;
      return {
        ...base,
        met,
        current: matches.length,
        target: minCount,
        detail: met
          ? `${matches.length} ${status} testimonial${matches.length === 1 ? '' : 's'} in your account`
          : `${matches.length} of ${minCount} ${status} testimonial${minCount === 1 ? '' : 's'} in your account`,
      };
    }
    case 'proof_of_service': {
      const minCount = Math.max(1, config.minCount ?? 1);
      const count = ctx.proofOfService.length;
      const met = count >= minCount;
      return {
        ...base,
        met,
        current: count,
        target: minCount,
        detail: met
          ? `${count} proof of service record${count === 1 ? '' : 's'}`
          : `${count} of ${minCount} proof of service record${minCount === 1 ? '' : 's'}`,
      };
    }
    case 'sea_time_min': {
      const min = Math.max(0, config.min ?? 0);
      const metric = config.metric || 'atSeaDays';
      const source = config.source || 'testimonials';
      const pool =
        source === 'tracked' && ctx.trackedSea
          ? ctx.trackedSea
          : ctx.documentedSea;
      const current =
        metric === 'totalDays'
          ? pool.totalDays
          : metric === 'standbyDays'
            ? pool.standbyDays
            : pool.atSeaDays;
      const label =
        metric === 'totalDays'
          ? 'total service days'
          : metric === 'standbyDays'
            ? 'standby days'
            : 'at-sea days';
      const sourceLabel =
        source === 'tracked' ? 'tracked logs' : 'approved testimonials';
      const met = current >= min;
      return {
        ...base,
        met,
        current,
        target: min,
        detail: `${current} / ${min} ${label} (${sourceLabel})`,
        href: source === 'tracked' ? '/dashboard/export' : '/dashboard/career-documents?tab=testimonials',
      };
    }
    case 'manual_checklist': {
      const met = ctx.completedManualIds.has(req.id);
      return {
        ...base,
        met,
        detail: met
          ? 'You marked this step complete'
          : config.hint || 'Mark complete when you have finished this step',
      };
    }
    case 'external_link': {
      const met = ctx.completedManualIds.has(req.id);
      return {
        ...base,
        met,
        href: config.url || undefined,
        detail: met
          ? 'Visited / acknowledged'
          : config.label || config.url || 'Open the external link, then mark complete',
      };
    }
    case 'prior_milestone': {
      const refId =
        config.milestoneId ||
        (config.levelKey ? ctx.milestoneByLevelKey?.[config.levelKey] : undefined);
      const minMonths = Math.max(0, config.minMonths ?? 0);
      const snap = refId ? ctx.milestoneProgress?.[refId] : undefined;

      if (!refId || !snap) {
        return {
          ...base,
          met: false,
          detail: config.levelKey
            ? `Prerequisite milestone “${config.levelKey}” not found or not published`
            : 'Select a prerequisite milestone in admin',
        };
      }

      if (!snap.allRequiredMet) {
        return {
          ...base,
          met: false,
          detail: `${snap.label} — requirements not yet complete`,
          href: '/dashboard/career-progress',
        };
      }

      const months = snap.achievedAt ? monthsSince(snap.achievedAt) : 0;

      if (minMonths > 0) {
        const met = months >= minMonths;
        return {
          ...base,
          met,
          current: months,
          target: minMonths,
          detail: met
            ? `${snap.label} held for ${months} months (required ${minMonths})`
            : `${snap.label} complete — ${months} of ${minMonths} months`,
          href: '/dashboard/career-progress',
        };
      }

      return {
        ...base,
        met: true,
        detail: `${snap.label} requirements complete`,
        href: '/dashboard/career-progress',
      };
    }
    default:
      return {
        ...base,
        met: false,
        detail: 'Unknown requirement type',
      };
  }
}

export function evaluateRequirements(
  requirements: ApplicationRequirement[],
  ctx: EvaluationContext,
): RequirementEvaluation[] {
  return [...requirements]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((req) => evaluateOne(req, ctx));
}

export function progressFromEvaluations(
  evaluations: RequirementEvaluation[],
): { metRequired: number; totalRequired: number; percent: number; allRequiredMet: boolean } {
  const required = evaluations.filter((e) => e.isRequired);
  const totalRequired = required.length;
  if (totalRequired === 0) {
    return {
      metRequired: 0,
      totalRequired: 0,
      percent: 0,
      allRequiredMet: false,
    };
  }
  const metRequired = required.filter((e) => e.met).length;
  const percent = Math.round((metRequired / totalRequired) * 100);
  return {
    metRequired,
    totalRequired,
    percent,
    allRequiredMet: metRequired === totalRequired,
  };
}

export function sumDocumentedSea(testimonials: TestimonialRow[]): {
  atSeaDays: number;
  totalDays: number;
  standbyDays: number;
} {
  const approved = testimonials.filter((t) => t.status === 'approved');
  return {
    atSeaDays: approved.reduce((s, t) => s + (t.at_sea_days ?? 0), 0),
    totalDays: approved.reduce((s, t) => s + (t.total_days ?? 0), 0),
    standbyDays: approved.reduce((s, t) => s + (t.standby_days ?? 0), 0),
  };
}
