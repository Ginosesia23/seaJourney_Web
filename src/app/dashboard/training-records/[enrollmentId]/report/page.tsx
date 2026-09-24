'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  TrainingRecordsAttribution,
  TrainingRecordsDisclaimer,
  TrainingRecordsPageHeader,
  TrainingRecordsSection,
  TrainingStatusPill,
} from '@/components/dashboard/training-records-page-ui';
import { TRB_DISCLAIMER } from '@/lib/trb/constants';
import {
  MCA_PILOT_ATTRIBUTION,
  MCA_PILOT_OGL_URL,
  MCA_PILOT_SOURCE_URL,
} from '@/lib/trb/pilot';
import { bearerHeaders } from '@/lib/applications/client';
import { useToast } from '@/hooks/use-toast';
import { useSupabase } from '@/supabase';

type Report = {
  reportId: string;
  generatedAt: string;
  disclaimer: string;
  isMcaPilot?: boolean;
  watermark?: string | null;
  notOfficialStatement?: string | null;
  attribution?: string | null;
  sourceUrl?: string | null;
  oglUrl?: string | null;
  officialBookProgress?: {
    signedInOfficialBook: number;
    total: number;
    discrepancies: number;
    percentSigned: number;
  };
  candidate: { name: string; email: string | null };
  enrollment: {
    id: string;
    startedAt: string;
    status: string;
    trb_program_versions: {
      version: string;
      trb_programs: { name: string; code: string } | null;
    } | null;
  };
  overall: { percentComplete: number; approved: number; total: number };
  sections: { id: string; title: string }[];
  tasks: {
    id: string;
    sectionId: string;
    taskCode: string;
    title: string;
    progressId: string | null;
    status: string;
    claimedCompletedAt: string | null;
    approvedAt: string | null;
    sourceTaskReference?: string | null;
    sourcePageStart?: number | null;
    sourcePageEnd?: number | null;
    officialBookCandidate?: { officialBookStatus: string } | null;
    officialBookCaptain?: { officialBookStatus: string } | null;
    officialBookDiscrepancy?: boolean;
  }[];
  evidence: {
    id: string;
    taskProgressId: string;
    originalFilename: string;
    mimeType: string;
    fileSize: number;
    createdAt: string;
  }[];
  signoffs: {
    id: string;
    taskProgressId: string;
    decision: string;
    signerName: string;
    signerEmail: string;
    signerRank: string | null;
    signerCocNumber: string | null;
    signerIssuingAuthority: string | null;
    signerVerificationStatus: string;
    decisionNotes: string | null;
    signedAt: string;
    recordHash: string;
  }[];
  auditEvents: {
    id: string;
    eventType: string;
    createdAt: string;
    actorEmail: string | null;
  }[];
};

export default function TrbAuditReportPage() {
  const params = useParams<{ enrollmentId: string }>();
  const { session } = useSupabase();
  const { toast } = useToast();
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/trb/enrollments/${params.enrollmentId}/report`,
        { headers: bearerHeaders(session.access_token) },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load report');
      setReport(json);
    } catch (e) {
      toast({
        title: 'Could not generate report',
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

  if (loading || !report) {
    return (
      <div className="flex flex-col gap-6">
        <div className="space-y-2 border-b border-border pb-5">
          <Skeleton className="h-3 w-48 rounded-md" />
          <Skeleton className="h-7 w-64 rounded-md" />
        </div>
        <Skeleton className="h-64 w-full rounded-md" />
      </div>
    );
  }

  const prog = report.enrollment.trb_program_versions?.trb_programs;

  return (
    <div className="flex flex-col gap-6 print:gap-4">
      <div className="print:hidden">
        <TrainingRecordsPageHeader
          title="Pilot programme audit report"
          breadcrumb="Audit report"
          description="Printable training-record audit trail — not an official MCA/PYA export."
          actions={
            <>
              <Button asChild variant="outline" size="sm" className="h-8 rounded-md text-xs">
                <Link href={`/dashboard/training-records/${params.enrollmentId}`}>
                  <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                  Back
                </Link>
              </Button>
              <Button
                size="sm"
                className="h-8 rounded-md text-xs"
                onClick={() => window.print()}
              >
                <Printer className="mr-1.5 h-3.5 w-3.5" />
                Print / Save PDF
              </Button>
            </>
          }
        />
      </div>

      <div className="hidden print:block space-y-1 border-b border-border pb-3">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
          SeaJourney · Training Records
        </p>
        <h1 className="text-lg font-medium">Pilot programme audit report</h1>
      </div>

      <div className="relative">
        {report.isMcaPilot ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.07] print:opacity-[0.12]"
          >
            <div className="rotate-[-24deg] text-center">
              <p className="text-4xl font-bold tracking-widest text-foreground sm:text-6xl">
                {report.watermark || 'DIGITAL COMPANION PILOT'}
              </p>
              <p className="mt-2 text-xl font-semibold tracking-wide sm:text-2xl">
                {report.notOfficialStatement || 'NOT AN OFFICIAL TRB'}
              </p>
            </div>
          </div>
        ) : null}

      <TrainingRecordsDisclaimer
        title={report.isMcaPilot ? 'About this digital record' : 'Training Record notice'}
      >
        {report.disclaimer || TRB_DISCLAIMER}
      </TrainingRecordsDisclaimer>

      {report.isMcaPilot ? (
        <TrainingRecordsAttribution
          text={report.attribution || MCA_PILOT_ATTRIBUTION}
          sourceUrl={report.sourceUrl || MCA_PILOT_SOURCE_URL}
          oglUrl={report.oglUrl || MCA_PILOT_OGL_URL}
        />
      ) : null}

      <p className="font-mono text-[11px] text-muted-foreground">
        Report ID {report.reportId} · Generated{' '}
        {new Date(report.generatedAt).toLocaleString('en-GB')}
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <TrainingRecordsSection title="Candidate">
          <p className="text-sm font-medium">{report.candidate.name}</p>
          <p className="text-[11px] text-muted-foreground">{report.candidate.email}</p>
        </TrainingRecordsSection>
        <TrainingRecordsSection title="Programme">
          <p className="text-sm font-medium">{prog?.name}</p>
          <p className="text-[11px] text-muted-foreground">
            {prog?.code} · version {report.enrollment.trb_program_versions?.version}
          </p>
          <p className="mt-1 font-mono text-[11px] tabular-nums text-muted-foreground">
            Completion {report.overall.percentComplete}% ({report.overall.approved}/
            {report.overall.total} approved)
          </p>
        </TrainingRecordsSection>
      </div>

      {report.sections.map((section) => {
        const tasks = report.tasks.filter((t) => t.sectionId === section.id);
        return (
          <TrainingRecordsSection key={section.id} title={section.title} flush>
            <ul className="divide-y divide-border">
              {tasks.map((task) => {
                const evidence = report.evidence.filter(
                  (e) => e.taskProgressId === task.progressId,
                );
                const signoffs = report.signoffs.filter(
                  (s) => s.taskProgressId === task.progressId,
                );
                return (
                  <li key={task.id} className="space-y-2 px-4 py-3 sm:px-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium">
                        <span className="mr-1.5 font-mono text-[11px] text-muted-foreground">
                          {task.taskCode}
                        </span>
                        {task.title}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        <TrainingStatusPill status={task.status} />
                        {task.officialBookCandidate ? (
                          <span className="text-[10px] text-muted-foreground">
                            Official (candidate):{' '}
                            {task.officialBookCandidate.officialBookStatus}
                          </span>
                        ) : null}
                        {task.officialBookCaptain ? (
                          <span className="text-[10px] text-muted-foreground">
                            Official (captain): {task.officialBookCaptain.officialBookStatus}
                          </span>
                        ) : null}
                        {task.officialBookDiscrepancy ? (
                          <span className="text-[10px] font-medium text-amber-700">
                            Discrepancy
                          </span>
                        ) : null}
                      </div>
                    </div>
                    {task.sourceTaskReference ? (
                      <p className="text-[10px] text-muted-foreground">
                        Source: {task.sourceTaskReference} · pp. {task.sourcePageStart}–
                        {task.sourcePageEnd}
                      </p>
                    ) : null}
                    <p className="font-mono text-[10px] text-muted-foreground">
                      Claimed:{' '}
                      {task.claimedCompletedAt
                        ? new Date(task.claimedCompletedAt).toLocaleString('en-GB')
                        : '—'}{' '}
                      · Approved:{' '}
                      {task.approvedAt
                        ? new Date(task.approvedAt).toLocaleString('en-GB')
                        : '—'}
                    </p>
                    {evidence.length > 0 ? (
                      <ul className="list-disc pl-4 text-[11px] text-muted-foreground">
                        {evidence.map((e) => (
                          <li key={e.id}>
                            {e.originalFilename} ({e.mimeType}, {e.fileSize} bytes) — no
                            public URL
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {signoffs.map((s) => (
                      <div
                        key={s.id}
                        className="rounded-md border border-border bg-muted/40 px-3 py-2 text-[11px] space-y-1"
                      >
                        <p>
                          <TrainingStatusPill status={s.decision} />{' '}
                          <span className="font-medium">{s.signerName}</span> (
                          {s.signerEmail}) · {s.signerRank} · CoC {s.signerCocNumber} ·{' '}
                          {s.signerIssuingAuthority}
                        </p>
                        <p className="text-muted-foreground">
                          Credential status: {s.signerVerificationStatus} (self-declared
                          unless separately verified)
                        </p>
                        {s.decisionNotes ? <p>Notes: {s.decisionNotes}</p> : null}
                        <p className="font-mono text-[10px] text-muted-foreground break-all">
                          {new Date(s.signedAt).toLocaleString('en-GB')} · {s.recordHash}
                        </p>
                      </div>
                    ))}
                  </li>
                );
              })}
            </ul>
          </TrainingRecordsSection>
        );
      })}

      <TrainingRecordsSection title="Audit event summary" flush>
        <ul className="divide-y divide-border">
          {report.auditEvents.map((ev) => (
            <li
              key={ev.id}
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-[11px] sm:px-5"
            >
              <span className="capitalize">
                {ev.eventType.replace(/_/g, ' ')}
                {ev.actorEmail ? ` · ${ev.actorEmail}` : ''}
              </span>
              <span className="font-mono tabular-nums text-muted-foreground">
                {new Date(ev.createdAt).toLocaleString('en-GB')}
              </span>
            </li>
          ))}
        </ul>
      </TrainingRecordsSection>

      <p className="border-t border-border pt-4 text-[11px] text-muted-foreground">
        Digital companion only. Does not claim MCA or PYA acceptance of an electronic
        Training Record Book.
      </p>
      </div>
    </div>
  );
}
