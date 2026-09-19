'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { BookOpen, Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import {
  TrainingRecordsAttribution,
  TrainingRecordsDisclaimer,
  TrainingRecordsEmpty,
  TrainingRecordsPageHeader,
  TrainingRecordsSection,
  TrainingStatusPill,
} from '@/components/dashboard/training-records-page-ui';
import { TRB_DISCLAIMER } from '@/lib/trb/constants';
import {
  MCA_PILOT_ATTRIBUTION,
  MCA_PILOT_CONSENT_VERSION,
  MCA_PILOT_DISCLAIMER,
  MCA_PILOT_DISCLAIMER_VERSION,
  MCA_PILOT_OGL_URL,
  MCA_PILOT_PROGRAM_CODE,
  MCA_PILOT_SOURCE_URL,
} from '@/lib/trb/pilot';
import { bearerHeaders } from '@/lib/applications/client';
import { useToast } from '@/hooks/use-toast';
import { useSupabase } from '@/supabase';

type Program = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_official: boolean;
  isMcaPilot?: boolean;
  recognition_status?: string;
  source_url?: string | null;
  versions: {
    id: string;
    version: string;
    status: string;
    disclaimer: string;
    pilot_disclaimer?: string;
    attribution_html?: string;
  }[];
};

type Enrollment = {
  id: string;
  status: string;
  started_at: string;
  program_version_id: string;
  trb_program_versions: {
    version: string;
    status: string;
    disclaimer: string;
    trb_programs: { name: string; code: string; is_official: boolean } | null;
  } | null;
};

const emptyConsent = {
  understandsTrial: false,
  doesNotReplaceOfficialTrb: false,
  willMaintainOfficialTrb: false,
  feedbackMayBeAnalysed: false,
  noMcaPyaApprovalImplied: false,
};

export default function TrainingRecordsPage() {
  const { session } = useSupabase();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [consentOpenFor, setConsentOpenFor] = useState<string | null>(null);
  const [consent, setConsent] = useState(emptyConsent);

  const load = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    try {
      const res = await fetch('/api/trb/enrollments', {
        headers: bearerHeaders(session.access_token),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load');
      setPrograms(json.programs || []);
      setEnrollments(json.enrollments || []);
    } catch (e) {
      toast({
        title: 'Could not load training records',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [session?.access_token, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function enrol(program: Program) {
    if (!session?.access_token) return;
    const isMca = program.isMcaPilot || program.code === MCA_PILOT_PROGRAM_CODE;
    if (isMca) {
      const all =
        consent.understandsTrial &&
        consent.doesNotReplaceOfficialTrb &&
        consent.willMaintainOfficialTrb &&
        consent.feedbackMayBeAnalysed &&
        consent.noMcaPyaApprovalImplied;
      if (!all) {
        toast({
          title: 'Consent required',
          description: 'Confirm all pilot consent statements before enroling.',
          variant: 'destructive',
        });
        return;
      }
    }

    setEnrolling(true);
    try {
      const res = await fetch('/api/trb/enrollments', {
        method: 'POST',
        headers: {
          ...bearerHeaders(session.access_token),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          programCode: program.code,
          ...(isMca
            ? {
                consent: {
                  understandsTrial: true as const,
                  doesNotReplaceOfficialTrb: true as const,
                  willMaintainOfficialTrb: true as const,
                  feedbackMayBeAnalysed: true as const,
                  noMcaPyaApprovalImplied: true as const,
                  consentVersion: MCA_PILOT_CONSENT_VERSION,
                  disclaimerVersion: MCA_PILOT_DISCLAIMER_VERSION,
                },
              }
            : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Enrolment failed');
      toast({
        title: json.alreadyEnrolled ? 'Already enrolled' : 'Enrolled',
        description: json.alreadyEnrolled
          ? 'Opening your existing programme.'
          : isMca
            ? 'MCA digital companion pilot started. Continue maintaining your official TRB.'
            : 'Demonstration task tracker started for this pilot programme.',
      });
      setConsentOpenFor(null);
      setConsent(emptyConsent);
      await load();
      if (json.enrollmentId) {
        window.location.href = `/dashboard/training-records/${json.enrollmentId}`;
      }
    } catch (e) {
      toast({
        title: 'Enrolment failed',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setEnrolling(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="space-y-2 border-b border-border pb-5">
          <Skeleton className="h-3 w-40 rounded-md" />
          <Skeleton className="h-7 w-56 rounded-md" />
          <Skeleton className="h-4 w-96 max-w-full rounded-md" />
        </div>
        <Skeleton className="h-16 w-full rounded-md" />
        <Skeleton className="h-48 w-full rounded-md" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <TrainingRecordsPageHeader
        title="Digital TRB Companion"
        description="Pilot training-task tracker for captain-reviewed training evidence."
      />

      <TrainingRecordsDisclaimer>{TRB_DISCLAIMER}</TrainingRecordsDisclaimer>

      <TrainingRecordsSection
        title="Your enrolments"
        description="Programmes you have started"
        flush={enrollments.length > 0}
      >
        {enrollments.length === 0 ? (
          <TrainingRecordsEmpty
            title="No enrolments yet"
            description="Enrol in a demonstration or (if authorised) the private MCA pilot below."
          />
        ) : (
          <ul className="divide-y divide-border">
            {enrollments.map((e) => {
              const prog = e.trb_program_versions?.trb_programs;
              const isMca = prog?.code === MCA_PILOT_PROGRAM_CODE;
              return (
                <li
                  key={e.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-foreground">
                        {prog?.name || 'Training programme'}
                      </p>
                      <TrainingStatusPill status={e.status} />
                      {isMca ? (
                        <>
                          <span className="rounded border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-700">
                            Private pilot
                          </span>
                          <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                            Not officially approved
                          </span>
                        </>
                      ) : null}
                      <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                        v{e.trb_program_versions?.version}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Started {new Date(e.started_at).toLocaleDateString('en-GB')}
                    </p>
                  </div>
                  <Button asChild size="sm" className="h-8 rounded-md text-xs">
                    <Link href={`/dashboard/training-records/${e.id}`}>
                      <BookOpen className="mr-1.5 h-3.5 w-3.5" />
                      Open
                    </Link>
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </TrainingRecordsSection>

      <TrainingRecordsSection
        title="Available programmes"
        description="Demonstration content always listed; MCA pilot only if enabled and you are allowlisted"
        flush={programs.length > 0}
      >
        {programs.length === 0 ? (
          <TrainingRecordsEmpty
            title="No programmes available"
            description="Ask an admin to run the demonstration seed SQL."
          />
        ) : (
          <ul className="divide-y divide-border">
            {programs.map((p) => {
              const isMca = Boolean(p.isMcaPilot) || p.code === MCA_PILOT_PROGRAM_CODE;
              const showConsent = consentOpenFor === p.code;
              return (
                <li key={p.id} className="px-4 py-3 sm:px-5 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <p className="text-sm font-medium text-foreground">{p.name}</p>
                      {p.description ? (
                        <p className="max-w-xl text-[11px] text-muted-foreground">
                          {p.description}
                        </p>
                      ) : null}
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {p.code}
                        </span>
                        {isMca ? (
                          <>
                            <span className="rounded border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-700">
                              Private pilot
                            </span>
                            <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                              Not officially approved
                            </span>
                          </>
                        ) : (
                          <span className="inline-flex items-center rounded border border-border bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                            Demonstration
                          </span>
                        )}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      className="h-8 rounded-md text-xs"
                      disabled={enrolling || !p.versions?.length}
                      onClick={() => {
                        if (isMca) {
                          setConsentOpenFor(p.code);
                          setConsent(emptyConsent);
                        } else {
                          void enrol(p);
                        }
                      }}
                    >
                      {enrolling ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Plus className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      {isMca ? 'Enrol in private pilot' : 'Enrol in pilot'}
                    </Button>
                  </div>

                  {showConsent && isMca ? (
                    <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
                      <TrainingRecordsDisclaimer title="Mandatory pilot disclaimer">
                        {p.versions[0]?.pilot_disclaimer ||
                          p.versions[0]?.disclaimer ||
                          MCA_PILOT_DISCLAIMER}
                      </TrainingRecordsDisclaimer>
                      <TrainingRecordsAttribution
                        text={p.versions[0]?.attribution_html || MCA_PILOT_ATTRIBUTION}
                        sourceUrl={p.source_url || MCA_PILOT_SOURCE_URL}
                        oglUrl={MCA_PILOT_OGL_URL}
                      />
                      <p className="text-[11px] text-muted-foreground">
                        This trial includes <strong>one official section only</strong>: PART 3 —
                        Maintain a Safe Navigational Watch (PDF pages 55–57). You must continue
                        obtaining signatures in your official TRB in parallel.
                      </p>
                      {(
                        [
                          ['understandsTrial', 'I understand this is a digital companion trial.'],
                          [
                            'doesNotReplaceOfficialTrb',
                            'I understand it does not replace the official Training Record Book.',
                          ],
                          [
                            'willMaintainOfficialTrb',
                            'I will continue maintaining and obtaining required signatures in the official TRB.',
                          ],
                          [
                            'feedbackMayBeAnalysed',
                            'I agree that trial activity and feedback may be analysed to improve the workflow.',
                          ],
                          [
                            'noMcaPyaApprovalImplied',
                            'I understand no MCA or PYA approval is implied.',
                          ],
                        ] as const
                      ).map(([key, label]) => (
                        <label
                          key={key}
                          className="flex items-start gap-2 text-xs text-muted-foreground"
                        >
                          <Checkbox
                            className="mt-0.5"
                            checked={consent[key]}
                            onCheckedChange={(v) =>
                              setConsent((c) => ({ ...c, [key]: v === true }))
                            }
                          />
                          <span>{label}</span>
                        </label>
                      ))}
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          className="h-8 rounded-md text-xs"
                          disabled={enrolling}
                          onClick={() => void enrol(p)}
                        >
                          Confirm consent and enrol
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 rounded-md text-xs"
                          onClick={() => {
                            setConsentOpenFor(null);
                            setConsent(emptyConsent);
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </TrainingRecordsSection>
    </div>
  );
}
