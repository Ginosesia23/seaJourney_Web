'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ArrowRight,
  Award,
  CheckCircle2,
  Circle,
  Info,
  Loader2,
  Sparkles,
  Target,
  UserRound,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  CareerProgressSection,
  CareerProgressStatTiles,
} from '@/components/dashboard/career-progress-page-ui';
import { bearerHeaders } from '@/lib/applications/client';
import type { CareerStep } from '@/lib/applications/career-path';
import type { CareerMilestone } from '@/lib/applications/milestones';
import type {
  RequirementEvaluation,
} from '@/lib/applications/types';
import { dedupeCertificateEvaluations } from '@/lib/applications/career-certificate-gaps';
import {
  certificateStatusClasses,
  certificateStatusLabel,
  requirementDetailToneClasses,
  requirementRowTone,
  requirementRowToneClasses,
} from '@/lib/applications/requirement-status-ui';
import { cn } from '@/lib/utils';
import { useSupabase } from '@/supabase';
import { useToast } from '@/hooks/use-toast';

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
  documentedSea?: DocumentedSea;
  approvedTestimonialCount?: number;
};

type DetailProgress = NonNullable<ProgressResponse['nextProgress']>['progress'];

type SeaTimeSummary = {
  current: number;
  target: number;
  metricLabel: string;
  sourceLabel: string;
  met: boolean;
  title: string;
};

function milestoneState(
  m: MilestoneWithProgress,
  nextMilestone: CareerMilestone | null,
): 'complete' | 'current' | 'started' | 'upcoming' {
  if (m.progress?.allRequiredMet) return 'complete';
  if (nextMilestone?.id === m.id) return 'current';
  if ((m.progress?.percent ?? 0) > 0) return 'started';
  return 'upcoming';
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

function primarySeaTimeEvaluation(
  evaluations: RequirementEvaluation[],
): RequirementEvaluation | null {
  const seaTime = evaluations.filter((e) => e.requirementType === 'sea_time_min');
  return seaTime.find((e) => e.isRequired) ?? seaTime[0] ?? null;
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
    };
  }

  return null;
}

/**
 * Full career-progress UI for vessel managers viewing a crew member
 * who has approved data sharing. Read-only (no manual checklist toggles).
 */
export function CrewCareerProgressWorkspace({
  crewUserId,
  crewDisplayName,
  className,
}: {
  crewUserId: string;
  crewDisplayName?: string;
  className?: string;
}) {
  const { session } = useSupabase();
  const { toast } = useToast();
  const accessToken = session?.access_token;

  const [data, setData] = useState<ProgressResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailEvaluations, setDetailEvaluations] = useState<
    RequirementEvaluation[] | null
  >(null);
  const [detailProgress, setDetailProgress] = useState<DetailProgress | null>(
    null,
  );
  const [detailLoading, setDetailLoading] = useState(false);

  const who = crewDisplayName || 'this crew member';

  const loadOverview = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/career/progress?crewUserId=${encodeURIComponent(crewUserId)}`,
        { headers: bearerHeaders(accessToken) },
      );
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
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [accessToken, crewUserId, toast]);

  const loadDetail = useCallback(
    async (milestoneId: string) => {
      if (!accessToken) return;
      setDetailLoading(true);
      try {
        const res = await fetch(
          `/api/career/milestones/${milestoneId}/progress?crewUserId=${encodeURIComponent(crewUserId)}`,
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
    [accessToken, crewUserId, toast],
  );

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
    else {
      setDetailEvaluations(null);
      setDetailProgress(null);
    }
  }, [selectedId, loadDetail]);

  if (loading) {
    return (
      <div className={cn('space-y-4', className)}>
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
      <div
        className={cn(
          'overflow-hidden rounded-md border border-border bg-background',
          className,
        )}
      >
        <div className="border-b border-border bg-muted/40 px-4 py-2.5">
          <p className="text-xs font-medium text-foreground">
            Career progress unavailable
          </p>
        </div>
        <div className="px-4 py-10 text-center sm:px-5">
          <p className="text-sm text-muted-foreground">
            Could not load progress for {who}. Refresh and try again.
          </p>
        </div>
      </div>
    );
  }

  const {
    career,
    milestones,
    nextMilestone,
    nextProgress,
    documentedSea,
    approvedTestimonialCount = 0,
  } = data;

  const selected = milestones.find((m) => m.id === selectedId);
  const isViewingNext = selected?.id === nextMilestone?.id;

  const activeEvaluations =
    detailEvaluations ??
    selected?.evaluations ??
    (isViewingNext ? nextProgress?.evaluations : null) ??
    [];
  const dedupedEvaluations = dedupeCertificateEvaluations(activeEvaluations);

  const unmetRequired = dedupedEvaluations.filter((e) => e.isRequired && !e.met);
  const metRequiredItems = dedupedEvaluations.filter(
    (e) => e.isRequired && e.met,
  );
  const optionalItems = dedupedEvaluations.filter((e) => !e.isRequired);
  const metOptional = optionalItems.filter((e) => e.met);

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
    <div className={cn('space-y-5', className)}>
      <PositionStrip
        career={career}
        nextMilestone={nextMilestone}
        nextProgress={nextProgress}
        crewLabel={who}
      />

      {nextMilestone && isViewingNext && nextProgress ? (
        <CareerProgressSection
          title="Next ticket"
          action={
            <Badge
              variant="secondary"
              className={cn(
                'text-[10px]',
                nextProgress.progress.allRequiredMet &&
                  'border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
              )}
            >
              {nextProgress.progress.allRequiredMet
                ? 'Ready to apply'
                : unmetRequired.length > 0
                  ? `${unmetRequired.length} step${unmetRequired.length === 1 ? '' : 's'} left`
                  : `${nextProgress.progress.percent}% complete`}
            </Badge>
          }
        >
          <div className="space-y-3">
            <div>
              <h2 className="text-sm font-medium tracking-tight">
                {nextMilestone.label}
              </h2>
              {nextMilestone.description ? (
                <p className="mt-0.5 max-w-2xl text-xs text-muted-foreground">
                  {nextMilestone.description}
                </p>
              ) : null}
            </div>
            <Progress
              value={nextProgress.progress.percent}
              className="h-1.5"
            />
            <p className="text-[11px] text-muted-foreground">
              {nextProgress.progress.metRequired} of{' '}
              {nextProgress.progress.totalRequired} required items complete
            </p>
          </div>
        </CareerProgressSection>
      ) : null}

      <CareerProgressStatTiles items={statItems} />

      {seaTimeSummary ? (
        <SeaTimePanel
          summary={seaTimeSummary}
          milestoneLabel={selected?.label}
          approvedTestimonialCount={approvedTestimonialCount}
          crewLabel={who}
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

        <div className="space-y-5">
          {selected ? (
            <>
              {detailProgress?.allRequiredMet ? (
                <div className="rounded-md border border-emerald-500/30 bg-emerald-500/[0.06] px-4 py-3 sm:px-5">
                  <div className="flex items-start gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="h-4 w-4" />
                    </div>
                    <div>
                      <h2 className="text-sm font-medium">
                        All required data on file for {selected.label}
                      </h2>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {who} has everything needed for this ticket in SeaJourney.
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}

              <CareerProgressSection
                title="Requirements checklist"
                description={
                  selected.description ||
                  `Everything needed for this ticket — certificates, sea time, and profile details for ${who}. Items already on file are listed under Verified.`
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
                      {detailProgress.metRequired}/{detailProgress.totalRequired}{' '}
                      required
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
                        <Progress
                          value={detailProgress.percent}
                          className="h-1.5"
                        />
                      </div>
                    ) : null}

                    {unmetRequired.length > 0 ? (
                      <section className="space-y-2">
                        <h3 className="text-xs font-medium text-amber-700 dark:text-amber-300">
                          Still needed ({unmetRequired.length})
                        </h3>
                        <ul className="divide-y overflow-hidden rounded-md border border-border">
                          {unmetRequired.map((item) => (
                            <RequirementRow
                              key={item.requirementId}
                              item={item}
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
                        <ul className="divide-y overflow-hidden rounded-md border border-emerald-500/25 bg-emerald-500/[0.04]">
                          {metRequiredItems.map((item) => (
                            <RequirementRow
                              key={item.requirementId}
                              item={item}
                              complete
                            />
                          ))}
                        </ul>
                      </section>
                    ) : null}

                    {optionalItems.length > 0 ? (
                      <section className="space-y-2 border-t pt-5">
                        <h3 className="text-xs font-medium text-muted-foreground">
                          Optional ({metOptional.length}/{optionalItems.length}{' '}
                          on file)
                        </h3>
                        <ul className="divide-y overflow-hidden rounded-md border">
                          {optionalItems.map((item) => (
                            <RequirementRow
                              key={item.requirementId}
                              item={item}
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
                        Read-only view of {who}’s shared career data. Manual
                        checklist items can only be updated by the crew member.
                      </span>
                    </p>
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

function PositionStrip({
  career,
  nextMilestone,
  nextProgress,
  crewLabel,
}: {
  career: CareerStep;
  nextMilestone: CareerMilestone | null;
  nextProgress: ProgressResponse['nextProgress'];
  crewLabel: string;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-md border border-border bg-background px-3 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-4">
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted/60 text-muted-foreground">
          <UserRound className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-muted-foreground">
            {crewLabel} is here
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
      {career.summary ? (
        <p className="flex max-w-sm items-start gap-1.5 text-xs text-muted-foreground sm:max-w-md">
          <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <span className="line-clamp-2">{career.summary}</span>
        </p>
      ) : null}
    </section>
  );
}

function SeaTimePanel({
  summary,
  milestoneLabel,
  approvedTestimonialCount,
  crewLabel,
}: {
  summary: SeaTimeSummary;
  milestoneLabel?: string;
  approvedTestimonialCount: number;
  crewLabel: string;
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
              ? `Counted from ${crewLabel}’s tracked logs.`
              : `Summed from ${approvedTestimonialCount} approved testimonial${approvedTestimonialCount === 1 ? '' : 's'}.`}
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
              {summary.current.toLocaleString()} /{' '}
              {summary.target.toLocaleString()} days
            </span>
            <span className="text-xs text-muted-foreground">{pct}% complete</span>
          </div>
          <Progress
            value={pct}
            className={cn('h-1.5', isStandby && '[&>div]:bg-[#7629BB]')}
          />
        </div>
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
      {milestones.map((m) => {
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
            <div
              className={cn(
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border',
                isComplete &&
                  'border-emerald-500/40 bg-emerald-500/15 text-emerald-600',
                state === 'current' &&
                  !isComplete &&
                  'border-amber-500/40 bg-amber-500/10 text-amber-600',
                state !== 'current' &&
                  !isComplete &&
                  'border-border bg-muted/40 text-muted-foreground',
              )}
            >
              {isComplete ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : state === 'current' ? (
                <Target className="h-3 w-3" />
              ) : (
                <Award className="h-3 w-3" />
              )}
            </div>
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
                  Next on their path
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

function RequirementRow({
  item,
  complete = false,
  outstanding = false,
}: {
  item: RequirementEvaluation;
  complete?: boolean;
  outstanding?: boolean;
}) {
  const isManual =
    item.requirementType === 'manual_checklist' ||
    item.requirementType === 'external_link';
  const isSeaTime = item.requirementType === 'sea_time_min';
  const isCert = item.requirementType === 'certificate';
  const certStatus = item.certificateStatus;
  const tone = requirementRowTone(item, complete);
  const isMet =
    item.met &&
    (!isCert ||
      certStatus === 'valid' ||
      certStatus === 'no_expiry' ||
      certStatus === undefined);

  return (
    <li
      className={cn(
        'flex gap-3 px-3 py-3 sm:items-start sm:px-4',
        requirementRowToneClasses(tone),
      )}
    >
      <div className="mt-0.5 shrink-0">
        {isMet ? (
          <div className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" strokeWidth={2.25} />
          </div>
        ) : (
          <div
            className={cn(
              'flex h-4 w-4 items-center justify-center rounded-full border-2',
              tone === 'expired' && 'border-red-500/50 bg-background',
              tone === 'expiring' && 'border-orange-500/50 bg-background',
              tone === 'on_file_hold' && 'border-sky-500/50 bg-background',
              tone === 'outstanding' && 'border-amber-500/50 bg-background',
              tone === 'neutral' && 'border-muted-foreground/30 bg-background',
            )}
          >
            <Circle className="h-1.5 w-1.5 fill-muted-foreground/40 text-transparent" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p
            className={cn(
              'text-sm font-medium leading-snug',
              complete &&
                'text-muted-foreground line-through decoration-emerald-500/40',
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
            <Badge
              variant="outline"
              className={cn(
                'text-[10px] tabular-nums',
                tone === 'on_file_hold' &&
                  'border-sky-500/30 bg-sky-500/10 text-sky-800 dark:text-sky-300',
                tone === 'verified' &&
                  'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
              )}
            >
              {item.current}/{item.target}
              {item.config.minMonthsHeld || item.config.minMonths
                ? ' mo'
                : ''}
            </Badge>
          ) : null}
          {isManual ? (
            <Badge variant="outline" className="text-[10px]">
              Self-reported
            </Badge>
          ) : null}
        </div>

        {isSeaTime &&
        typeof item.current === 'number' &&
        typeof item.target === 'number' ? (
          <div className="space-y-1.5 pt-0.5">
            <div className="flex justify-between gap-2 text-[11px] tabular-nums text-muted-foreground">
              <span>
                {item.current.toLocaleString()} / {item.target.toLocaleString()}{' '}
                days
              </span>
              <span>
                {item.target > 0
                  ? Math.min(
                      100,
                      Math.round((item.current / item.target) * 100),
                    )
                  : 0}
                %
              </span>
            </div>
            <Progress
              value={
                item.target > 0
                  ? Math.min(100, (item.current / item.target) * 100)
                  : 0
              }
              className={cn(
                'h-1',
                item.config.metric === 'standbyDays' && '[&>div]:bg-[#7629BB]',
                tone === 'on_file_hold' && '[&>div]:bg-sky-500',
                tone === 'verified' && '[&>div]:bg-emerald-500',
              )}
            />
            <p className={cn('text-xs', requirementDetailToneClasses(tone))}>
              {item.detail}
            </p>
          </div>
        ) : complete ? (
          <div className={cn('text-xs', requirementDetailToneClasses(tone))}>
            <p>{item.detail}</p>
            {item.matchedCertificates && item.matchedCertificates.length > 0 ? (
              <p className="mt-1 text-[11px] text-muted-foreground">
                On file:{' '}
                {item.matchedCertificates.map((c) => c.name).join(', ')}
              </p>
            ) : null}
          </div>
        ) : (
          <>
            {item.description ? (
              <p className="text-xs text-muted-foreground">{item.description}</p>
            ) : null}
            <p className={cn('text-xs', requirementDetailToneClasses(tone))}>
              {item.detail}
            </p>
          </>
        )}
      </div>

      {complete ? (
        <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
          Verified
        </span>
      ) : tone === 'on_file_hold' ? (
        <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-sky-700 dark:text-sky-300">
          On file
        </span>
      ) : tone === 'expired' ? (
        <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-red-600 dark:text-red-400">
          Out of date
        </span>
      ) : outstanding ? (
        <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300">
          Needed
        </span>
      ) : null}
    </li>
  );
}
