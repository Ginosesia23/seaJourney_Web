'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Download, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
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
import { MCA_PILOT_ATTRIBUTION, MCA_PILOT_OGL_URL, MCA_PILOT_SOURCE_URL } from '@/lib/trb/pilot';
import { bearerHeaders } from '@/lib/applications/client';
import { useToast } from '@/hooks/use-toast';
import { useSupabase } from '@/supabase';

type TaskRow = {
  id: string;
  sectionId: string;
  taskCode: string;
  title: string;
  progressId: string | null;
  status: string;
  officialBookDiscrepancy?: boolean;
  officialBookCandidate?: { officialBookStatus: string } | null;
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
  userId: string;
  email: string;
  fullName: string | null;
  rank: string | null;
  source: string;
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
  const [signerEmail, setSignerEmail] = useState('');
  const [signerName, setSignerName] = useState('');
  const [optionalMessage, setOptionalMessage] = useState('');
  const [vesselName, setVesselName] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadingSigners, setLoadingSigners] = useState(false);

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
    if (!session?.access_token || !signerEmail || !signerName.trim()) return;
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
          signerName: signerName.trim(),
          signerEmail: signerEmail.trim(),
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
        description: `${json.taskCount || selected.size} task(s) sent to ${signerEmail}.`,
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

      {detail.sections.map((section) => {
        const sectionTasks = detail.tasks.filter((t) => t.sectionId === section.id);
        const sectionProg = detail.bySection[section.id];
        const sectionEligible = eligible.filter((t) => t.sectionId === section.id);
        return (
          <TrainingRecordsSection
            key={section.id}
            title={section.title}
            description={`${sectionProg?.approved ?? 0}/${sectionProg?.total ?? sectionTasks.length} approved`}
            flush
            action={
              <div className="flex items-center gap-2">
                {sectionEligible.length > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 rounded-md text-xs"
                    onClick={() => selectAllInSection(section.id)}
                  >
                    Select eligible
                  </Button>
                ) : null}
                <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                  {sectionProg?.percentComplete ?? 0}%
                </span>
              </div>
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
                  {sectionTasks.map((task) => {
                    const canSelect =
                      Boolean(task.progressId) &&
                      eligibleIds.has(task.progressId as string);
                    return (
                      <li
                        key={task.id}
                        className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 sm:px-5"
                      >
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
                            <span className="mt-0.5 inline-block h-4 w-4" aria-hidden />
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground">
                              <span className="mr-1.5 font-mono text-[11px] text-muted-foreground">
                                {task.taskCode}
                              </span>
                              {task.title}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <TrainingStatusPill status={task.status} />
                          {task.officialBookCandidate?.officialBookStatus === 'signed' ? (
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
                    );
                  })}
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
                <Label>Officer / captain</Label>
                {signers.length > 0 ? (
                  <Select
                    value={signerEmail}
                    onValueChange={(email) => {
                      setSignerEmail(email);
                      const s = signers.find((x) => x.email === email);
                      if (s?.fullName) setSignerName(s.fullName);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select signer" />
                    </SelectTrigger>
                    <SelectContent>
                      {signers.map((s) => (
                        <SelectItem key={s.userId || s.email} value={s.email}>
                          {s.fullName || s.email}
                          {s.rank ? ` · ${s.rank}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-xs text-amber-700">
                    No roster officers found for your active vessel. Confirm vessel
                    assignment and signing authorities, or add details below if your
                    programme allows external invite.
                  </p>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="signerName">Signer name</Label>
                  <Input
                    id="signerName"
                    value={signerName}
                    onChange={(e) => setSignerName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="signerEmail">Signer email</Label>
                  <Input
                    id="signerEmail"
                    type="email"
                    value={signerEmail}
                    onChange={(e) => setSignerEmail(e.target.value)}
                  />
                </div>
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
                !signerEmail.trim() ||
                !signerName.trim()
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
