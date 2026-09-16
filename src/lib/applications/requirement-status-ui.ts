import type {
  CertificateValidityStatus,
  RequirementEvaluation,
} from '@/lib/applications/types';

/** Visual tone for a requirements-checklist row. */
export type RequirementRowTone =
  | 'verified'
  | 'on_file_hold'
  | 'expired'
  | 'expiring'
  | 'outstanding'
  | 'neutral';

export function certificateStatusLabel(
  status?: CertificateValidityStatus,
): string {
  switch (status) {
    case 'valid':
      return 'Valid';
    case 'no_expiry':
      return 'On file';
    case 'expiring_soon':
      return 'Renew soon';
    case 'expired':
      return 'Expired';
    case 'insufficient_hold':
      return 'Holding period';
    case 'missing':
      return 'Missing';
    default:
      return 'Check';
  }
}

export function certificateStatusClasses(
  status?: CertificateValidityStatus,
): string {
  switch (status) {
    case 'valid':
    case 'no_expiry':
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
    case 'insufficient_hold':
      return 'border-sky-500/30 bg-sky-500/10 text-sky-800 dark:text-sky-300';
    case 'expiring_soon':
      return 'border-orange-500/30 bg-orange-500/10 text-orange-800 dark:text-orange-300';
    case 'expired':
      return 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300';
    case 'missing':
      return 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200';
    default:
      return 'border-muted-foreground/20 bg-muted text-muted-foreground';
  }
}

export function requirementRowTone(
  item: RequirementEvaluation,
  complete = false,
): RequirementRowTone {
  if (complete || item.met) {
    if (item.certificateStatus === 'expiring_soon') return 'expiring';
    return 'verified';
  }

  if (item.requirementType === 'certificate') {
    if (item.certificateStatus === 'expired') return 'expired';
    if (item.certificateStatus === 'expiring_soon') return 'expiring';
    if (item.certificateStatus === 'insufficient_hold') return 'on_file_hold';
    if (
      item.certificateStatus !== 'missing' &&
      (item.matchedCertificates?.length ?? 0) > 0
    ) {
      return 'on_file_hold';
    }
  }

  // Partial progress (e.g. sea time, prior ticket hold period)
  if (
    typeof item.current === 'number' &&
    typeof item.target === 'number' &&
    item.current > 0 &&
    item.current < item.target
  ) {
    return 'on_file_hold';
  }

  return 'outstanding';
}

export function requirementRowToneClasses(tone: RequirementRowTone): string {
  switch (tone) {
    case 'verified':
      return 'bg-emerald-500/[0.08]';
    case 'on_file_hold':
      return 'bg-sky-500/[0.08]';
    case 'expired':
      return 'bg-red-500/[0.07]';
    case 'expiring':
      return 'bg-orange-500/[0.08]';
    case 'outstanding':
      return 'bg-amber-500/[0.05]';
    default:
      return '';
  }
}

export function requirementDetailToneClasses(tone: RequirementRowTone): string {
  switch (tone) {
    case 'verified':
      return 'text-emerald-800/90 dark:text-emerald-300/90';
    case 'on_file_hold':
      return 'text-sky-900/85 dark:text-sky-100/85';
    case 'expired':
      return 'text-red-800/90 dark:text-red-200/90';
    case 'expiring':
      return 'text-orange-900/85 dark:text-orange-100/85';
    case 'outstanding':
      return 'text-amber-900/80 dark:text-amber-100/80';
    default:
      return 'text-muted-foreground';
  }
}
