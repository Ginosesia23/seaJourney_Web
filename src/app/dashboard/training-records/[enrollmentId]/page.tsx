'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  TrainingRecordsAttribution,
  TrainingRecordsDisclaimer,
  TrainingRecordsEmpty,
  TrainingRecordsPageHeader,
  TrainingRecordsSection,
  TrainingRecordsStatTiles,
  TrainingStatusPill,
} from '@/components/dashboard/training-records-page-ui';
import { MCA_PILOT_ATTRIBUTION, MCA_PILOT_OGL_URL, MCA_PILOT_SOURCE_URL } from '@/lib/trb/pilot';
import { bearerHeaders } from '@/lib/applications/client';
import { useToast } from '@/hooks/use-toast';
import { useSupabase } from '@/supabase';

type TaskRow = {
  id: string;
  section_id: string;
  task_code: string;
  title: string;
  progressId: string | null;
  status: string;
  officialBookDiscrepancy?: boolean;
  officialBookCandidate?: { official_book_status: string } | null;
};

type Detail = {
  disclaimer: string;
  isMcaPilot?: boolean;
  attribution?: string | null;
  sourceUrl?: string | null;
  oglUrl?: string | null;
  enrollment: {
    id: string;
    status: string;
    started_at: string;
    trb_program_versions: {
      version: string;
      trb_programs: { name: string; code: string } | null;
    } | null;
  };
  sections: { id: string; title: string; sort_order: number; source_section_reference?: string | null }[];
  tasks: TaskRow[];
  overall: {
    total: number;
    approved: number;
    awaitingSignoff: number;
    changesRequested: number;
    remaining: number;
    percentComplete: number;
  };
  officialBookProgress?: {
    signedInOfficialBook: number;
    total: number;
    discrepancies: number;
    percentSigned: number;
  };
  bySection: Record<
    string,
    { percentComplete: number; approved: number; total: number }
  >;
  recentActivity: {
    id: string;
    event_type: string;
    created_at: string;
    actor_email: string | null;
  }[];
};

export default function EnrollmentDetailPage() {
  const params = useParams<{ enrollmentId: string }>();
  const { session } = useSupabase();
  const { toast } = useToast();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!session?.access_token || !params.enrollmentId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/trb/enrollments/${params.enrollmentId}`, {
        headers: bearerHeaders(session.access_token),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load');
      setDetail(json);
    } catch (e) {
      toast({
        title: 'Could not load programme',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [session?.access_token, params.enrollmentId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="space-y-2 border-b border-border pb-5">
          <Skeleton className="h-3 w-48 rounded-md" />
          <Skeleton className="h-7 w-72 rounded-md" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 rounded-md" />
          ))}
        </div>
        <Skeleton className="h-48 w-full rounded-md" />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex flex-col gap-6">
        <TrainingRecordsPageHeader
          title="Programme not found"
          description="This enrolment could not be loaded."
          actions={
            <Button asChild variant="outline" size="sm" className="h-8 rounded-md text-xs">
              <Link href="/dashboard/training-records">
                <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                Back
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  const prog = detail.enrollment.trb_program_versions?.trb_programs;

  return (
    <div className="flex flex-col gap-6">
      <TrainingRecordsPageHeader
        title={prog?.name || 'Training programme'}
        breadcrumb={prog?.name || 'Programme'}
        description={`Version ${detail.enrollment.trb_program_versions?.version} · Digital TRB Companion`}
        actions={
          <>
            <Button asChild variant="outline" size="sm" className="h-8 rounded-md text-xs">
              <Link href="/dashboard/training-records">
                <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                All programmes
              </Link>
            </Button>
            <Button asChild size="sm" className="h-8 rounded-md text-xs">
              <Link href={`/dashboard/training-records/${params.enrollmentId}/report`}>
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Audit report
              </Link>
            </Button>
          </>
        }
      />

      <TrainingRecordsDisclaimer
        title={detail.isMcaPilot ? 'Mandatory pilot disclaimer' : 'Pilot disclaimer'}
      >
        {detail.disclaimer}
      </TrainingRecordsDisclaimer>

      {detail.isMcaPilot ? (
        <TrainingRecordsAttribution
          text={detail.attribution || MCA_PILOT_ATTRIBUTION}
          sourceUrl={detail.sourceUrl || MCA_PILOT_SOURCE_URL}
          oglUrl={detail.oglUrl || MCA_PILOT_OGL_URL}
        />
      ) : null}

      <TrainingRecordsStatTiles
        items={[
          {
            label: 'Digital completion',
            value: `${detail.overall.percentComplete}%`,
            hint: `${detail.overall.approved}/${detail.overall.total} digitally approved`,
            tone: detail.overall.percentComplete === 100 ? 'emerald' : 'sky',
          },
          {
            label: 'Digitally approved',
            value: detail.overall.approved,
            hint: 'Captain digital decisions',
            tone: 'emerald',
          },
          {
            label: 'Awaiting sign-off',
            value: detail.overall.awaitingSignoff,
            hint: 'Pending captain review',
            tone: 'sky',
          },
          {
            label: detail.isMcaPilot ? 'Official book signed' : 'Changes requested',
            value: detail.isMcaPilot
              ? detail.officialBookProgress?.signedInOfficialBook ?? 0
              : detail.overall.changesRequested,
            hint: detail.isMcaPilot
              ? `${detail.officialBookProgress?.discrepancies ?? 0} discrepancies · candidate-reported`
              : `${detail.overall.remaining} remaining overall`,
            tone:
              detail.isMcaPilot && (detail.officialBookProgress?.discrepancies ?? 0) > 0
                ? 'amber'
                : detail.overall.changesRequested > 0
                  ? 'amber'
                  : 'default',
          },
        ]}
      />

      {detail.overall.total > 0 ? (
        <div className="overflow-hidden rounded-md border border-border bg-background px-4 py-3 sm:px-5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium text-muted-foreground">
              Overall progress
            </span>
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
              {detail.overall.percentComplete}%
            </span>
          </div>
          <Progress value={detail.overall.percentComplete} className="h-1.5" />
        </div>
      ) : null}

      {detail.sections.map((section) => {
        const sectionTasks = detail.tasks.filter((t) => t.section_id === section.id);
        const sectionProg = detail.bySection[section.id];
        return (
          <TrainingRecordsSection
            key={section.id}
            title={section.title}
            description={`${sectionProg?.approved ?? 0}/${sectionProg?.total ?? sectionTasks.length} approved`}
            flush
            action={
              <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                {sectionProg?.percentComplete ?? 0}%
              </span>
            }
          >
            {sectionTasks.length === 0 ? (
              <p className="px-4 py-3 text-xs text-muted-foreground sm:px-5">
                No tasks in this section.
              </p>
            ) : (
              <>
                <div className="border-b border-border px-4 py-2 sm:px-5">
                  <Progress
                    value={sectionProg?.percentComplete ?? 0}
                    className="h-1"
                  />
                </div>
                <ul className="divide-y divide-border">
                  {sectionTasks.map((task) => (
                    <li
                      key={task.id}
                      className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 sm:px-5"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          <span className="mr-1.5 font-mono text-[11px] text-muted-foreground">
                            {task.task_code}
                          </span>
                          {task.title}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <TrainingStatusPill status={task.status} />
                        {task.officialBookCandidate?.official_book_status === 'signed' ? (
                          <span className="text-[10px] text-emerald-700">Official book</span>
                        ) : null}
                        {task.officialBookDiscrepancy ? (
                          <span className="text-[10px] text-amber-700">Discrepancy</span>
                        ) : null}
                        {task.progressId ? (
                          <Button
                            asChild
                            variant="outline"
                            size="sm"
                            className="h-7 rounded-md text-xs"
                          >
                            <Link
                              href={`/dashboard/training-records/${params.enrollmentId}/tasks/${task.progressId}`}
                            >
                              Open
                            </Link>
                          </Button>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </TrainingRecordsSection>
        );
      })}

      <TrainingRecordsSection title="Recent activity" flush>
        {detail.recentActivity.length === 0 ? (
          <TrainingRecordsEmpty
            title="No activity yet"
            description="Updates will appear here as you work through tasks and receive captain decisions."
          />
        ) : (
          <ul className="divide-y divide-border">
            {detail.recentActivity.map((ev) => (
              <li
                key={ev.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm sm:px-5"
              >
                <span className="capitalize text-foreground">
                  {ev.event_type.replace(/_/g, ' ')}
                </span>
                <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                  {new Date(ev.created_at).toLocaleString('en-GB')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </TrainingRecordsSection>
    </div>
  );
}
