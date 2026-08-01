'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FileText,
  FolderArchive,
  Info,
  Loader2,
  Plus,
  Sparkles,
  Target,
  UserRound,
} from 'lucide-react';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useSupabase } from '@/supabase';
import { bearerHeaders } from '@/lib/applications/client';
import type {
  ApplicationTemplate,
  CertificateValidityStatus,
  CrewApplication,
} from '@/lib/applications/types';
import { CAREER_LEVEL_LABELS, type CareerLevel } from '@/lib/applications/career-path';
import { cn } from '@/lib/utils';

type CertificateCheck = {
  requirementId: string;
  title: string;
  met: boolean;
  status: CertificateValidityStatus;
  detail: string;
};

type PublishedTemplate = ApplicationTemplate & {
  myApplication: CrewApplication | null;
  isNextStep?: boolean;
  isRelevant?: boolean;
  certificateChecks?: CertificateCheck[];
};

type CareerContext = {
  position: string | null;
  track: string;
  level: string;
  label: string;
  nextLevel: string | null;
  nextLabel: string | null;
  summary: string;
};

function orgInitials(organization: string): string {
  const parts = organization.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'APP';
  if (parts.length === 1) return parts[0].slice(0, 3).toUpperCase();
  return parts
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
}

function certBadgeClasses(status: CertificateValidityStatus): string {
  if (status === 'valid' || status === 'no_expiry') {
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
  }
  if (status === 'expiring_soon') {
    return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300';
  }
  return 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300';
}

function certBadgeLabel(status: CertificateValidityStatus): string {
  switch (status) {
    case 'valid':
      return 'Valid';
    case 'no_expiry':
      return 'On file';
    case 'expiring_soon':
      return 'Renew soon';
    case 'expired':
      return 'Expired';
    default:
      return 'Missing';
  }
}

export default function ApplyPage() {
  const { toast } = useToast();
  const { session, isUserLoading } = useSupabase();
  const accessToken = session?.access_token;
  const [templates, setTemplates] = React.useState<PublishedTemplate[]>([]);
  const [career, setCareer] = React.useState<CareerContext | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [startingId, setStartingId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!accessToken) {
      if (!isUserLoading) setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/applications/published', {
        headers: bearerHeaders(accessToken),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load applications');
      setTemplates(json.templates || []);
      setCareer(json.career || null);
    } catch (e) {
      toast({
        title: 'Could not load applications',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [accessToken, isUserLoading, toast]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function startApplication(templateId: string) {
    if (!accessToken) {
      toast({
        title: 'Not signed in',
        description: 'Refresh the page and try again.',
        variant: 'destructive',
      });
      return;
    }
    setStartingId(templateId);
    try {
      const res = await fetch('/api/applications/start', {
        method: 'POST',
        headers: bearerHeaders(accessToken, {
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({ templateId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not start');
      window.location.href = `/dashboard/apply/${templateId}`;
    } catch (e) {
      toast({
        title: 'Could not start application',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
      setStartingId(null);
    }
  }

  const inProgress = templates.filter((t) => t.myApplication);
  const availableToStart = templates.filter((t) => !t.myApplication);
  const recommendedAvailable = availableToStart.filter((t) => t.isNextStep);
  const otherAvailable = availableToStart.filter((t) => !t.isNextStep);

  const defaultExpanded = React.useMemo(
    () => inProgress.slice(0, 2).map((t) => t.id),
    [inProgress],
  );

  return (
    <div className="space-y-8">
      {/* Header + Start dropdown */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 max-w-2xl">
          <h1 className="text-3xl font-bold tracking-tight">Apply</h1>
          <p className="mt-1.5 text-muted-foreground">
            Expand an application for a quick progress check, or open the full
            checklist for details.
          </p>
        </div>

        <StartApplicationMenu
          recommended={recommendedAvailable}
          other={otherAvailable}
          startingId={startingId}
          loading={loading}
          onStart={startApplication}
        />
      </div>

      {/* Compact career strip */}
      {!loading && career ? (
        <section className="flex flex-col gap-3 rounded-2xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <UserRound className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Current
              </p>
              <p className="truncate font-medium">
                {career.position || 'Position not set'}
              </p>
            </div>
          </div>
          <ArrowRight className="hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" />
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-300">
              <Target className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-wide text-sky-700/80 dark:text-sky-300/80">
                Next ticket
              </p>
              <p className="truncate font-medium">
                {career.nextLabel || 'Not mapped yet'}
              </p>
            </div>
          </div>
          {!career.position ? (
            <Button asChild size="sm" variant="outline" className="sm:ml-auto">
              <Link href="/dashboard/profile">Set position</Link>
            </Button>
          ) : career.summary ? (
            <p className="flex max-w-md items-start gap-1.5 text-xs text-muted-foreground sm:ml-auto">
              <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-600 dark:text-sky-400" />
              <span className="line-clamp-2">{career.summary}</span>
            </p>
          ) : null}
        </section>
      ) : loading ? (
        <Skeleton className="h-16 w-full rounded-2xl" />
      ) : null}

      {/* Ongoing applications */}
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
        </div>
      ) : inProgress.length === 0 ? (
        <div className="rounded-2xl border border-dashed px-6 py-16 text-center">
          <FolderArchive className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <h2 className="mt-4 text-lg font-semibold">No applications started</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Use <span className="font-medium text-foreground">Start application</span>{' '}
            above to pick a package. Recommended options for your next ticket
            appear first.
          </p>
          {availableToStart.length === 0 && templates.length === 0 ? (
            <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
              Nothing is published yet — ask an admin to publish an application
              template.
            </p>
          ) : null}
          {career?.nextLabel &&
          recommendedAvailable.length === 0 &&
          availableToStart.length > 0 ? (
            <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
              No package is tagged for{' '}
              <span className="font-medium text-foreground">
                {career.nextLabel}
              </span>{' '}
              yet — you can still start another published application.
            </p>
          ) : null}
        </div>
      ) : (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Your applications
            </h2>
            <span className="text-xs tabular-nums text-muted-foreground">
              {inProgress.length} ongoing
            </span>
          </div>

          <Accordion
            type="multiple"
            defaultValue={defaultExpanded}
            className="rounded-2xl border bg-card"
          >
            {inProgress.map((template, index) => (
              <OngoingApplicationRow
                key={template.id}
                template={template}
                isLast={index === inProgress.length - 1}
              />
            ))}
          </Accordion>

          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            SeaJourney prepares a ZIP package — you still submit through the
            organisation&apos;s official channel.
          </p>
        </section>
      )}
    </div>
  );
}

function StartApplicationMenu({
  recommended,
  other,
  startingId,
  loading,
  onStart,
}: {
  recommended: PublishedTemplate[];
  other: PublishedTemplate[];
  startingId: string | null;
  loading: boolean;
  onStart: (id: string) => void;
}) {
  const hasAny = recommended.length > 0 || other.length > 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="shrink-0 gap-2" disabled={loading || !!startingId}>
          {startingId ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          Start application
          <ChevronDown className="h-4 w-4 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(100vw-2rem,22rem)]">
        {!hasAny ? (
          <div className="px-2 py-3 text-sm text-muted-foreground">
            No new applications available to start.
          </div>
        ) : (
          <>
            {recommended.length > 0 ? (
              <>
                <DropdownMenuLabel className="flex items-center gap-1.5 text-sky-700 dark:text-sky-300">
                  <Target className="h-3.5 w-3.5" />
                  Recommended
                </DropdownMenuLabel>
                {recommended.map((t) => (
                  <StartMenuItem
                    key={t.id}
                    template={t}
                    startingId={startingId}
                    onStart={onStart}
                    highlight
                  />
                ))}
                {other.length > 0 ? <DropdownMenuSeparator /> : null}
              </>
            ) : null}
            {other.length > 0 ? (
              <>
                <DropdownMenuLabel>
                  {recommended.length > 0 ? 'Other packages' : 'Available packages'}
                </DropdownMenuLabel>
                {other.map((t) => (
                  <StartMenuItem
                    key={t.id}
                    template={t}
                    startingId={startingId}
                    onStart={onStart}
                  />
                ))}
              </>
            ) : null}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function StartMenuItem({
  template,
  startingId,
  onStart,
  highlight,
}: {
  template: PublishedTemplate;
  startingId: string | null;
  onStart: (id: string) => void;
  highlight?: boolean;
}) {
  const targetLabel =
    template.target_level && template.target_level !== 'other'
      ? CAREER_LEVEL_LABELS[template.target_level as CareerLevel] ||
        template.target_level
      : null;
  const busy = startingId === template.id;

  return (
    <DropdownMenuItem
      disabled={!!startingId}
      className="cursor-pointer flex-col items-start gap-0.5 py-2.5"
      onSelect={(e) => {
        e.preventDefault();
        onStart(template.id);
      }}
    >
      <div className="flex w-full items-center gap-2">
        <span
          className={cn(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-[10px] font-bold',
            highlight && 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300',
          )}
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            orgInitials(template.organization)
          )}
        </span>
        <span className="min-w-0 flex-1 truncate font-medium">
          {template.title}
        </span>
        {highlight ? (
          <Badge className="shrink-0 bg-sky-500/15 text-[10px] text-sky-700 hover:bg-sky-500/15 dark:text-sky-300">
            Next
          </Badge>
        ) : null}
      </div>
      <span className="pl-9 text-xs text-muted-foreground">
        {template.organization}
        {targetLabel ? ` · ${targetLabel}` : ''}
      </span>
    </DropdownMenuItem>
  );
}

function OngoingApplicationRow({
  template,
  isLast,
}: {
  template: PublishedTemplate;
  isLast: boolean;
}) {
  const progress = template.myApplication?.progress_pct ?? 0;
  const ready = template.myApplication?.status === 'ready';
  const reqCount = template.requirements?.length ?? 0;
  const certChecks = template.certificateChecks || [];
  const targetLabel =
    template.target_level && template.target_level !== 'other'
      ? CAREER_LEVEL_LABELS[template.target_level as CareerLevel] ||
        template.target_level
      : null;
  const certOk = certChecks.filter(
    (c) => c.status === 'valid' || c.status === 'no_expiry',
  ).length;

  return (
    <AccordionItem
      value={template.id}
      className={cn('border-b px-4 sm:px-5', isLast && 'border-b-0')}
    >
      <AccordionTrigger className="hover:no-underline py-4">
        <div className="flex min-w-0 flex-1 items-center gap-3 pr-3 text-left">
          <div
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-[11px] font-bold',
              ready
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                : 'bg-muted/50',
            )}
          >
            {orgInitials(template.organization)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate font-semibold">{template.title}</span>
              <Badge
                variant="secondary"
                className={cn(
                  'text-[10px]',
                  ready &&
                    'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
                )}
              >
                {ready ? 'Ready' : 'In progress'}
              </Badge>
              {template.isNextStep ? (
                <Badge className="bg-sky-500/15 text-[10px] text-sky-700 hover:bg-sky-500/15 dark:text-sky-300">
                  Next step
                </Badge>
              ) : null}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>{template.organization}</span>
              <span className="tabular-nums">{progress}% complete</span>
              {certChecks.length > 0 ? (
                <span className="tabular-nums">
                  Certs {certOk}/{certChecks.length}
                </span>
              ) : null}
            </div>
          </div>
          <div className="hidden w-28 shrink-0 sm:block">
            <Progress value={progress} className="h-1.5" />
          </div>
        </div>
      </AccordionTrigger>

      <AccordionContent className="pb-5">
        <div className="space-y-4 rounded-xl border bg-muted/20 p-4 sm:ml-[3.25rem]">
          <div className="sm:hidden">
            <div className="mb-1.5 flex justify-between text-xs text-muted-foreground">
              <span>Progress</span>
              <span className="tabular-nums font-medium text-foreground">
                {progress}%
              </span>
            </div>
            <Progress value={progress} className="h-1.5" />
          </div>

          {template.description ? (
            <p className="text-sm text-muted-foreground">{template.description}</p>
          ) : null}

          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-background px-2 py-1 ring-1 ring-border">
              <FileText className="h-3.5 w-3.5" />
              {reqCount} requirement{reqCount === 1 ? '' : 's'}
            </span>
            {(template.files?.length ?? 0) > 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-md bg-background px-2 py-1 ring-1 ring-border">
                <FolderArchive className="h-3.5 w-3.5" />
                {template.files!.length} file
                {template.files!.length === 1 ? '' : 's'}
              </span>
            ) : null}
            {targetLabel ? (
              <span className="inline-flex items-center gap-1.5 rounded-md bg-background px-2 py-1 ring-1 ring-border">
                <Target className="h-3.5 w-3.5" />
                {targetLabel}
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1.5 rounded-md bg-background px-2 py-1 ring-1 ring-border">
              {ready ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              ) : (
                <Clock3 className="h-3.5 w-3.5 text-amber-500" />
              )}
              {ready ? 'Ready to download package' : 'Keep working the checklist'}
            </span>
          </div>

          {certChecks.length > 0 ? (
            <div>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Required certificates
              </p>
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {certChecks.map((check) => (
                  <li
                    key={check.requirementId}
                    className="flex items-center justify-between gap-2 rounded-lg bg-background px-2.5 py-2 text-xs ring-1 ring-border"
                  >
                    <span className="min-w-0 truncate font-medium">
                      {check.title}
                    </span>
                    <Badge
                      variant="outline"
                      className={cn(
                        'shrink-0 text-[10px]',
                        certBadgeClasses(check.status),
                      )}
                    >
                      {certBadgeLabel(check.status)}
                    </Badge>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2 pt-1">
            <Button asChild>
              <Link href={`/dashboard/apply/${template.id}`}>
                Open full details
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/dashboard/certificates">Certificates</Link>
            </Button>
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
