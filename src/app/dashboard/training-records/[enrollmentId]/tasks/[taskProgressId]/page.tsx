'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Loader2, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
    source_section_reference?: string | null;
    source_page_start?: number | null;
    source_page_end?: number | null;
  } | null;
  task: {
    task_code: string;
    title: string;
    description: string | null;
    evidence_guidance: string | null;
    seajourney_guidance?: string | null;
    official_title?: string | null;
    official_description?: string | null;
    seajourney_summary?: string | null;
    seajourney_completion_guidance?: string | null;
    source_task_reference?: string | null;
    source_page_start?: number | null;
    source_page_end?: number | null;
    source_page_reference?: string | null;
    official_signer_instruction?: string | null;
    required_signer_role?: string | null;
  };
  progress: {
    id: string;
    status: string;
    candidate_notes: string | null;
  };
  evidence: {
    id: string;
    original_filename: string;
    mime_type: string;
    file_size: number;
    created_at: string;
  }[];
  requests: {
    id: string;
    status: string;
    signer_email: string;
    signer_name: string | null;
    expires_at: string;
    created_at: string;
  }[];
  signoffs: {
    id: string;
    decision: string;
    decision_notes: string | null;
    signer_name: string;
    signer_verification_status: string;
    signed_at: string;
    record_hash: string;
  }[];
  pendingRequest: { id: string; expires_at: string; signer_email: string } | null;
  officialBookCandidate?: {
    official_book_status: string;
    official_book_signer_name?: string | null;
    notes?: string | null;
  } | null;
  officialBookCaptain?: {
    official_book_status: string;
    notes?: string | null;
  } | null;
  officialBookDiscrepancy?: boolean;
};

export default function TaskProgressPage() {
  const params = useParams<{ enrollmentId: string; taskProgressId: string }>();
  const { session } = useSupabase();
  const { toast } = useToast();
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [signerName, setSignerName] = useState('');
  const [signerEmail, setSignerEmail] = useState('');
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
  const [feedbackEase, setFeedbackEase] = useState('3');
  const [feedbackClarity, setFeedbackClarity] = useState('3');
  const [feedbackConfidence, setFeedbackConfidence] = useState('3');
  const [feedbackWorked, setFeedbackWorked] = useState('');
  const [feedbackUnclear, setFeedbackUnclear] = useState('');
  const [feedbackChange, setFeedbackChange] = useState('');
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [eligibleSigners, setEligibleSigners] = useState<
    {
      email: string;
      fullName: string;
      rank: string | null;
      source: string;
      selfDeclared: boolean;
    }[]
  >([]);
  const [allowExternal, setAllowExternal] = useState(false);
  const [markingReady, setMarkingReady] = useState(false);

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
      setNotes(json.progress?.candidate_notes || '');
      if (json.officialBookCandidate?.official_book_status) {
        setBookStatus(json.officialBookCandidate.official_book_status);
      }
      if (json.officialBookCandidate?.official_book_signer_name) {
        setBookSigner(json.officialBookCandidate.official_book_signer_name);
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

  const editable =
    detail &&
    !['approved', 'awaiting_signoff', 'ready_for_assessment', 'superseded'].includes(
      detail.progress.status,
    );
  const canMarkReady = detail?.progress.status === 'in_progress';
  const canRequestSignoff = detail?.progress.status === 'ready_for_assessment';

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
      if (!res.ok) throw new Error(json.error || 'Delete failed');
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

  async function markReady() {
    if (!session?.access_token || !detail) return;
    setMarkingReady(true);
    try {
      const res = await fetch('/api/trb/tasks/ready', {
        method: 'POST',
        headers: {
          ...bearerHeaders(session.access_token),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ taskProgressId: detail.progress.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed');
      toast({ title: 'Ready for assessment' });
      await load();
    } catch (e) {
      toast({
        title: 'Could not mark ready',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setMarkingReady(false);
    }
  }

  async function requestSignoff() {
    if (!session?.access_token || !detail) return;
    if (!canRequestSignoff) {
      toast({
        title: 'Not ready',
        description: 'Mark the task ready for assessment before requesting sign-off.',
        variant: 'destructive',
      });
      return;
    }
    if (!authorised) {
      toast({
        title: 'Confirmation required',
        description: 'Confirm the captain is authorised to review this task.',
        variant: 'destructive',
      });
      return;
    }
    setRequesting(true);
    setDevReviewUrl(null);
    try {
      const res = await fetch('/api/trb/signoff/request', {
        method: 'POST',
        headers: {
          ...bearerHeaders(session.access_token),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          taskProgressId: detail.progress.id,
          signerName,
          signerEmail,
          authorisedConfirmation: true,
          optionalMessage: optionalMessage || undefined,
          allowExternalInvite: allowExternal || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Request failed');
      if (json.reviewUrl) setDevReviewUrl(json.reviewUrl);
      toast({
        title: json.emailSent
          ? 'Sign-off requested'
          : 'Request created (email skipped)',
        description: json.emailSent
          ? 'The captain has been emailed a secure review link.'
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

  async function submitFeedback() {
    if (!session?.access_token || !detail) return;
    setSubmittingFeedback(true);
    try {
      const res = await fetch('/api/trb/feedback', {
        method: 'POST',
        headers: {
          ...bearerHeaders(session.access_token),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          enrollmentId: params.enrollmentId,
          taskProgressId: detail.progress.id,
          easeOfUseRating: Number(feedbackEase),
          clarityRating: Number(feedbackClarity),
          confidenceRating: Number(feedbackConfidence),
          whatWorked: feedbackWorked || null,
          whatWasUnclear: feedbackUnclear || null,
          whatWouldYouChange: feedbackChange || null,
          wouldUseAgain: true,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Feedback failed');
      toast({ title: 'Feedback submitted' });
      setFeedbackWorked('');
      setFeedbackUnclear('');
      setFeedbackChange('');
    } catch (e) {
      toast({
        title: 'Could not submit feedback',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setSubmittingFeedback(false);
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
        title={`${detail.task.task_code} · ${detail.task.official_title || detail.task.title}`}
        breadcrumb={detail.task.task_code}
        description={`${detail.section?.title || 'Section'} · Digital TRB Companion`}
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

      <TrainingRecordsSection
        title="Official task wording"
        description={
          detail.task.source_task_reference || detail.task.source_page_reference
            ? `${detail.task.source_task_reference || ''} · ${detail.task.source_page_reference || `pp. ${detail.task.source_page_start ?? '—'}–${detail.task.source_page_end ?? '—'}`}`
            : 'Source text is not editable by candidates'
        }
      >
        <div className="space-y-3 text-sm">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Official source (read-only)
          </p>
          <p className="font-medium text-foreground">
            {detail.task.official_title || detail.task.title}
          </p>
          <p className="whitespace-pre-wrap text-muted-foreground">
            {detail.task.official_description || detail.task.description}
          </p>
          {detail.task.official_signer_instruction ? (
            <p className="text-xs text-muted-foreground">
              {detail.task.official_signer_instruction}
            </p>
          ) : null}
        </div>
      </TrainingRecordsSection>

      <TrainingRecordsSection
        title="SeaJourney guidance"
        description="Plain-language help — not official MCA/PYA wording"
      >
        <div className="space-y-2 text-sm text-muted-foreground">
          <p className="whitespace-pre-wrap">
            {detail.task.seajourney_summary ||
              detail.task.seajourney_guidance ||
              'No SeaJourney summary for this task.'}
          </p>
          {detail.task.seajourney_completion_guidance ||
          detail.task.evidence_guidance ? (
            <div className="rounded-md border border-border bg-muted/40 px-3 py-2">
              <p className="text-[11px] font-medium text-foreground">
                Completion / evidence guidance
              </p>
              <p className="mt-0.5 whitespace-pre-wrap text-xs">
                {detail.task.seajourney_completion_guidance ||
                  detail.task.evidence_guidance}
              </p>
            </div>
          ) : null}
          {detail.task.required_signer_role ? (
            <p className="text-[11px]">
              Required signer role:{' '}
              <span className="font-medium text-foreground">
                {detail.task.required_signer_role.replace(/_/g, ' ')}
              </span>
            </p>
          ) : null}
        </div>
      </TrainingRecordsSection>

      <TrainingRecordsSection
        title="Candidate notes"
        description="Describe how you completed this training task"
        action={
          editable ? (
            <Button
              size="sm"
              className="h-7 rounded-md text-xs"
              onClick={() => void saveNotes()}
              disabled={saving}
            >
              {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              Save notes
            </Button>
          ) : null
        }
      >
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={!editable}
          rows={6}
          maxLength={8000}
          className="rounded-md text-sm"
        />
      </TrainingRecordsSection>

      <TrainingRecordsSection
        title="Supporting evidence"
        description="PDF, JPEG or PNG · max 8MB · private storage"
        flush
        action={
          editable ? (
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
          ) : null
        }
      >
        {detail.evidence.length === 0 ? (
          <p className="px-4 py-6 text-center text-[11px] text-muted-foreground sm:px-5">
            No evidence uploaded yet.
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
                  {ev.original_filename}
                </button>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                    {(ev.file_size / 1024).toFixed(0)} KB
                  </span>
                  {editable ? (
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

      <TrainingRecordsSection
        title="Assessment readiness"
        description="Marking ready does not approve the task. Sign-off can only be requested afterwards."
      >
        {canMarkReady ? (
          <Button
            size="sm"
            className="h-8 rounded-md text-xs"
            disabled={markingReady || !notes.trim()}
            onClick={() => void markReady()}
          >
            {markingReady ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : null}
            Mark ready for assessment
          </Button>
        ) : detail.progress.status === 'ready_for_assessment' ? (
          <p className="text-xs text-muted-foreground">
            This task is ready for assessment. Select an eligible signer below.
          </p>
        ) : detail.progress.status === 'awaiting_signoff' ? (
          <p className="text-xs text-muted-foreground">
            Awaiting captain/officer decision.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Save notes (and optional evidence) while the task is in progress, then mark
            ready.
          </p>
        )}
      </TrainingRecordsSection>

      <TrainingRecordsSection
        title="Request captain sign-off"
        description="Eligible signers are taken from your active vessel roster. External invites are self-declared until verified."
      >
        {detail.pendingRequest ? (
          <div className="space-y-3">
            <div className="rounded-md border border-sky-500/25 bg-sky-500/[0.06] px-3 py-2.5">
              <p className="text-xs font-medium text-foreground">Pending request</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Waiting for {detail.pendingRequest.signer_email}. Expires{' '}
                {new Date(detail.pendingRequest.expires_at).toLocaleString('en-GB')}.
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
            Sign-off is available only after the task is marked ready for assessment.
          </p>
        ) : (
          <div className="space-y-3">
            {eligibleSigners.length > 0 ? (
              <div className="space-y-1.5">
                <Label className="text-xs">Eligible vessel signers</Label>
                <ul className="divide-y divide-border rounded-md border border-border">
                  {eligibleSigners.map((s) => (
                    <li key={s.email}>
                      <button
                        type="button"
                        className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-muted/40"
                        onClick={() => {
                          setSignerEmail(s.email);
                          setSignerName(s.fullName);
                          setAllowExternal(false);
                        }}
                      >
                        <span className="text-sm font-medium text-foreground">
                          {s.fullName}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {s.email}
                          {s.rank ? ` · ${s.rank}` : ''} · {s.source.replace(/_/g, ' ')}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-xs text-amber-800">
                No eligible roster signers found. You may invite an external captain; their
                credentials will be self-declared.
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="signerName" className="text-xs">
                  Signer name
                </Label>
                <Input
                  id="signerName"
                  className="h-8 rounded-md text-sm"
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="signerEmail" className="text-xs">
                  Signer email
                </Label>
                <Input
                  id="signerEmail"
                  type="email"
                  className="h-8 rounded-md text-sm"
                  value={signerEmail}
                  onChange={(e) => setSignerEmail(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="msg" className="text-xs">
                Optional message
              </Label>
              <Textarea
                id="msg"
                className="rounded-md text-sm"
                value={optionalMessage}
                onChange={(e) => setOptionalMessage(e.target.value)}
                rows={3}
              />
            </div>
            <label className="flex items-start gap-2 text-xs text-muted-foreground">
              <Checkbox
                checked={allowExternal}
                onCheckedChange={(v) => setAllowExternal(v === true)}
                className="mt-0.5"
              />
              <span>
                Invite an external captain not on the vessel roster (credentials remain
                self-declared until SeaJourney verifies them).
              </span>
            </label>
            <label className="flex items-start gap-2 text-xs text-muted-foreground">
              <Checkbox
                checked={authorised}
                onCheckedChange={(v) => setAuthorised(v === true)}
                className="mt-0.5"
              />
              <span>
                I believe this person is authorised to review this training task for my
                vessel.
              </span>
            </label>
            <Button
              size="sm"
              className="h-8 rounded-md text-xs"
              onClick={() => void requestSignoff()}
              disabled={requesting || !signerName || !signerEmail}
            >
              {requesting ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : null}
              Request sign-off
            </Button>
            {devReviewUrl ? (
              <div className="rounded-md border border-border bg-muted/40 px-3 py-2.5">
                <p className="text-[11px] font-medium text-foreground">
                  Development review link
                </p>
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

      <TrainingRecordsSection title="Sign-off history" flush>
        {detail.signoffs.length === 0 ? (
          <p className="px-4 py-6 text-center text-[11px] text-muted-foreground sm:px-5">
            No captain decisions yet.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {detail.signoffs.map((s) => (
              <li key={s.id} className="space-y-1.5 px-4 py-3 sm:px-5">
                <div className="flex flex-wrap items-center gap-2">
                  <TrainingStatusPill status={s.decision} />
                  <span className="text-sm font-medium">{s.signer_name}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {s.signer_verification_status.replace(/_/g, ' ')}
                  </span>
                </div>
                {s.decision_notes ? (
                  <p className="text-xs text-muted-foreground">{s.decision_notes}</p>
                ) : null}
                <p className="font-mono text-[10px] text-muted-foreground">
                  {new Date(s.signed_at).toLocaleString('en-GB')} ·{' '}
                  {s.record_hash.slice(0, 12)}…
                </p>
              </li>
            ))}
          </ul>
        )}
      </TrainingRecordsSection>

      {detail.isMcaPilot ? (
        <TrainingRecordsSection
          title="Official TRB confirmation"
          description="Candidate-reported trial comparison — not independent verification. Digital approval does not set this to signed."
        >
          {detail.officialBookDiscrepancy ? (
            <div className="mb-3 rounded-md border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-900">
              Discrepancy: your status differs from the captain&apos;s reported official-book
              status ({detail.officialBookCaptain?.official_book_status}).
            </div>
          ) : null}
          <div className="space-y-3">
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
                rows={3}
                value={bookDeclaration}
                onChange={(e) => setBookDeclaration(e.target.value)}
                placeholder="I confirm this is my candidate-reported status for the matching official TRB task…"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Notes (optional)</Label>
              <Textarea
                className="text-sm"
                rows={2}
                value={bookNotes}
                onChange={(e) => setBookNotes(e.target.value)}
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
        </TrainingRecordsSection>
      ) : null}

      <TrainingRecordsSection title="Pilot feedback">
        <div className="grid gap-3 sm:grid-cols-3">
          {(
            [
              ['Ease of use', feedbackEase, setFeedbackEase],
              ['Clarity', feedbackClarity, setFeedbackClarity],
              ['Confidence', feedbackConfidence, setFeedbackConfidence],
            ] as const
          ).map(([label, value, setter]) => (
            <div key={label} className="space-y-1.5">
              <Label className="text-xs">{label} (1–5)</Label>
              <Select value={value} onValueChange={setter}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
        <div className="mt-3 space-y-3">
          <Textarea
            className="text-sm"
            rows={2}
            placeholder="What worked?"
            value={feedbackWorked}
            onChange={(e) => setFeedbackWorked(e.target.value)}
          />
          <Textarea
            className="text-sm"
            rows={2}
            placeholder="What was unclear?"
            value={feedbackUnclear}
            onChange={(e) => setFeedbackUnclear(e.target.value)}
          />
          <Textarea
            className="text-sm"
            rows={2}
            placeholder="What would you change?"
            value={feedbackChange}
            onChange={(e) => setFeedbackChange(e.target.value)}
          />
          <Button
            size="sm"
            className="h-8 text-xs"
            disabled={submittingFeedback}
            onClick={() => void submitFeedback()}
          >
            {submittingFeedback ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : null}
            Submit feedback
          </Button>
        </div>
      </TrainingRecordsSection>
    </div>
  );
}
