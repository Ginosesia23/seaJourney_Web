'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Award,
  CheckCircle2,
  Circle,
  ExternalLink,
  Info,
  Loader2,
  Sparkles,
  Target,
  UserRound,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  CareerProgressPageHeader,
  CareerProgressSection,
  CareerProgressStatTiles,
} from '@/components/dashboard/career-progress-page-ui';
import { CareerCertificateGapsPanel } from '@/components/dashboard/career-certificate-gaps-panel';
import { useFeatureFlags } from '@/hooks/use-feature-flags';
import { useToast } from '@/hooks/use-toast';
import { useSupabase } from '@/supabase';
import { bearerHeaders } from '@/lib/applications/client';
import type { CareerStep } from '@/lib/applications/career-path';
import type { CareerMilestone } from '@/lib/applications/milestones';
import type {
  CertificateValidityStatus,
  RequirementEvaluation,
} from '@/lib/applications/types';
import type { CareerCertificateGap } from '@/lib/applications/career-certificate-gaps';
import {
  collectCertificateGaps,
  dedupeCertificateEvaluations,
} from '@/lib/applications/career-certificate-gaps';
import { cn } from '@/lib/utils';

type MilestoneWithProgress = CareerMilestone & {
  progress: {
    percent: number;
    metRequired: number;
    totalRequired: number;
    allRequiredMet: boolean;
  } | null;
  evaluations?: RequirementEvaluation[];
};

type DocumentedSea = {
  atSeaDays: number;
  totalDays: number;
  standbyDays: number;
};

type ProgressResponse = {
  career: CareerStep;
  milestones: MilestoneWithProgress[];
  nextMilestone: CareerMilestone | null;
  nextProgress: {
    milestone: CareerMilestone;
    evaluations: RequirementEvaluation[];
    progress: {
      percent: number;
      metRequired: number;
      totalRequired: number;
      allRequiredMet: boolean;
    };
  } | null;
  certificateGaps?: CareerCertificateGap[];
  documentedSea?: DocumentedSea;
  approvedTestimonialCount?: number;
};

type SeaTimeSummary = {
  current: number;
  target: number;
  metricLabel: string;
  sourceLabel: string;
  met: boolean;
  title: string;
  href?: string;
};

type DetailProgress = NonNullable<ProgressResponse['nextProgress']>['progress'];

function certificateStatusClasses(status?: CertificateValidityStatus): string {
  if (status === 'valid' || status === 'no_expiry') {
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
  }
  if (status === 'expiring_soon') {
    return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300';
  }
  return 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300';
}

function certificateStatusLabel(status?: CertificateValidityStatus): string {
  switch (status) {
    case 'valid':
      return 'Valid';
    case 'no_expiry':
      return 'On file';
    case 'expiring_soon':
      return 'Renew soon';
    case 'expired':
      return 'Expired';
    case 'missing':
      return 'Missing';
    default:
      return 'Check';
  }
}

function milestoneState(
  m: MilestoneWithProgress,
  nextMilestone: CareerMilestone | null,
): 'complete' | 'current' | 'started' | 'upcoming' {
  if (m.progress?.allRequiredMet) return 'complete';
  if (nextMilestone?.id === m.id) return 'current';
  if ((m.progress?.percent ?? 0) > 0) return 'started';
  return 'upcoming';
}

function primarySeaTimeEvaluation(
  evaluations: RequirementEvaluation[],
): RequirementEvaluation | null {
  const seaTime = evaluations.filter((e) => e.requirementType === 'sea_time_min');
  return seaTime.find((e) => e.isRequired) ?? seaTime[0] ?? null;
}

function seaTimeMetricShort(metric?: string): string {
  switch (metric) {
    case 'totalDays':
      return 'total days';
    case 'standbyDays':
      return 'standby days';
    default:
      return 'at-sea days';
  }
}

function resolveSeaTimeSummary(
  evaluations: RequirementEvaluation[],
  milestone: CareerMilestone | undefined,
  documentedSea: DocumentedSea | null | undefined,
): SeaTimeSummary | null {
  const evalItem = primarySeaTimeEvaluation(evaluations);
  if (
    evalItem &&
    typeof evalItem.current === 'number' &&
    typeof evalItem.target === 'number'
  ) {
    return {
      current: evalItem.current,
      target: evalItem.target,
      metricLabel: seaTimeMetricShort(evalItem.config.metric),
      sourceLabel:
        evalItem.config.source === 'tracked'
          ? 'tracked logs'
          : 'approved testimonials',
      met: evalItem.met,
      title: evalItem.title,
      href: evalItem.href,
    };
  }

  const min = milestone?.sea_time_min;
  if (milestone && min != null && min > 0 && documentedSea) {
    const metric = milestone.sea_time_metric || 'totalDays';
    const source = milestone.sea_time_source || 'testimonials';
    const current =
      metric === 'atSeaDays'
        ? documentedSea.atSeaDays
        : metric === 'standbyDays'
          ? documentedSea.standbyDays
          : documentedSea.totalDays;
    return {
      current,
      target: min,
      metricLabel: seaTimeMetricShort(metric),
      sourceLabel:
        source === 'tracked' ? 'tracked logs' : 'approved testimonials',
      met: current >= min,
      title: `Sea service toward ${milestone.label}`,
      href:
        source === 'tracked'
          ? '/dashboard/export'
          : '/dashboard/career-documents?tab=testimonials',
    };
  }

  return null;
}

export default function CareerProgressPage() {
  const router = useRouter();
  const { session } = useSupabase();
  const accessToken = session?.access_token;
  const { toast } = useToast();
  const { isEnabled: isFeatureEnabled, isLoading: isFlagsLoading } = useFeatureFlags();
  const hasCareerProgressAccess = isFeatureEnabled('career_progress');

  React.useEffect(() => {
    if (!isFlagsLoading && !hasCareerProgressAccess) {
      router.push('/dashboard');
    }
  }, [hasCareerProgressAccess, isFlagsLoading, router]);

  const [data, setData] = React.useState<ProgressResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [detailEvaluations, setDetailEvaluations] = React.useState<
    RequirementEvaluation[] | null
  >(null);
  const [detailProgress, setDetailProgress] = React.useState<DetailProgress | null>(null);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const loadOverview = React.useCallback(async () => {
    if (!accessToken || !hasCareerProgressAccess) return;
    setLoading(true);
    try {
      const res = await fetch('/api/career/progress', {
        headers: bearerHeaders(accessToken),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load');
      setData(json);
      const nextId = json.nextMilestone?.id ?? json.milestones?.[0]?.id ?? null;
      setSelectedId(nextId);
    } catch (e) {
      toast({
        title: 'Could not load career progress',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [accessToken, hasCareerProgressAccess, toast]);

  React.useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const loadDetail = React.useCallback(
    async (milestoneId: string) => {
      if (!accessToken) return;
      setDetailLoading(true);
      try {
        const res = await fetch(
          `/api/career/milestones/${milestoneId}/progress`,
          { headers: bearerHeaders(accessToken) },
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to load');
        setDetailEvaluations(json.evaluations || []);
        setDetailProgress(json.progress || null);
      } catch (e) {
        toast({
          title: 'Could not load milestone',
          description: e instanceof Error ? e.message : 'Unknown error',
          variant: 'destructive',
        });
      } finally {
        setDetailLoading(false);
      }
    },
    [accessToken, toast],
  );

  React.useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
    else {
      setDetailEvaluations(null);
      setDetailProgress(null);
    }
  }, [selectedId, loadDetail]);

  async function toggleManual(requirementId: string, completed: boolean) {
    if (!accessToken || !selectedId) return;
    setBusyId(requirementId);
    try {
      const res = await fetch(
        `/api/career/milestones/${selectedId}/progress`,
        {
          method: 'PATCH',
          headers: bearerHeaders(accessToken, {
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({ requirementId, completed }),
        },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Update failed');
      setDetailEvaluations(json.evaluations || []);
      setDetailProgress(json.progress || null);
      await loadOverview();
    } catch (e) {
      toast({
        title: 'Update failed',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setBusyId(null);
    }
  }

  if (isFlagsLoading || !hasCareerProgressAccess || loading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2 border-b border-border pb-5">
          <Skeleton className="h-3 w-40 rounded-md" />
          <Skeleton className="h-7 w-56 rounded-md" />
        </div>
        <Skeleton className="h-16 w-full rounded-md" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-20 rounded-md" />
          <Skeleton className="h-20 rounded-md" />
          <Skeleton className="h-20 rounded-md" />
          <Skeleton className="h-20 rounded-md" />
        </div>
        <div className="grid gap-6 lg:grid-cols-[minmax(220px,260px)_minmax(0,1fr)]">
          <Skeleton className="h-80 rounded-md" />
          <Skeleton className="h-96 rounded-md" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="overflow-hidden rounded-md border border-border bg-background">
        <div className="border-b border-border bg-muted/40 px-4 py-2.5">
          <p className="text-xs font-medium text-foreground">
            Career progress unavailable
          </p>
        </div>
        <div className="px-4 py-14 text-center sm:px-5">
          <p className="text-sm text-muted-foreground">
            Refresh the page or contact support if this persists.
          </p>
        </div>
      </div>
    );
  }

  const { career, milestones, nextMilestone, nextProgress, certificateGaps = [], documentedSea, approvedTestimonialCount = 0 } = data;
  const selected = milestones.find((m) => m.id === selectedId);
  const isViewingNext = selected?.id === nextMilestone?.id;

  const activeEvaluations =
    detailEvaluations ??
    selected?.evaluations ??
    (isViewingNext ? nextProgress?.evaluations : null) ??
    [];
  const dedupedEvaluations = dedupeCertificateEvaluations(activeEvaluations);

  const unmetRequired = dedupedEvaluations.filter((e) => e.isRequired && !e.met);
  const metRequiredItems = dedupedEvaluations.filter((e) => e.isRequired && e.met);
  const optionalItems = dedupedEvaluations.filter((e) => !e.isRequired);
  const metOptional = optionalItems.filter((e) => e.met);

  const selectedCertificateGaps =
    !activeEvaluations.length || !selected
      ? []
      : collectCertificateGaps([
          { milestoneLabel: selected.label, evaluations: activeEvaluations },
        ]);

  const displayCertificateGaps =
    isViewingNext || selectedCertificateGaps.length === 0
      ? certificateGaps
      : selectedCertificateGaps;

  const seaTimeSummary = resolveSeaTimeSummary(
    dedupedEvaluations,
    selected,
    documentedSea,
  );

  const statItems: Array<{
    label: string;
    value: string | number;
    hint?: string;
    tone?: 'default' | 'emerald' | 'amber' | 'sky' | 'purple' | 'destructive';
  }> = [
    {
      label: 'Progress',
      value: detailProgress ? `${detailProgress.percent}%` : '—',
      hint: detailProgress
        ? `${detailProgress.metRequired}/${detailProgress.totalRequired} required`
        : 'Select a ticket',
      tone: 'sky',
    },
    {
      label: 'Still to do',
      value: unmetRequired.length,
      hint: unmetRequired.length === 1 ? 'required item' : 'required items',
      tone: unmetRequired.length > 0 ? 'amber' : 'default',
    },
    {
      label: 'Completed',
      value: metRequiredItems.length,
      hint: `of ${metRequiredItems.length + unmetRequired.length} required`,
      tone: 'emerald',
    },
  ];

  if (seaTimeSummary) {
    const remaining = Math.max(0, seaTimeSummary.target - seaTimeSummary.current);
    const isStandby = seaTimeSummary.metricLabel === 'standby days';
    statItems.push({
      label: 'Sea time',
      value: `${seaTimeSummary.current.toLocaleString()}d`,
      hint: seaTimeSummary.met
        ? `${seaTimeSummary.target.toLocaleString()} ${seaTimeSummary.metricLabel} required — met`
        : `${remaining.toLocaleString()}d to go · ${seaTimeSummary.current.toLocaleString()}/${seaTimeSummary.target.toLocaleString()} ${seaTimeSummary.metricLabel}`,
      tone: isStandby ? 'purple' : 'sky',
    });
  }

  return (
    <div className="space-y-6">
      <CareerProgressPageHeader
        title="Career progress"
        description="Track requirements for your next ticket and see what is left to do."
        actions={
          <Button asChild className="h-8 gap-2 rounded-md text-xs">
            <Link href="/dashboard/apply">
              Apply for tickets
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        }
      />

      <CareerPositionStrip career={career} nextMilestone={nextMilestone} nextProgress={nextProgress} />

      {nextMilestone && isViewingNext && nextProgress ? (
        <NextTicketHero
          milestone={nextMilestone}
          progress={nextProgress.progress}
          unmetCount={unmetRequired.length}
        />
      ) : null}

      <CareerProgressStatTiles items={statItems} />

      {seaTimeSummary ? (
        <SeaTimeProgressPanel
          summary={seaTimeSummary}
          milestoneLabel={selected?.label}
          approvedTestimonialCount={approvedTestimonialCount}
        />
      ) : null}

      {displayCertificateGaps.length > 0 ? (
        <CareerCertificateGapsPanel
          gaps={displayCertificateGaps}
          nextMilestoneLabel={isViewingNext ? nextMilestone?.label : selected?.label}
        />
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(240px,272px)_minmax(0,1fr)]">
        <CareerProgressSection
          title="Career ladder"
          description="Select a ticket to view requirements"
          flush
          className="h-fit lg:sticky lg:top-4"
        >
          {milestones.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground sm:px-5">
              No milestones published yet.
            </p>
          ) : (
            <CareerLadder
              milestones={milestones}
              nextMilestone={nextMilestone}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          )}
        </CareerProgressSection>

        <div className="space-y-6">
          {selected ? (
            <>
              {detailProgress?.allRequiredMet ? (
                <div className="rounded-md border border-emerald-500/30 bg-emerald-500/[0.06] px-4 py-3 sm:px-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="h-4 w-4" />
                      </div>
                      <div>
                        <h2 className="text-sm font-medium">
                          All required data on file for {selected.label}
                        </h2>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          You can start your application package when you are ready.
                        </p>
                      </div>
                    </div>
                    <Button asChild className="h-8 rounded-md text-xs">
                      <Link href="/dashboard/apply">
                        Apply for {selected.label}
                        <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </div>
                </div>
              ) : null}

              <CareerProgressSection
                title="Requirements checklist"
                description={
                  selected.description ||
                  'Everything needed for this ticket — ticked items are already on file in SeaJourney.'
                }
                action={
                  detailProgress ? (
                    <Badge
                      variant="secondary"
                      className={cn(
                        'text-[10px]',
                        detailProgress.allRequiredMet &&
                          'border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
                      )}
                    >
                      {detailProgress.metRequired}/{detailProgress.totalRequired} required
                    </Badge>
                  ) : null
                }
              >
                {detailLoading ? (
                  <div className="flex justify-center py-10">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : dedupedEvaluations.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No requirements defined for this milestone yet.
                  </p>
                ) : (
                  <div className="space-y-5">
                    {detailProgress ? (
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <span className="text-muted-foreground">
                            <span className="font-medium text-emerald-600 dark:text-emerald-400">
                              {metRequiredItems.length} on file
                            </span>
                            {unmetRequired.length > 0 ? (
                              <>
                                {' · '}
                                <span className="font-medium text-amber-700 dark:text-amber-300">
                                  {unmetRequired.length} outstanding
                                </span>
                              </>
                            ) : null}
                          </span>
                          <span className="font-mono text-xs font-medium tabular-nums">
                            {detailProgress.percent}%
                          </span>
                        </div>
                        <Progress value={detailProgress.percent} className="h-1.5" />
                      </div>
                    ) : null}

                    {unmetRequired.length > 0 ? (
                      <section className="space-y-2">
                        <h3 className="text-xs font-medium text-amber-700 dark:text-amber-300">
                          Still needed ({unmetRequired.length})
                        </h3>
                        <ul className="divide-y overflow-hidden rounded-md border border-amber-500/20 bg-amber-500/[0.03]">
                          {unmetRequired.map((item) => (
                            <RequirementChecklistRow
                              key={item.requirementId}
                              item={item}
                              busyId={busyId}
                              onToggleManual={toggleManual}
                              outstanding
                            />
                          ))}
                        </ul>
                      </section>
                    ) : null}

                    {metRequiredItems.length > 0 ? (
                      <section className="space-y-2">
                        <h3 className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                          Verified on file ({metRequiredItems.length})
                        </h3>
                        <p className="text-[11px] text-muted-foreground">
                          Matched from your profile, certificates, and testimonials only.
                        </p>
                        <ul className="divide-y overflow-hidden rounded-md border bg-muted/10">
                          {metRequiredItems.map((item) => (
                            <RequirementChecklistRow
                              key={item.requirementId}
                              item={item}
                              busyId={busyId}
                              onToggleManual={toggleManual}
                              complete
                            />
                          ))}
                        </ul>
                      </section>
                    ) : null}

                    {optionalItems.length > 0 ? (
                      <section className="space-y-2 border-t pt-5">
                        <h3 className="text-xs font-medium text-muted-foreground">
                          Optional ({metOptional.length}/{optionalItems.length} on file)
                        </h3>
                        <ul className="divide-y overflow-hidden rounded-md border">
                          {optionalItems.map((item) => (
                            <RequirementChecklistRow
                              key={item.requirementId}
                              item={item}
                              busyId={busyId}
                              onToggleManual={toggleManual}
                              complete={item.met}
                              outstanding={!item.met}
                            />
                          ))}
                        </ul>
                      </section>
                    ) : null}

                    <p className="flex items-start gap-2 border-t pt-4 text-xs text-muted-foreground">
                      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>
                        Items tick automatically from your profile, certificates,
                        testimonials, and sea time. Manual checklist items can be
                        marked complete yourself. When everything required is on
                        file, use{' '}
                        <Link
                          href="/dashboard/apply"
                          className="font-medium text-foreground underline-offset-2 hover:underline"
                        >
                          Apply for tickets
                        </Link>
                        .
                      </span>
                    </p>

                    <div className="flex flex-wrap gap-2 border-t pt-4">
                      <Button asChild variant="outline" className="h-8 rounded-md text-xs">
                        <Link href="/dashboard/certificates">
                          <Award className="mr-1.5 h-3.5 w-3.5" />
                          Certificates
                        </Link>
                      </Button>
                      <Button asChild variant="outline" className="h-8 rounded-md text-xs">
                        <Link href="/dashboard/apply">
                          <Target className="mr-1.5 h-3.5 w-3.5" />
                          Apply
                        </Link>
                      </Button>
                      <Button asChild variant="outline" className="h-8 rounded-md text-xs">
                        <Link href="/dashboard/profile">
                          <UserRound className="mr-1.5 h-3.5 w-3.5" />
                          Profile
                        </Link>
                      </Button>
                    </div>
                  </div>
                )}
              </CareerProgressSection>
            </>
          ) : (
            <CareerProgressSection title="Requirements">
              <p className="text-sm text-muted-foreground">
                Select a ticket on the ladder to view requirements.
              </p>
            </CareerProgressSection>
          )}
        </div>
      </div>
    </div>
  );
}

function CareerPositionStrip({
  career,
  nextMilestone,
  nextProgress,
}: {
  career: CareerStep;
  nextMilestone: CareerMilestone | null;
  nextProgress: ProgressResponse['nextProgress'];
}) {
  return (
    <section className="flex flex-col gap-3 rounded-md border border-border bg-background px-3 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-4">
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted/60 text-muted-foreground">
          <UserRound className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-muted-foreground">
            You are here
          </p>
          <p className="truncate text-sm font-medium">{career.label}</p>
        </div>
      </div>
      <ArrowRight className="hidden h-3.5 w-3.5 shrink-0 text-muted-foreground sm:block" />
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-300">
          <Target className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium text-amber-700/80 dark:text-amber-300/80">
            Working toward
          </p>
          <p className="truncate text-sm font-medium">
            {nextMilestone?.label || 'Not mapped yet'}
          </p>
          {nextProgress ? (
            <div className="mt-1.5 max-w-xs">
              <Progress value={nextProgress.progress.percent} className="h-1" />
            </div>
          ) : null}
        </div>
      </div>
      {career.level === 'other' ? (
        <Button asChild variant="outline" className="h-8 shrink-0 rounded-md text-xs">
          <Link href="/dashboard/profile">Set position</Link>
        </Button>
      ) : career.summary ? (
        <p className="flex max-w-sm items-start gap-1.5 text-xs text-muted-foreground sm:max-w-md">
          <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <span className="line-clamp-2">{career.summary}</span>
        </p>
      ) : null}
    </section>
  );
}

function NextTicketHero({
  milestone,
  progress,
  unmetCount,
}: {
  milestone: CareerMilestone;
  progress: DetailProgress;
  unmetCount: number;
}) {
  return (
    <CareerProgressSection
      title="Next ticket"
      action={
        <Badge
          variant="secondary"
          className={cn(
            'text-[10px]',
            progress.allRequiredMet &&
              'border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
          )}
        >
          {progress.allRequiredMet
            ? 'Ready to apply'
            : unmetCount > 0
              ? `${unmetCount} step${unmetCount === 1 ? '' : 's'} left`
              : `${progress.percent}% complete`}
        </Badge>
      }
    >
      <div className="space-y-3">
        <div>
          <h2 className="text-sm font-medium tracking-tight">{milestone.label}</h2>
          {milestone.description ? (
            <p className="mt-0.5 max-w-2xl text-xs text-muted-foreground">
              {milestone.description}
            </p>
          ) : null}
        </div>
        <Progress value={progress.percent} className="h-1.5" />
        <p className="text-[11px] text-muted-foreground">
          {progress.metRequired} of {progress.totalRequired} required items complete
        </p>
      </div>
    </CareerProgressSection>
  );
}

function CareerLadder({
  milestones,
  nextMilestone,
  selectedId,
  onSelect,
}: {
  milestones: MilestoneWithProgress[];
  nextMilestone: CareerMilestone | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="overflow-hidden">
      {milestones.map((m, index) => {
        const state = milestoneState(m, nextMilestone);
        const isSelected = selectedId === m.id;
        const percent = m.progress?.percent ?? 0;
        const hasReqs = (m.progress?.totalRequired ?? 0) > 0;
        const isComplete = state === 'complete';

        return (
          <button
            key={m.id}
            type="button"
            onClick={() => onSelect(m.id)}
            className={cn(
              'relative flex w-full items-center gap-2.5 border-b border-border px-3 py-2.5 text-left transition-colors last:border-b-0 sm:px-4',
              isSelected ? 'bg-muted/50' : 'hover:bg-muted/40',
            )}
          >
            {isSelected ? (
              <span
                className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-foreground/40"
                aria-hidden
              />
            ) : null}

            <span
              className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[11px] font-medium tabular-nums',
                isComplete
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : state === 'current'
                    ? 'bg-sky-500/10 text-sky-700 dark:text-sky-300'
                    : 'bg-muted text-muted-foreground',
              )}
            >
              {isComplete ? (
                <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2} />
              ) : (
                index + 1
              )}
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span
                  className={cn(
                    'truncate text-sm leading-snug',
                    isSelected ? 'font-medium' : 'font-normal',
                  )}
                >
                  {m.label}
                </span>
                {hasReqs ? (
                  <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                    {percent}%
                  </span>
                ) : null}
              </div>
              {state === 'current' ? (
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Next on your path
                </p>
              ) : isComplete ? (
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Requirements met
                </p>
              ) : hasReqs ? (
                <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
                  {m.progress?.metRequired ?? 0}/{m.progress?.totalRequired ?? 0}{' '}
                  required
                </p>
              ) : null}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function RequirementChecklistRow({
  item,
  busyId,
  onToggleManual,
  complete = false,
  outstanding = false,
}: {
  item: RequirementEvaluation;
  busyId: string | null;
  onToggleManual: (id: string, completed: boolean) => void;
  complete?: boolean;
  outstanding?: boolean;
}) {
  const isManual =
    item.requirementType === 'manual_checklist' ||
    item.requirementType === 'external_link';
  const isSeaTime = item.requirementType === 'sea_time_min';
  const isCert = item.requirementType === 'certificate';
  const certStatus = item.certificateStatus;
  const needsAttention =
    isCert &&
    (certStatus === 'expiring_soon' ||
      certStatus === 'expired' ||
      certStatus === 'missing' ||
      !item.met);

  const isMet = item.met && (!isCert || certStatus === 'valid' || certStatus === 'no_expiry' || certStatus === undefined);

  return (
    <li
      className={cn(
        'flex gap-3 px-3 py-3 sm:items-start sm:px-4',
        outstanding && !complete && 'bg-amber-500/[0.04]',
        complete && 'bg-emerald-500/[0.02]',
      )}
    >
      <div className="mt-0.5 shrink-0">
        {isManual ? (
          <Checkbox
            checked={item.met}
            disabled={busyId === item.requirementId}
            className={cn(
              'h-4 w-4 rounded-md border-2',
              item.met && 'border-emerald-500 bg-emerald-500 text-white data-[state=checked]:bg-emerald-500',
            )}
            onCheckedChange={(checked) =>
              void onToggleManual(item.requirementId, checked === true)
            }
          />
        ) : isMet ? (
          <div className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" strokeWidth={2.25} />
          </div>
        ) : (
          <div
            className={cn(
              'flex h-4 w-4 items-center justify-center rounded-full border-2',
              outstanding
                ? 'border-amber-500/50 bg-background'
                : 'border-muted-foreground/30 bg-background',
            )}
          >
            <Circle className="h-1.5 w-1.5 fill-muted-foreground/40 text-transparent" />
          </div>
        )}
        {busyId === item.requirementId ? (
          <Loader2 className="mt-1 h-3.5 w-3.5 animate-spin text-muted-foreground" />
        ) : null}
      </div>

      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p
            className={cn(
              'text-sm font-medium leading-snug',
              complete && 'text-muted-foreground line-through decoration-emerald-500/40',
            )}
          >
            {item.title}
          </p>
          {isCert && certStatus ? (
            <Badge
              variant="outline"
              className={cn('text-[10px]', certificateStatusClasses(certStatus))}
            >
              {certificateStatusLabel(certStatus)}
            </Badge>
          ) : null}
          {typeof item.current === 'number' &&
          typeof item.target === 'number' &&
          !isSeaTime ? (
            <Badge variant="secondary" className="text-[10px] tabular-nums">
              {item.current}/{item.target}
            </Badge>
          ) : null}
        </div>

        {isSeaTime &&
        typeof item.current === 'number' &&
        typeof item.target === 'number' ? (
          <SeaTimeProgressInline item={item} complete={complete} />
        ) : complete ? (
          <div className="text-xs text-emerald-700/90 dark:text-emerald-300/90">
            <p>{item.detail}</p>
            {item.matchedCertificates && item.matchedCertificates.length > 0 ? (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Certificates page:{' '}
                {item.matchedCertificates.map((c) => c.name).join(', ')}
              </p>
            ) : null}
            {item.requirementType === 'manual_checklist' ||
            item.requirementType === 'external_link' ? (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Self-reported — uncheck if this is not accurate.
              </p>
            ) : null}
          </div>
        ) : (
          <>
            {item.description ? (
              <p className="text-xs text-muted-foreground">{item.description}</p>
            ) : null}
            <p
              className={cn(
                'text-xs',
                outstanding ? 'text-amber-900/80 dark:text-amber-100/80' : 'text-muted-foreground',
              )}
            >
              {item.detail}
            </p>
          </>
        )}
      </div>

      <div className="flex shrink-0 flex-col gap-1.5 sm:items-end">
        {!complete && isSeaTime && item.href ? (
          <Button asChild variant="outline" className="h-7 rounded-md text-xs">
            <Link href={item.href}>
              {item.config.source === 'tracked' ? 'View logs' : 'Testimonials'}
              <ArrowRight className="ml-1 h-3 w-3" />
            </Link>
          </Button>
        ) : null}
        {!complete && isCert ? (
          <Button
            asChild
            variant={needsAttention ? 'default' : 'outline'}
            className="h-7 rounded-md text-xs"
          >
            <Link href={item.href || '/dashboard/certificates?add=1'}>
              {needsAttention &&
              (certStatus === 'missing' || !item.met)
                ? 'Add'
                : certStatus === 'expired' || certStatus === 'expiring_soon'
                  ? 'Renew'
                  : 'View'}
              <ArrowRight className="ml-1 h-3 w-3" />
            </Link>
          </Button>
        ) : !complete && item.href && !isManual && !isSeaTime ? (
          <Button asChild variant="outline" className="h-7 rounded-md text-xs">
            <Link href={item.href}>Fix</Link>
          </Button>
        ) : null}
        {!complete && item.requirementType === 'external_link' && item.config.url ? (
          <Button asChild variant="outline" className="h-7 rounded-md text-xs">
            <a href={item.config.url} target="_blank" rel="noreferrer">
              Visit
              <ExternalLink className="ml-1 h-3 w-3" />
            </a>
          </Button>
        ) : null}
        {complete ? (
          <span className="text-[10px] font-medium uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
            Verified
          </span>
        ) : null}
      </div>
    </li>
  );
}

function SeaTimeProgressPanel({
  summary,
  milestoneLabel,
  approvedTestimonialCount = 0,
}: {
  summary: SeaTimeSummary;
  milestoneLabel?: string;
  approvedTestimonialCount?: number;
}) {
  const pct =
    summary.target > 0
      ? Math.min(100, Math.round((summary.current / summary.target) * 100))
      : 0;
  const remaining = Math.max(0, summary.target - summary.current);
  const isStandby = summary.metricLabel === 'standby days';

  return (
    <CareerProgressSection
      title={`Sea time${milestoneLabel ? ` · ${milestoneLabel}` : ''}`}
      action={
        <Badge
          variant="secondary"
          className={cn(
            'text-[10px]',
            summary.met &&
              'border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
          )}
        >
          {summary.met
            ? 'Requirement met'
            : `${remaining.toLocaleString()}d to go`}
        </Badge>
      }
    >
      <div className="space-y-3">
        <div>
          <h2 className="text-sm font-medium tracking-tight">{summary.title}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {summary.sourceLabel === 'tracked logs'
              ? 'Counted from your vessel state logs.'
              : `Summed from ${approvedTestimonialCount} approved testimonial${approvedTestimonialCount === 1 ? '' : 's'} in your account.`}
          </p>
        </div>
        <div className="space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm tabular-nums">
            <span
              className={cn(
                'font-mono text-sm font-medium',
                isStandby && !summary.met && 'text-[#7629BB]',
              )}
            >
              {summary.current.toLocaleString()} / {summary.target.toLocaleString()} days
            </span>
            <span className="text-xs text-muted-foreground">{pct}% complete</span>
          </div>
          <Progress
            value={pct}
            className={cn(
              'h-1.5',
              summary.met && '[&>div]:bg-emerald-500',
              isStandby && !summary.met && '[&>div]:bg-[#7629BB]',
            )}
          />
          <p className="text-[11px] text-muted-foreground">
            {summary.met
              ? `You have enough ${summary.metricLabel} documented for this ticket.`
              : `${remaining.toLocaleString()} more ${summary.metricLabel} needed from ${summary.sourceLabel}.`}
          </p>
        </div>
        {summary.href && !summary.met ? (
          <Button asChild variant="outline" className="h-8 rounded-md text-xs">
            <Link href={summary.href}>
              {summary.sourceLabel === 'tracked logs' ? 'View sea-time logs' : 'View testimonials'}
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Link>
          </Button>
        ) : null}
      </div>
    </CareerProgressSection>
  );
}

function SeaTimeProgressInline({
  item,
  complete,
}: {
  item: RequirementEvaluation;
  complete?: boolean;
}) {
  const current = item.current ?? 0;
  const target = item.target ?? 0;
  const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
  const remaining = Math.max(0, target - current);
  const metric = seaTimeMetricShort(item.config.metric);
  const sourceLabel =
    item.config.source === 'tracked' ? 'tracked logs' : 'approved testimonials';
  const isStandby = item.config.metric === 'standbyDays';

  return (
    <div className="mt-1 space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-xs tabular-nums">
        <span
          className={cn(
            'font-mono font-medium',
            complete && 'text-emerald-700 dark:text-emerald-300',
            isStandby && !complete && 'text-[#7629BB]',
          )}
        >
          {current.toLocaleString()} / {target.toLocaleString()} days
        </span>
        <span className="text-muted-foreground">{pct}% of required {metric}</span>
      </div>
      <Progress
        value={pct}
        className={cn(
          'h-1.5',
          complete && '[&>div]:bg-emerald-500',
          isStandby && !complete && '[&>div]:bg-[#7629BB]',
        )}
      />
      <p
        className={cn(
          'text-[11px]',
          complete
            ? 'text-emerald-700/90 dark:text-emerald-300/90'
            : 'text-muted-foreground',
        )}
      >
        {complete
          ? `Requirement met from ${sourceLabel}.`
          : remaining > 0
            ? `${remaining.toLocaleString()} more day${remaining === 1 ? '' : 's'} needed from ${sourceLabel}.`
            : item.detail}
      </p>
    </div>
  );
}
