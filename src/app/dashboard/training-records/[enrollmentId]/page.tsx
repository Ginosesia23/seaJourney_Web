'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, ChevronDown, Download, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  TrainingRecordsAttribution,
  TrainingRecordsDisclaimer,
  TrainingRecordsEmpty,
  TrainingRecordsPageHeader,
  TrainingRecordsSection,
  TrainingRecordsStatTiles,
  TrainingStatusPill,
} from '@/components/dashboard/training-records-page-ui';
import { cn } from '@/lib/utils';
import { MCA_PILOT_ATTRIBUTION, MCA_PILOT_OGL_URL, MCA_PILOT_SOURCE_URL } from '@/lib/trb/pilot';
import { bearerHeaders } from '@/lib/applications/client';
import { useToast } from '@/hooks/use-toast';
import { useSupabase } from '@/supabase';

type TaskSignoffSummary = {
  id: string;
  decision: string;
  signerName: string;
  signerEmail: string;
  signerRank?: string | null;
  decisionNotes?: string | null;
  signedAt: string;
};

type TaskRow = {
  id: string;
  sectionId: string;
  taskCode: string;
  title: string;
  progressId: string | null;
  status: string;
  latestSignoff?: TaskSignoffSummary | null;
  officialBookDiscrepancy?: boolean;
  officialBookCandidate?: { officialBookStatus: string } | null;
};

type Detail = {
  disclaimer: string;
  companionNotice?: string | null;
  isMcaPilot?: boolean;
  isOowYachts3000?: boolean;
  attribution?: string | null;
  sourceUrl?: string | null;
  oglUrl?: string | null;
  programmeSource?: {
    programCode?: string | null;
    programName?: string | null;
    programVersion?: string | null;
    versionStatus?: string | null;
    recognitionStatus?: string | null;
    sourceAuthority?: string | null;
    sourceTitle?: string | null;
    sourceUrl?: string | null;
    sourcePublishedAt?: string | null;
    sourceLicense?: string | null;
    sourceLicenseUrl?: string | null;
    sourcePdfFilename?: string | null;
    sourceDocumentSha256?: string | null;
    sourceRevisionLabel?: string | null;
    sourceVersionReference?: string | null;
    sourceCheckedAt?: string | null;
    contentProvenance?: string | null;
    companionNotice?: string | null;
    supersededByVersionId?: string | null;
    isOfficial?: boolean;
  } | null;
  enrollment: {
    id: string;
    status: string;
    started_at: string;
    trb_program_versions: {
      version: string;
      trb_programs: { name: string; code: string } | null;
    } | null;
  };
  sections: {
    id: string;
    title: string;
    sort_order: number;
    sourceSectionReference?: string | null;
  }[];
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
    eventType: string;
    createdAt: string;
    actorEmail: string | null;
  }[];
};

type EligibleTask = {
  taskProgressId: string;
  taskCode: string | null;
  title: string | null;
  sectionId: string | null;
  sectionTitle: string | null;
  selectable: boolean;
};

type Signer = {
  userId: string | null;
  email: string;
  fullName: string | null;
  rank: string | null;
  source: string;
  eligibilityLabel?: string;
  isVesselManager?: boolean;
  vesselRole?: string | null;
  authorityExpiresAt?: string | null;
};

type BatchRequestSummary = {
  id: string;
  status: string;
  signerEmail: string;
  signerName: string | null;
  createdAt: string;
  taskCount: number;
  counts: {
    approved: number;
    changesRequested: number;
    rejected: number;
    pending: number;
  };
};

export default function EnrollmentDetailPage() {
  const params = useParams<{ enrollmentId: string }>();
  const { session } = useSupabase();
  const { toast } = useToast();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [eligible, setEligible] = useState<EligibleTask[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchRequests, setBatchRequests] = useState<BatchRequestSummary[]>([]);
  const [requestOpen, setRequestOpen] = useState(false);
  const [signers, setSigners] = useState<Signer[]>([]);
  const [signerUserId, setSignerUserId] = useState<string | null>(null);
  const [signerEmail, setSignerEmail] = useState('');
  const [signerName, setSignerName] = useState('');
  const [optionalMessage, setOptionalMessage] = useState('');
  const [vesselName, setVesselName] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadingSigners, setLoadingSigners] = useState(false);
  const [openSections, setOpenSections] = useState<string[]>([]);
  const [sectionsInitialized, setSectionsInitialized] = useState(false);

  const load = useCallback(async () => {
    if (!session?.access_token || !params.enrollmentId) return;
    setLoading(true);
    try {
      const [detailRes, eligibleRes, batchRes] = await Promise.all([
        fetch(`/api/trb/enrollments/${params.enrollmentId}`, {
          headers: bearerHeaders(session.access_token),
        }),
        fetch(
          `/api/trb/signoff/batch?enrollmentId=${encodeURIComponent(params.enrollmentId)}`,
          { headers: bearerHeaders(session.access_token) },
        ),
        fetch(
          `/api/trb/enrollments/${params.enrollmentId}/batch-requests`,
          { headers: bearerHeaders(session.access_token) },
        ),
      ]);
      const detailJson = await detailRes.json();
      if (!detailRes.ok) throw new Error(detailJson.error || 'Failed to load');
      setDetail(detailJson);
      if (eligibleRes.ok) {
        const ej = await eligibleRes.json();
        setEligible(ej.tasks || []);
      }
      if (batchRes.ok) {
        const bj = await batchRes.json();
        setBatchRequests(bj.requests || []);
      }
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

  // Reset accordion defaults when switching enrolments.
  useEffect(() => {
    setSectionsInitialized(false);
    setOpenSections([]);
  }, [params.enrollmentId]);

  // Default: expand the first incomplete section (or the first section).
  useEffect(() => {
    if (!detail?.sections?.length || sectionsInitialized) return;
    const firstIncomplete = detail.sections.find((section) => {
      const prog = detail.bySection[section.id];
      if (!prog) return true;
      return prog.approved < prog.total;
    });
    setOpenSections([(firstIncomplete || detail.sections[0]).id]);
    setSectionsInitialized(true);
  }, [detail, sectionsInitialized]);

  const allSectionIds = useMemo(
    () => (detail?.sections || []).map((s) => s.id),
    [detail?.sections],
  );

  const eligibleIds = useMemo(
    () => new Set(eligible.map((t) => t.taskProgressId)),
    [eligible],
  );

  const selectedTasks = useMemo(
    () => eligible.filter((t) => selected.has(t.taskProgressId)),
    [eligible, selected],
  );

  const selectedSections = useMemo(() => {
    const titles = new Set(
      selectedTasks.map((t) => t.sectionTitle).filter(Boolean) as string[],
    );
    return [...titles];
  }, [selectedTasks]);

  function toggleTask(progressId: string) {
    if (!eligibleIds.has(progressId)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(progressId)) next.delete(progressId);
      else next.add(progressId);
      return next;
    });
  }

  function selectAllInSection(sectionId: string) {
    const ids = eligible
      .filter((t) => t.sectionId === sectionId)
      .map((t) => t.taskProgressId);
    setSelected((prev) => {
      const next = new Set(prev);
      const allSelected = ids.every((id) => next.has(id));
      if (allSelected) {
        for (const id of ids) next.delete(id);
      } else {
        for (const id of ids) next.add(id);
      }
      return next;
    });
  }

  async function openRequestFlow() {
    if (!session?.access_token || selected.size === 0) return;
    setRequestOpen(true);
    setLoadingSigners(true);
    try {
      const qs = new URLSearchParams({ enrollmentId: params.enrollmentId });
      for (const id of selected) qs.append('taskProgressId', id);
      const res = await fetch(`/api/trb/signoff/batch?${qs}`, {
        headers: bearerHeaders(session.access_token),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not load signers');
      setSigners(json.signers || []);
      setVesselName(json.vesselName || null);
      if (json.signers?.[0]) {
        setSignerUserId(json.signers[0].userId || null);
        setSignerEmail(json.signers[0].email);
        setSignerName(json.signers[0].fullName || '');
      }
    } catch (e) {
      toast({
        title: 'Could not load eligible officers',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
      setRequestOpen(false);
    } finally {
      setLoadingSigners(false);
    }
  }

  async function submitBatchRequest() {
    if (!session?.access_token || !signerUserId) return;
    setSubmitting(true);
    try {
      const idempotencyKey =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `batch-${Date.now()}`;
      const res = await fetch('/api/trb/signoff/batch', {
        method: 'POST',
        headers: {
          ...bearerHeaders(session.access_token),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          enrollmentId: params.enrollmentId,
          taskProgressIds: [...selected],
          signerUserId,
          signerName: signerName.trim() || undefined,
          signerEmail: signerEmail.trim() || undefined,
          authorisedConfirmation: true,
          optionalMessage: optionalMessage.trim() || undefined,
          idempotencyKey,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || json.code || 'Request failed');
      }
      toast({
        title: 'Sign-off requested',
        description: `${json.taskCount || selected.size} task(s) sent to ${signerName || signerEmail}.`,
      });
      setRequestOpen(false);
      setSelected(new Set());
      setOptionalMessage('');
      await load();
    } catch (e) {
      toast({
        title: 'Could not request sign-off',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  }

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
    <div className="flex flex-col gap-6 pb-24">
      <TrainingRecordsPageHeader
        title={prog?.name || 'Training programme'}
        breadcrumb={prog?.name || 'Programme'}
        description={`Version ${detail.enrollment.trb_program_versions?.version} · Training Record`}
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
        title={detail.isMcaPilot ? 'About this digital record' : 'Training Record notice'}
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

      {detail.programmeSource?.sourceRevisionLabel ||
      detail.programmeSource?.sourceAuthority ? (
        <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground space-y-1">
          <p>
            <span className="font-medium text-foreground">Source:</span>{' '}
            {detail.programmeSource.sourceAuthority || 'Maritime and Coastguard Agency'}
            {detail.programmeSource.sourceRevisionLabel
              ? ` · ${detail.programmeSource.sourceRevisionLabel}`
              : ''}
          </p>
          {detail.programmeSource.sourcePublishedAt ? (
            <p>GOV.UK publication: {detail.programmeSource.sourcePublishedAt}</p>
          ) : null}
          {detail.programmeSource.contentProvenance ? (
            <p>{detail.programmeSource.contentProvenance}</p>
          ) : (
            <p>
              Currently published in SeaJourney: Parts 1–5 signable task sections from the MCA
              Yacht Training Record Book (personal details / service forms excluded).
            </p>
          )}
          {(detail.programmeSource.sourceUrl || detail.sourceUrl) ? (
            <a
              className="text-sky-700 underline"
              href={detail.programmeSource.sourceUrl || detail.sourceUrl || MCA_PILOT_SOURCE_URL}
              target="_blank"
              rel="noreferrer"
            >
              View source
            </a>
          ) : null}
        </div>
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

      {batchRequests.length > 0 ? (
        <TrainingRecordsSection
          title="Grouped sign-off requests"
          description="Multi-task requests you have sent for this programme"
          flush
        >
          <ul className="divide-y divide-border">
            {batchRequests.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 sm:px-5"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {r.taskCount} task{r.taskCount === 1 ? '' : 's'} ·{' '}
                    {r.signerName || r.signerEmail}
                  </p>
                  <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
                    {new Date(r.createdAt).toLocaleString('en-GB')}
                    {r.status !== 'pending'
                      ? ` · ${r.counts.approved} approved · ${r.counts.changesRequested} changes · ${r.counts.rejected} rejected`
                      : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <TrainingStatusPill status={r.status} />
                  <Button asChild variant="outline" size="sm" className="h-7 rounded-md text-xs">
                    <Link
                      href={`/dashboard/training-records/${params.enrollmentId}/requests/${r.id}`}
                    >
                      View
                    </Link>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </TrainingRecordsSection>
      ) : null}

      <div className="overflow-hidden rounded-md border border-border bg-background">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/40 px-4 py-2.5">
          <div className="min-w-0">
            <h2 className="text-xs font-medium text-foreground">Programme sections</h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {detail.sections.length} sections · {detail.overall.total} tasks · expand a
              section to work through its tasks
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 rounded-md text-xs"
              onClick={() => setOpenSections(allSectionIds)}
              disabled={allSectionIds.length === 0}
            >
              Expand all
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 rounded-md text-xs"
              onClick={() => setOpenSections([])}
              disabled={openSections.length === 0}
            >
              Collapse all
            </Button>
          </div>
        </div>

        {detail.sections.length === 0 ? (
          <p className="px-4 py-3 text-xs text-muted-foreground sm:px-5">
            No sections in this programme yet.
          </p>
        ) : (
          <Accordion
            type="multiple"
            value={openSections}
            onValueChange={setOpenSections}
            className="divide-y divide-border"
          >
            {detail.sections.map((section) => {
              const sectionTasks = detail.tasks.filter((t) => t.sectionId === section.id);
              const sectionProg = detail.bySection[section.id];
              const sectionEligible = eligible.filter((t) => t.sectionId === section.id);
              const approved = sectionProg?.approved ?? 0;
              const total = sectionProg?.total ?? sectionTasks.length;
              const percent = sectionProg?.percentComplete ?? 0;

              return (
                <AccordionItem
                  key={section.id}
                  value={section.id}
                  className="border-0"
                >
                  <div className="flex items-stretch gap-1 pr-2 sm:pr-3">
                    <AccordionTrigger className="flex-1 items-center gap-3 px-4 py-3 text-left hover:no-underline sm:px-5 [&[data-state=open]>svg]:rotate-180">
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-sm font-medium text-foreground">
                            {section.title}
                          </span>
                          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                            {approved}/{total} approved · {percent}%
                          </span>
                          {sectionEligible.length > 0 ? (
                            <span className="rounded border border-violet-500/25 bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 dark:text-violet-300">
                              {sectionEligible.length} ready
                            </span>
                          ) : null}
                        </div>
                        <Progress value={percent} className="h-1 max-w-md" />
                      </div>
                    </AccordionTrigger>
                    {sectionEligible.length > 0 ? (
                      <div className="flex items-center py-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 shrink-0 rounded-md text-xs"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            selectAllInSection(section.id);
                            setOpenSections((prev) =>
                              prev.includes(section.id) ? prev : [...prev, section.id],
                            );
                          }}
                        >
                          Select eligible
                        </Button>
                      </div>
                    ) : null}
                  </div>

                  <AccordionContent className="pb-0 pt-0">
                    {sectionTasks.length === 0 ? (
                      <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground sm:px-5">
                        No tasks in this section.
                      </p>
                    ) : (
                      <ul className="divide-y divide-border border-t border-border">
                        {sectionTasks.map((task) => {
                          const canSelect =
                            Boolean(task.progressId) &&
                            eligibleIds.has(task.progressId as string);
                          const signoff = task.latestSignoff;
                          const canExpandSignoff = Boolean(signoff);

                          const rowMain = (
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div className="flex min-w-0 items-start gap-3">
                                {canSelect ? (
                                  <Checkbox
                                    checked={selected.has(task.progressId as string)}
                                    onCheckedChange={() =>
                                      toggleTask(task.progressId as string)
                                    }
                                    aria-label={`Select ${task.taskCode}`}
                                    className="mt-0.5"
                                  />
                                ) : (
                                  <span
                                    className="mt-0.5 inline-block h-4 w-4"
                                    aria-hidden
                                  />
                                )}
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-foreground">
                                    <span className="mr-1.5 font-mono text-[11px] text-muted-foreground">
                                      {task.taskCode}
                                    </span>
                                    {task.title}
                                  </p>
                                  {signoff ? (
                                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                                      {signoff.decision === 'approved'
                                        ? 'Signed off'
                                        : signoff.decision === 'changes_requested'
                                          ? 'Changes requested'
                                          : signoff.decision === 'rejected'
                                            ? 'Rejected'
                                            : 'Reviewed'}{' '}
                                      by {signoff.signerName || signoff.signerEmail}
                                      {' · '}
                                      {new Date(signoff.signedAt).toLocaleDateString('en-GB')}
                                    </p>
                                  ) : null}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <TrainingStatusPill status={task.status} />
                                {task.officialBookCandidate?.officialBookStatus ===
                                'signed' ? (
                                  <span className="text-[10px] text-emerald-700">
                                    Official book
                                  </span>
                                ) : null}
                                {task.officialBookDiscrepancy ? (
                                  <span className="text-[10px] text-amber-700">
                                    Discrepancy
                                  </span>
                                ) : null}
                                {canExpandSignoff ? (
                                  <CollapsibleTrigger asChild>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 rounded-md px-2 text-xs text-muted-foreground hover:text-foreground"
                                    >
                                      Details
                                      <ChevronDown className="ml-1 h-3.5 w-3.5 transition-transform group-data-[state=open]/signoff:rotate-180" />
                                    </Button>
                                  </CollapsibleTrigger>
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
                            </div>
                          );

                          if (!canExpandSignoff || !signoff) {
                            return (
                              <li key={task.id} className="px-4 py-2.5 sm:px-5">
                                {rowMain}
                              </li>
                            );
                          }

                          return (
                            <li key={task.id} className="px-4 py-2.5 sm:px-5">
                              <Collapsible className="group/signoff">
                                {rowMain}
                                <CollapsibleContent>
                                  <div
                                    className={cn(
                                      'mt-2.5 rounded-md border px-3 py-2.5 text-xs',
                                      signoff.decision === 'approved' &&
                                        'border-emerald-500/20 bg-emerald-500/[0.06]',
                                      signoff.decision === 'changes_requested' &&
                                        'border-amber-500/20 bg-amber-500/[0.06]',
                                      signoff.decision === 'rejected' &&
                                        'border-destructive/20 bg-destructive/[0.06]',
                                      !['approved', 'changes_requested', 'rejected'].includes(
                                        signoff.decision,
                                      ) && 'border-border bg-muted/30',
                                    )}
                                  >
                                    <dl className="grid gap-2 sm:grid-cols-2">
                                      <div>
                                        <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                          Decision
                                        </dt>
                                        <dd className="mt-0.5 capitalize text-foreground">
                                          {signoff.decision.replace(/_/g, ' ')}
                                        </dd>
                                      </div>
                                      <div>
                                        <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                          When
                                        </dt>
                                        <dd className="mt-0.5 font-mono tabular-nums text-foreground">
                                          {new Date(signoff.signedAt).toLocaleString('en-GB')}
                                        </dd>
                                      </div>
                                      <div className="sm:col-span-2">
                                        <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                          Signed by
                                        </dt>
                                        <dd className="mt-0.5 text-foreground">
                                          {signoff.signerName || 'Officer'}
                                          {signoff.signerRank
                                            ? ` · ${signoff.signerRank}`
                                            : ''}
                                          <span className="mt-0.5 block text-muted-foreground">
                                            {signoff.signerEmail}
                                          </span>
                                        </dd>
                                      </div>
                                      <div className="sm:col-span-2">
                                        <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                          Comments
                                        </dt>
                                        <dd className="mt-0.5 whitespace-pre-wrap text-foreground">
                                          {signoff.decisionNotes?.trim()
                                            ? signoff.decisionNotes.trim()
                                            : 'No comments left with this decision.'}
                                        </dd>
                                      </div>
                                    </dl>
                                  </div>
                                </CollapsibleContent>
                              </Collapsible>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        )}
      </div>
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
                  {ev.eventType.replace(/_/g, ' ')}
                </span>
                <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                  {new Date(ev.createdAt).toLocaleString('en-GB')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </TrainingRecordsSection>

      {selected.size > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                {selected.size} task{selected.size === 1 ? '' : 's'} selected
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                {selectedSections.join(' · ') || 'Ready for assessment'}
                {' · '}
                {selectedTasks
                  .slice(0, 3)
                  .map((t) => t.taskCode || t.title)
                  .join(', ')}
                {selectedTasks.length > 3 ? ` +${selectedTasks.length - 3}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 rounded-md text-xs"
                onClick={() => setSelected(new Set())}
              >
                <X className="mr-1 h-3.5 w-3.5" />
                Clear
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-8 rounded-md text-xs"
                onClick={() => void openRequestFlow()}
              >
                Request sign-off
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <Dialog open={requestOpen} onOpenChange={setRequestOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Request grouped sign-off</DialogTitle>
            <DialogDescription>
              Send {selected.size} task{selected.size === 1 ? '' : 's'} to one eligible
              officer or captain. Digital approval is a SeaJourney companion record only.
            </DialogDescription>
          </DialogHeader>

          {loadingSigners ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading eligible officers…
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
                <p className="font-medium text-foreground">Selected tasks</p>
                <ul className="mt-1 max-h-28 space-y-0.5 overflow-y-auto text-muted-foreground">
                  {selectedTasks.map((t) => (
                    <li key={t.taskProgressId}>
                      {t.taskCode} · {t.title}
                      {t.sectionTitle ? ` (${t.sectionTitle})` : ''}
                    </li>
                  ))}
                </ul>
                {vesselName ? (
                  <p className="mt-2 text-muted-foreground">Vessel: {vesselName}</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label>Eligible Training Record signer</Label>
                {signers.length > 0 ? (
                  <Select
                    value={signerUserId || ''}
                    onValueChange={(id) => {
                      setSignerUserId(id);
                      const s = signers.find((x) => x.userId === id);
                      if (s) {
                        setSignerEmail(s.email);
                        setSignerName(s.fullName || '');
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select signer" />
                    </SelectTrigger>
                    <SelectContent>
                      {signers
                        .filter((s) => s.userId)
                        .map((s) => (
                          <SelectItem key={s.userId!} value={s.userId!}>
                            {s.fullName || s.email}
                            {s.eligibilityLabel
                              ? ` · ${s.eligibilityLabel}`
                              : s.rank
                                ? ` · ${s.rank}`
                                : ''}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-xs text-amber-700">
                    No eligible Training Record signers yet. Ask the vessel manager to enable{' '}
                    <span className="font-medium">Training Record sign-off</span> for a captain or
                    themselves under Dashboard → Vessel roles (managing the vessel alone is not
                    enough).
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="msg">Message (optional)</Label>
                <Textarea
                  id="msg"
                  rows={3}
                  value={optionalMessage}
                  onChange={(e) => setOptionalMessage(e.target.value)}
                  placeholder="Applies to the whole request"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRequestOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void submitBatchRequest()}
              disabled={
                submitting ||
                loadingSigners ||
                !signerUserId
              }
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Sending…
                </>
              ) : (
                'Submit request'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
