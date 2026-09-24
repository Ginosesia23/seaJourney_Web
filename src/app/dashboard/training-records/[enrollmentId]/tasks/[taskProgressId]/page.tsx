'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, ChevronDown, Loader2, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  TrainingRecordsAttribution,
  TrainingRecordsDisclaimer,
  TrainingRecordsPageHeader,
  TrainingRecordsSection,
  TrainingStatusPill,
} from '@/components/dashboard/training-records-page-ui';
import {
  MCA_PILOT_ATTRIBUTION,
  MCA_PILOT_OGL_URL,
  MCA_PILOT_SOURCE_URL,
} from '@/lib/trb/pilot';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { bearerHeaders } from '@/lib/applications/client';
import { useToast } from '@/hooks/use-toast';
import { useSupabase } from '@/supabase';

type TaskDetail = {
  disclaimer: string;
  isMcaPilot?: boolean;
  attribution?: string | null;
  sourceUrl?: string | null;
  oglUrl?: string | null;
  section: {
    title: string;
    sourceSectionReference?: string | null;
    sourcePageStart?: number | null;
    sourcePageEnd?: number | null;
  } | null;
  task: {
    taskCode: string;
    title: string;
    description: string | null;
    evidenceGuidance: string | null;
    seajourneyGuidance?: string | null;
    officialTitle?: string | null;
    officialDescription?: string | null;
    seajourneySummary?: string | null;
    seajourneyCompletionGuidance?: string | null;
    sourceTaskReference?: string | null;
    sourcePageStart?: number | null;
    sourcePageEnd?: number | null;
    sourcePageReference?: string | null;
    officialSignerInstruction?: string | null;
    requiredSignerRole?: string | null;
  };
  progress: {
    id: string;
    status: string;
    candidateNotes: string | null;
  };
  evidence: {
    id: string;
    originalFilename: string;
    mimeType: string;
    fileSize: number;
    createdAt: string;
  }[];
  requests: {
    id: string;
    status: string;
    signerEmail: string;
    signerName: string | null;
    expiresAt: string;
    createdAt: string;
  }[];
  signoffs: {
    id: string;
    decision: string;
    decisionNotes: string | null;
    signerName: string;
    signerVerificationStatus: string;
    signedAt: string;
    recordHash: string;
  }[];
  pendingRequest: {
    id: string;
    expiresAt: string;
    signerEmail: string;
    batchRequestId?: string | null;
    isBatchShadow?: boolean;
  } | null;
  officialBookCandidate?: {
    officialBookStatus: string;
    officialBookSignerName?: string | null;
    notes?: string | null;
  } | null;
  officialBookCaptain?: {
    officialBookStatus: string;
    notes?: string | null;
  } | null;
  officialBookDiscrepancy?: boolean;
};

const REQUESTABLE_STATUSES = new Set([
  'not_started',
  'in_progress',
  'ready_for_assessment',
  'changes_requested',
  'rejected',
]);

export default function TaskProgressPage() {
  const params = useParams<{ enrollmentId: string; taskProgressId: string }>();
  const { session } = useSupabase();
  const { toast } = useToast();
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState('');
  const [showNotes, setShowNotes] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);
  const [showOfficialBook, setShowOfficialBook] = useState(false);
  const [saving, setSaving] = useState(false);
  const [signerName, setSignerName] = useState('');
  const [signerEmail, setSignerEmail] = useState('');
  const [signerUserId, setSignerUserId] = useState<string | null>(null);
  const [optionalMessage, setOptionalMessage] = useState('');
  const [authorised, setAuthorised] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [devReviewUrl, setDevReviewUrl] = useState<string | null>(null);
  const [bookStatus, setBookStatus] = useState('not_recorded');
  const [bookSigner, setBookSigner] = useState('');
  const [bookRank, setBookRank] = useState('');
  const [bookDeclaration, setBookDeclaration] = useState('');
  const [bookNotes, setBookNotes] = useState('');
  const [savingBook, setSavingBook] = useState(false);
  const [eligibleSigners, setEligibleSigners] = useState<
    {
      userId: string | null;
      email: string;
      fullName: string;
      rank: string | null;
      source: string;
      selfDeclared: boolean;
      eligibilityLabel?: string;
      isVesselManager?: boolean;
      vesselRole?: string | null;
      authorityExpiresAt?: string | null;
    }[]
  >([]);

  const load = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/trb/enrollments/${params.enrollmentId}/tasks/${params.taskProgressId}`,
        { headers: bearerHeaders(session.access_token) },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load');
      setDetail(json);
      const existingNotes = json.progress?.candidateNotes || '';
      setNotes(existingNotes);
      setShowNotes(Boolean(existingNotes.trim()));
      setShowEvidence((json.evidence || []).length > 0);
      if (json.officialBookCandidate?.officialBookStatus) {
        setBookStatus(json.officialBookCandidate.officialBookStatus);
        setShowOfficialBook(true);
      }
      if (json.officialBookCandidate?.officialBookSignerName) {
        setBookSigner(json.officialBookCandidate.officialBookSignerName);
      }
      if (json.officialBookCandidate?.notes) {
        setBookNotes(json.officialBookCandidate.notes);
      }
    } catch (e) {
      toast({
        title: 'Could not load task',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [session?.access_token, params.enrollmentId, params.taskProgressId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!session?.access_token || !detail?.progress.id) return;
    void (async () => {
      const res = await fetch(
        `/api/trb/eligible-signers?taskProgressId=${encodeURIComponent(detail.progress.id)}`,
        { headers: bearerHeaders(session.access_token) },
      );
      const json = await res.json();
      if (res.ok) setEligibleSigners(json.signers || []);
    })();
  }, [session?.access_token, detail?.progress.id]);

  const canEditExtras =
    detail &&
    !['approved', 'awaiting_signoff', 'superseded'].includes(detail.progress.status);

  const canRequestSignoff =
    Boolean(detail) &&
    !detail!.pendingRequest &&
    REQUESTABLE_STATUSES.has(detail!.progress.status);

  async function saveNotes() {
    if (!session?.access_token || !detail) return;
    setSaving(true);
    try {
      const res = await fetch('/api/trb/notes', {
        method: 'PATCH',
        headers: {
          ...bearerHeaders(session.access_token),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          taskProgressId: detail.progress.id,
          candidateNotes: notes,
          markInProgress: true,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Save failed');
      toast({ title: 'Notes saved' });
      await load();
    } catch (e) {
      toast({
        title: 'Could not save notes',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }

  async function uploadFile(file: File) {
    if (!session?.access_token || !detail) return;
    const form = new FormData();
    form.set('taskProgressId', detail.progress.id);
    form.set('file', file);
    try {
      const res = await fetch('/api/trb/evidence', {
        method: 'POST',
        headers: bearerHeaders(session.access_token),
        body: form,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Upload failed');
      toast({ title: 'Evidence uploaded' });
      setShowEvidence(true);
      await load();
    } catch (e) {
      toast({
        title: 'Upload failed',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  }

  async function removeEvidence(evidenceId: string) {
    if (!session?.access_token) return;
    try {
      const res = await fetch('/api/trb/evidence', {
        method: 'DELETE',
        headers: {
          ...bearerHeaders(session.access_token),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ evidenceId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Remove failed');
      toast({ title: 'Evidence removed' });
      await load();
    } catch (e) {
      toast({
        title: 'Could not remove evidence',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  }

  async function openEvidence(evidenceId: string) {
    if (!session?.access_token) return;
    const res = await fetch(
      `/api/trb/evidence/download?evidenceId=${encodeURIComponent(evidenceId)}`,
      { headers: bearerHeaders(session.access_token) },
    );
    const json = await res.json();
    if (!res.ok) {
      toast({
        title: 'Download failed',
        description: json.error || 'Forbidden',
        variant: 'destructive',
      });
      return;
    }
    window.open(json.signedUrl, '_blank', 'noopener,noreferrer');
  }

  async function requestSignoff() {
    if (!session?.access_token || !detail) return;
    if (!canRequestSignoff) {
      toast({
        title: 'Cannot request yet',
        description: 'This task is not available for sign-off right now.',
        variant: 'destructive',
      });
      return;
    }
    if (!signerUserId) {
      toast({
        title: 'Select an officer',
        description: 'Choose who should review and sign this task.',
        variant: 'destructive',
      });
      return;
    }
    if (!authorised) {
      toast({
        title: 'Confirmation required',
        description: 'Confirm this person is authorised to assess this task.',
        variant: 'destructive',
      });
      return;
    }
    setRequesting(true);
    setDevReviewUrl(null);
    try {
      // Optional notes are saved first if the panel is open and content changed.
      if (showNotes && notes !== (detail.progress.candidateNotes || '')) {
        const notesRes = await fetch('/api/trb/notes', {
          method: 'PATCH',
          headers: {
            ...bearerHeaders(session.access_token),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            taskProgressId: detail.progress.id,
            candidateNotes: notes,
            markInProgress: true,
          }),
        });
        if (!notesRes.ok) {
          const nj = await notesRes.json().catch(() => ({}));
          throw new Error(nj.error || 'Could not save notes before request');
        }
      }

      const res = await fetch('/api/trb/signoff/request', {
        method: 'POST',
        headers: {
          ...bearerHeaders(session.access_token),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          taskProgressId: detail.progress.id,
          signerUserId,
          signerName: signerName || undefined,
          signerEmail: signerEmail || undefined,
          authorisedConfirmation: true,
          optionalMessage: optionalMessage || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Request failed');
      if (json.reviewUrl) setDevReviewUrl(json.reviewUrl);
      toast({
        title: json.emailSent ? 'Sent for sign-off' : 'Request created (email skipped)',
        description: json.emailSent
          ? 'The officer has been emailed a secure review link.'
          : 'Email was not sent (Resend not configured). Use the review link below in development.',
      });
      await load();
    } catch (e) {
      toast({
        title: 'Could not request sign-off',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setRequesting(false);
    }
  }

  async function cancelRequest() {
    if (!session?.access_token || !detail?.pendingRequest) return;
    try {
      const res = await fetch('/api/trb/signoff/request', {
        method: 'DELETE',
        headers: {
          ...bearerHeaders(session.access_token),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          taskProgressId: detail.progress.id,
          requestId: detail.pendingRequest.id,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Cancel failed');
      toast({ title: 'Request cancelled' });
      await load();
    } catch (e) {
      toast({
        title: 'Could not cancel',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  }

  async function saveOfficialBook() {
    if (!session?.access_token || !detail) return;
    if (bookDeclaration.trim().length < 10) {
      toast({
        title: 'Declaration required',
        description: 'Confirm that this is your candidate-reported official-book status.',
        variant: 'destructive',
      });
      return;
    }
    setSavingBook(true);
    try {
      const res = await fetch('/api/trb/parallel-book', {
        method: 'POST',
        headers: {
          ...bearerHeaders(session.access_token),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          taskProgressId: detail.progress.id,
          officialBookStatus: bookStatus,
          officialBookSignerName: bookSigner || null,
          officialBookSignerRank: bookRank || null,
          candidateDeclaration: bookDeclaration,
          notes: bookNotes || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Save failed');
      toast({
        title: json.discrepancy
          ? 'Saved — discrepancy flagged'
          : 'Official-book status saved',
        description:
          'Candidate-reported only. Digital approval does not mark the official book as signed.',
      });
      await load();
    } catch (e) {
      toast({
        title: 'Could not save',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setSavingBook(false);
    }
  }

  if (loading || !detail) {
    return (
      <div className="flex flex-col gap-6">
        <div className="space-y-2 border-b border-border pb-5">
          <Skeleton className="h-3 w-56 rounded-md" />
          <Skeleton className="h-7 w-80 rounded-md" />
        </div>
        <Skeleton className="h-40 w-full rounded-md" />
        <Skeleton className="h-48 w-full rounded-md" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <TrainingRecordsPageHeader
        title={`${detail.task.taskCode} · ${detail.task.officialTitle || detail.task.title}`}
        breadcrumb={detail.task.taskCode}
        description={`${detail.section?.title || 'Section'} · Training Record`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <TrainingStatusPill status={detail.progress.status} />
            <Button asChild variant="outline" size="sm" className="h-8 rounded-md text-xs">
              <Link href={`/dashboard/training-records/${params.enrollmentId}`}>
                <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                Back to programme
              </Link>
            </Button>
          </div>
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

      <TrainingRecordsSection
        title="Task"
        description={
          detail.task.sourceTaskReference || detail.task.sourcePageReference
            ? `${detail.task.sourceTaskReference || ''} · ${detail.task.sourcePageReference || `pp. ${detail.task.sourcePageStart ?? '—'}–${detail.task.sourcePageEnd ?? '—'}`}`
            : undefined
        }
      >
        <div className="space-y-3 text-sm">
          <p className="font-medium text-foreground">
            {detail.task.officialTitle || detail.task.title}
          </p>
          {(detail.task.officialDescription || detail.task.description) ? (
            <p className="whitespace-pre-wrap text-muted-foreground">
              {detail.task.officialDescription || detail.task.description}
            </p>
          ) : null}
          {detail.task.requiredSignerRole ? (
            <p className="text-[11px] text-muted-foreground">
              Required assessor:{' '}
              <span className="font-medium text-foreground">
                {detail.task.requiredSignerRole.replace(/_/g, ' ')}
              </span>
            </p>
          ) : null}
        </div>
      </TrainingRecordsSection>

      <TrainingRecordsSection
        title="Send for sign-off"
        description="Choose an officer or captain with Training Record authority on your vessel. Notes and evidence are optional for verbal tasks."
      >
        {detail.pendingRequest ? (
          <div className="space-y-3">
            <div className="rounded-md border border-sky-500/25 bg-sky-500/[0.06] px-3 py-2.5">
              <p className="text-xs font-medium text-foreground">Pending request</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Waiting for {detail.pendingRequest.signerEmail}. Expires{' '}
                {new Date(detail.pendingRequest.expiresAt).toLocaleString('en-GB')}.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-8 rounded-md text-xs"
              onClick={() => void cancelRequest()}
            >
              Cancel request
            </Button>
          </div>
        ) : detail.progress.status === 'approved' ? (
          <p className="text-xs text-muted-foreground">This task is already approved.</p>
        ) : !canRequestSignoff ? (
          <p className="text-xs text-muted-foreground">
            This task cannot be sent for sign-off in its current status.
          </p>
        ) : (
          <div className="space-y-3">
            {eligibleSigners.length > 0 ? (
              <div className="space-y-1.5">
                <Label className="text-xs">Who should sign this off?</Label>
                <ul className="divide-y divide-border rounded-md border border-border">
                  {eligibleSigners.map((s) => {
                    const selected = Boolean(s.userId && s.userId === signerUserId);
                    return (
                      <li key={s.userId || s.email}>
                        <button
                          type="button"
                          className={`flex w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left hover:bg-muted/40 ${
                            selected ? 'bg-muted/50' : ''
                          }`}
                          onClick={() => {
                            setSignerUserId(s.userId);
                            setSignerEmail(s.email);
                            setSignerName(s.fullName);
                          }}
                        >
                          <span className="text-sm font-medium text-foreground">
                            {s.fullName}
                            {s.isVesselManager ? ' · Vessel manager' : ''}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {s.eligibilityLabel || s.source.replace(/_/g, ' ')}
                            {s.vesselRole ? ` · ${s.vesselRole}` : s.rank ? ` · ${s.rank}` : ''}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : (
              <p className="text-xs text-amber-800">
                No eligible signers yet. A vessel manager must turn on{' '}
                <span className="font-medium">Training Record sign-off</span> for officers under{' '}
                <span className="font-medium">Dashboard → Vessel roles</span>.
              </p>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="msg" className="text-xs">
                Message to signer (optional)
              </Label>
              <Textarea
                id="msg"
                className="rounded-md text-sm"
                value={optionalMessage}
                onChange={(e) => setOptionalMessage(e.target.value)}
                rows={2}
                placeholder="e.g. Completed verbally during watch handover"
              />
            </div>

            <label className="flex items-start gap-2 text-xs text-muted-foreground">
              <Checkbox
                checked={authorised}
                onCheckedChange={(v) => setAuthorised(v === true)}
                className="mt-0.5"
              />
              <span>
                I believe this person is suitably qualified and authorised to assess this training
                task for my vessel.
              </span>
            </label>

            <Button
              size="sm"
              className="h-8 rounded-md text-xs"
              onClick={() => void requestSignoff()}
              disabled={requesting || !signerUserId || !authorised}
            >
              {requesting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              Send for sign-off
            </Button>

            {devReviewUrl ? (
              <div className="rounded-md border border-border bg-muted/40 px-3 py-2.5">
                <p className="text-[11px] font-medium text-foreground">Development review link</p>
                <a
                  className="mt-1 block break-all text-[11px] text-sky-600 underline"
                  href={devReviewUrl}
                >
                  {devReviewUrl}
                </a>
              </div>
            ) : null}
          </div>
        )}
      </TrainingRecordsSection>

      <div className="space-y-2">
        {!showNotes && canEditExtras ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 rounded-md text-xs"
            onClick={() => setShowNotes(true)}
          >
            Add notes (optional)
          </Button>
        ) : null}

        {showNotes || (!canEditExtras && notes.trim()) ? (
          <TrainingRecordsSection
            title="Notes"
            description="Optional — useful if you want to leave context for the assessor"
            action={
              canEditExtras ? (
                <div className="flex items-center gap-1.5">
                  {!notes.trim() ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 rounded-md text-xs"
                      onClick={() => setShowNotes(false)}
                    >
                      Hide
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    className="h-7 rounded-md text-xs"
                    onClick={() => void saveNotes()}
                    disabled={saving}
                  >
                    {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                    Save notes
                  </Button>
                </div>
              ) : null
            }
          >
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={!canEditExtras}
              rows={4}
              maxLength={8000}
              className="rounded-md text-sm"
              placeholder="Optional notes about how this task was completed"
            />
          </TrainingRecordsSection>
        ) : null}

        {!showEvidence && canEditExtras ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 rounded-md text-xs"
            onClick={() => setShowEvidence(true)}
          >
            Add evidence (optional)
          </Button>
        ) : null}

        {showEvidence || detail.evidence.length > 0 ? (
          <TrainingRecordsSection
            title="Evidence"
            description="Optional — PDF, JPEG or PNG · max 8MB"
            flush
            action={
              canEditExtras ? (
                <div className="flex items-center gap-1.5">
                  {detail.evidence.length === 0 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 rounded-md text-xs"
                      onClick={() => setShowEvidence(false)}
                    >
                      Hide
                    </Button>
                  ) : null}
                  <Label className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs hover:bg-muted/40">
                    <Upload className="h-3.5 w-3.5" />
                    Upload
                    <Input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void uploadFile(f);
                        e.target.value = '';
                      }}
                    />
                  </Label>
                </div>
              ) : null
            }
          >
            {detail.evidence.length === 0 ? (
              <p className="px-4 py-6 text-center text-[11px] text-muted-foreground sm:px-5">
                No evidence uploaded.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {detail.evidence.map((ev) => (
                  <li
                    key={ev.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 sm:px-5"
                  >
                    <button
                      type="button"
                      className="text-left text-sm font-medium text-foreground underline-offset-2 hover:underline"
                      onClick={() => void openEvidence(ev.id)}
                    >
                      {ev.originalFilename}
                    </button>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                        {(ev.fileSize / 1024).toFixed(0)} KB
                      </span>
                      {canEditExtras ? (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => void removeEvidence(ev.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </TrainingRecordsSection>
        ) : null}
      </div>

      {detail.signoffs.length > 0 ? (
        <TrainingRecordsSection title="Sign-off history" flush>
          <ul className="divide-y divide-border">
            {detail.signoffs.map((s) => (
              <li key={s.id} className="space-y-1.5 px-4 py-3 sm:px-5">
                <div className="flex flex-wrap items-center gap-2">
                  <TrainingStatusPill status={s.decision} />
                  <span className="text-sm font-medium">{s.signerName}</span>
                </div>
                {s.decisionNotes ? (
                  <p className="text-xs text-muted-foreground">{s.decisionNotes}</p>
                ) : null}
                <p className="font-mono text-[10px] text-muted-foreground">
                  {new Date(s.signedAt).toLocaleString('en-GB')}
                </p>
              </li>
            ))}
          </ul>
        </TrainingRecordsSection>
      ) : null}

      {detail.isMcaPilot ? (
        <Collapsible open={showOfficialBook} onOpenChange={setShowOfficialBook}>
          <div className="rounded-md border border-border">
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-muted/30"
              >
                <div>
                  <p className="text-xs font-medium text-foreground">
                    Official paper TRB status (optional)
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Candidate-reported only — does not replace the paper book
                  </p>
                </div>
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform [[data-state=open]_&]:rotate-180" />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="space-y-3 border-t border-border px-4 py-3">
                {detail.officialBookDiscrepancy ? (
                  <div className="rounded-md border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-900">
                    Discrepancy: your status differs from the captain&apos;s reported official-book
                    status ({detail.officialBookCaptain?.officialBookStatus}).
                  </div>
                ) : null}
                <div className="space-y-1.5">
                  <Label className="text-xs">Official book status</Label>
                  <Select value={bookStatus} onValueChange={setBookStatus}>
                    <SelectTrigger className="h-8 rounded-md text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="not_recorded">Not recorded</SelectItem>
                      <SelectItem value="awaiting_signature">Awaiting signature</SelectItem>
                      <SelectItem value="signed">Signed in official TRB</SelectItem>
                      <SelectItem value="discrepancy_reported">Discrepancy reported</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Official signer name (optional)</Label>
                    <Input
                      className="h-8 text-sm"
                      value={bookSigner}
                      onChange={(e) => setBookSigner(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Official signer rank (optional)</Label>
                    <Input
                      className="h-8 text-sm"
                      value={bookRank}
                      onChange={(e) => setBookRank(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Your declaration</Label>
                  <Textarea
                    className="text-sm"
                    rows={2}
                    value={bookDeclaration}
                    onChange={(e) => setBookDeclaration(e.target.value)}
                    placeholder="I confirm this is my candidate-reported status…"
                  />
                </div>
                <Button
                  size="sm"
                  className="h-8 text-xs"
                  disabled={savingBook}
                  onClick={() => void saveOfficialBook()}
                >
                  {savingBook ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                  Save official-book status
                </Button>
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>
      ) : null}
    </div>
  );
}
