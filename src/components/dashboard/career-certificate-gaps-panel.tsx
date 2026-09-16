'use client';

import Link from 'next/link';
import { ArrowRight, Award, Target } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { CareerCertificateGap } from '@/lib/applications/career-certificate-gaps';
import {
  certificateStatusClasses,
  certificateStatusLabel,
} from '@/lib/applications/requirement-status-ui';
import { cn } from '@/lib/utils';

type Props = {
  gaps: CareerCertificateGap[];
  nextMilestoneLabel?: string | null;
  compact?: boolean;
  className?: string;
  /** Vessel/shared viewer: hide crew-only action links */
  readOnly?: boolean;
};

export function CareerCertificateGapsPanel({
  gaps,
  nextMilestoneLabel,
  compact,
  className,
  readOnly,
}: Props) {
  if (!gaps.length) return null;

  return (
    <div
      className={cn(
        'overflow-hidden rounded-md border border-amber-500/25 bg-amber-500/[0.06]',
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-amber-500/20 bg-amber-500/[0.08] px-4 py-2.5">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-amber-900 dark:text-amber-100">
            <Target className="h-3.5 w-3.5" />
            Certificates needed for career tickets
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {nextMilestoneLabel
              ? `Gaps for your path toward ${nextMilestoneLabel} and other tickets.`
              : 'Missing, expired, or not-yet-held-long-enough certificates for published tickets.'}
          </p>
        </div>
      </div>
      <ul className={cn('divide-y', compact ? 'max-h-64 overflow-y-auto' : undefined)}>
        {gaps.map((gap) => (
          <li
            key={gap.key}
            className={cn(
              'flex flex-wrap items-start justify-between gap-3 px-4 py-3',
              gap.certificateStatus === 'expired' && 'bg-red-500/[0.05]',
              gap.certificateStatus === 'expiring_soon' && 'bg-orange-500/[0.06]',
              gap.certificateStatus === 'insufficient_hold' && 'bg-sky-500/[0.06]',
            )}
          >
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Award className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="text-sm font-medium">{gap.title}</span>
                <Badge
                  variant="outline"
                  className={cn(
                    'text-[10px]',
                    certificateStatusClasses(gap.certificateStatus),
                  )}
                >
                  {certificateStatusLabel(gap.certificateStatus)}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">{gap.detail}</p>
              {gap.milestoneLabels.length > 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  For: {gap.milestoneLabels.join(' · ')}
                </p>
              ) : null}
            </div>
            {!readOnly ? (
              <Button
                asChild
                size="sm"
                variant="secondary"
                className="h-7 shrink-0 rounded-md text-xs"
              >
                <Link href={gap.href}>
                  {gap.actionLabel}
                  <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Link>
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
