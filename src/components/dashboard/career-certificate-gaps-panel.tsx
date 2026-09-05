'use client';

import Link from 'next/link';
import { ArrowRight, Award, Target } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { CareerCertificateGap } from '@/lib/applications/career-certificate-gaps';
import type { CertificateValidityStatus } from '@/lib/applications/types';
import { cn } from '@/lib/utils';

function statusClasses(status: CertificateValidityStatus): string {
  if (status === 'expired' || status === 'missing') {
    return 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200';
  }
  if (status === 'expiring_soon') {
    return 'border-orange-500/30 bg-orange-500/10 text-orange-800 dark:text-orange-200';
  }
  return 'border-muted bg-muted/40 text-muted-foreground';
}

type Props = {
  gaps: CareerCertificateGap[];
  nextMilestoneLabel?: string | null;
  compact?: boolean;
  className?: string;
};

export function CareerCertificateGapsPanel({
  gaps,
  nextMilestoneLabel,
  compact = false,
  className,
}: Props) {
  if (gaps.length === 0) return null;

  return (
    <div
      className={cn(
        'rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] p-4 sm:p-5',
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm font-medium text-amber-900 dark:text-amber-100">
            <Target className="h-4 w-4 shrink-0" />
            {nextMilestoneLabel
              ? `Certificates needed for ${nextMilestoneLabel}`
              : 'Certificates needed for your next ticket'}
          </div>
          {!compact ? (
            <p className="max-w-xl text-xs text-muted-foreground">
              Add these on your Certificates page — career progress updates
              automatically once they are on file.
            </p>
          ) : null}
        </div>
        <Button asChild variant="outline" size="sm" className="shrink-0 bg-background/80">
          <Link href="/dashboard/career-progress">
            View progress
            <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>

      <ul className={cn('mt-4 space-y-2', compact && 'mt-3')}>
        {gaps.map((gap) => (
          <li
            key={gap.key}
            className="flex flex-col gap-2 rounded-xl border bg-background/70 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Award className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="text-sm font-medium">{gap.title}</span>
                <Badge
                  variant="outline"
                  className={cn('text-[10px]', statusClasses(gap.certificateStatus))}
                >
                  {gap.certificateStatus === 'expired'
                    ? 'Expired'
                    : gap.certificateStatus === 'expiring_soon'
                      ? 'Renew soon'
                      : 'Missing'}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">{gap.detail}</p>
              {gap.milestoneLabels.length > 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  For: {gap.milestoneLabels.join(' · ')}
                </p>
              ) : null}
            </div>
            <Button asChild size="sm" variant="secondary" className="shrink-0">
              <Link href={gap.href}>
                {gap.actionLabel}
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Link>
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
