'use client';

import Link from 'next/link';
import { CheckCircle2, Circle, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import type { ApplicationProgressSummary, ApplicationRequirementStatus } from '@/lib/application-requirements';

function StatusIcon({ met }: { met: boolean }) {
  return met ? (
    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
  ) : (
    <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
  );
}

export function ApplicationRequirementRows({
  items,
  certificatesOnly = false,
  className,
}: {
  items: ApplicationRequirementStatus[];
  certificatesOnly?: boolean;
  className?: string;
}) {
  const rows = certificatesOnly ? items.filter((i) => i.kind === 'certificate') : items;
  if (rows.length === 0) return null;

  return (
    <ul className={cn('space-y-1.5', className)}>
      {rows.map((item) => (
        <li
          key={item.id}
          className={cn(
            'flex items-start gap-2 rounded-md border px-2.5 py-2 text-xs',
            item.met
              ? 'border-emerald-500/25 bg-emerald-500/5'
              : 'border-border bg-muted/30',
          )}
        >
          <StatusIcon met={item.met} />
          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-medium text-foreground">{item.label}</span>
              {item.optional ? (
                <Badge variant="outline" className="h-4 px-1 text-[9px] font-normal">
                  Optional
                </Badge>
              ) : null}
              <Badge
                variant="outline"
                className={cn(
                  'h-4 px-1 text-[9px] font-normal',
                  item.met
                    ? 'border-emerald-500/40 text-emerald-700 dark:text-emerald-300'
                    : 'text-muted-foreground',
                )}
              >
                {item.met ? 'Have' : 'Missing'}
              </Badge>
            </div>
            <p className="text-[10px] text-muted-foreground">{item.detail}</p>
            {item.hint ? (
              <p className="text-[10px] text-muted-foreground/80">{item.hint}</p>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ApplicationProgressPanel({
  progress,
  title = 'Application progress',
  showCertificatesCta = true,
  certificatesOnly = false,
  className,
}: {
  progress: ApplicationProgressSummary;
  title?: string;
  showCertificatesCta?: boolean;
  certificatesOnly?: boolean;
  className?: string;
}) {
  const missingCerts = progress.items.filter(
    (i) => i.kind === 'certificate' && !i.met && !i.optional,
  );

  return (
    <div className={cn('space-y-3 rounded-md border border-border bg-muted/40 p-3', className)}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-0.5">
          <p className="text-xs font-medium">{title}</p>
          <p className="text-[10px] text-muted-foreground">
            {progress.metRequired} of {progress.totalRequired} required items ready
            {progress.totalOptional > 0
              ? ` · ${progress.metOptional}/${progress.totalOptional} optional`
              : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {progress.percent}%
          </span>
          {showCertificatesCta && missingCerts.length > 0 ? (
            <Link
              href="/dashboard/certificates"
              className="inline-flex items-center gap-1 text-[10px] font-medium text-primary underline hover:no-underline"
            >
              Add certificates
              <ExternalLink className="h-3 w-3" />
            </Link>
          ) : null}
        </div>
      </div>
      <Progress value={progress.percent} className="h-1.5" />
      <ApplicationRequirementRows
        items={progress.items}
        certificatesOnly={certificatesOnly}
      />
    </div>
  );
}
