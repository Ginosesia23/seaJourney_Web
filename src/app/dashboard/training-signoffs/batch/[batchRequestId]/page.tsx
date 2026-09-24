'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  TrainingRecordsPageHeader,
  TrainingRecordsSection,
} from '@/components/dashboard/training-records-page-ui';
import { bearerHeaders } from '@/lib/applications/client';
import { useSupabase } from '@/supabase';
import { useToast } from '@/hooks/use-toast';

type BatchItem = {
  id: string;
  status: string;
  taskProgressId: string;
  progress: { candidateNotes: string | null } | null;
  section: { title: string } | null;
  task: {
    taskCode: string;
    title: string;
    description?: string | null;
    officialTitle?: string | null;
    seajourneySummary?: string | null;
  } | null;
  evidence: {
    id: string;
    originalFilename: string;
    mimeType: string;
    fileSize: number;
  }[];
};

type Detail = {
  ok: true;
  batch: {
    id: string;
    status: string;
    expiresAt: string;
    signerName: string | null;
    signerEmail: string;
    vesselName: string | null;
    optionalMessage: string | null;
  };
  candidate: { name: string };
  programme: { name: string; disclaimer: string };
  items: BatchItem[];
};

export default function AuthenticatedBatchReviewPage() {
  const params = useParams<{ batchRequestId: string }>();
  const { session } = useSupabase();
  const { toast } = useToast();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [itemDecisions, setItemDecisions] = useState<
    Record<string, { decision: string; decisionNotes: string }>
  >({});
  const [signerName, setSignerName] = useState('');
  const [signerRank, setSignerRank] = useState('');
  const [coc, setCoc] = useState('');
  const [authority, setAuthority] = useState('');
  const [declaration, setDeclaration] = useState(
    'I personally assessed each selected training task for this Training Record request.',
  );
  const [overallFeedback, setOverallFeedback] = useState('');
  const [authorised, setAuthorised] = useState(false);
  const [assessed, setAssessed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session?.access_token || !params.batchRequestId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/trb/signoff/batch/${params.batchRequestId}`,
        { headers: bearerHeaders(session.access_token) },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load');
      setDetail(json);
      if (json.batch?.signerName) setSignerName(json.batch.signerName);
      const initial: Record<string, { decision: string; decisionNotes: string }> =
        {};
      for (const item of json.items || []) {
        if (item.status === 'pending') {
          initial[item.id] = { decision: '', decisionNotes: '' };
        }
      }
      setItemDecisions(initial);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [session?.access_token, params.batchRequestId]);

  useEffect(() => {
    void load();
  }, [load]);

  const pendingItems = useMemo(
    () => (detail?.items || []).filter((i) => i.status === 'pending'),
    [detail],
  );

  const allDecided = pendingItems.every(
    (i) => itemDecisions[i.id]?.decision && itemDecisions[i.id].decision !== '',
  );

  async function openEvidence(evidenceId: string) {
    if (!session?.access_token) return;
    const res = await fetch(
      `/api/trb/evidence/download?evidenceId=${encodeURIComponent(evidenceId)}&batchRequestId=${encodeURIComponent(params.batchRequestId)}`,
      { headers: bearerHeaders(session.access_token) },
    );
    const json = await res.json();
    if (!res.ok) {
      toast({
        title: 'Could not open evidence',
        description: json.error || 'Forbidden',
        variant: 'destructive',
      });
      return;
    }
    window.open(json.signedUrl, '_blank', 'noopener,noreferrer');
  }

  function setAll(decision: 'approved' | 'changes_requested') {
    setItemDecisions((prev) => {
      const next = { ...prev };
      for (const item of pendingItems) {
        next[item.id] = {
          decision,
          decisionNotes: prev[item.id]?.decisionNotes || '',
        };
      }
      return next;
    });
  }

  async function submit() {
    if (!session?.access_token || !authorised || !assessed || !allDecided) return;
    setSubmitting(true);
    try {
      const decisions = pendingItems.map((item) => ({
        itemId: item.id,
        decision: itemDecisions[item.id].decision as
          | 'approved'
          | 'changes_requested'
          | 'rejected',
        decisionNotes: itemDecisions[item.id].decisionNotes || undefined,
      }));
      const res = await fetch(
        `/api/trb/signoff/batch/${params.batchRequestId}`,
        {
          method: 'POST',
          headers: {
            ...bearerHeaders(session.access_token),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            decisions,
            signerName,
            signerRank,
            signerCocNumber: coc,
            signerIssuingAuthority: authority,
            authorisedConfirmation: true,
            personallyAssessedConfirmation: true,
            signerDeclaration: declaration,
            overallFeedback: overallFeedback || undefined,
          }),
        },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || json.code || 'Submit failed');
      const r = json.result || {};
      setDone(
        `${r.approved ?? 0} approved · ${r.changesRequested ?? r.changes_requested ?? 0} changes · ${r.rejected ?? 0} rejected`,
      );
      toast({ title: 'Decision recorded', description: 'Crew will be notified.' });
    } catch (e) {
      toast({
        title: 'Could not submit',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading review…
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="space-y-4">
        <TrainingRecordsPageHeader
          title="Request not found"
          description={error || 'This request is not available for your account.'}
          actions={
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/inbox">
                <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                Back to inbox
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  if (done || detail.batch.status !== 'pending') {
    return (
      <div className="space-y-4">
        <TrainingRecordsPageHeader
          title="Decision recorded"
          description={done || `Status: ${detail.batch.status}`}
          actions={
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/inbox">Back to inbox</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 pb-16">
      <TrainingRecordsPageHeader
        title="Review grouped Training Record request"
        description={`${detail.candidate.name} · ${detail.programme.name}${detail.batch.vesselName ? ` · ${detail.batch.vesselName}` : ''}`}
        actions={
          <Button asChild variant="outline" size="sm" className="h-8 text-xs">
            <Link href="/dashboard/inbox">
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
              Inbox
            </Link>
          </Button>
        }
      />

      <Alert>
        <AlertTitle>Training Record sign-off</AlertTitle>
        <AlertDescription className="text-xs">
          {detail.programme.disclaimer}
        </AlertDescription>
      </Alert>

      {detail.batch.optionalMessage ? (
        <p className="rounded-md border px-3 py-2 text-sm">
          Message from crew: {detail.batch.optionalMessage}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => setAll('approved')}>
          Approve all
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setAll('changes_requested')}
        >
          Request changes all
        </Button>
      </div>

      {pendingItems.map((item) => (
        <TrainingRecordsSection
          key={item.id}
          title={`${item.task?.taskCode || ''} · ${item.task?.officialTitle || item.task?.title || 'Task'}`}
          description={item.section?.title || undefined}
        >
          <div className="space-y-3 text-sm">
            {item.progress?.candidateNotes ? (
              <p className="whitespace-pre-wrap text-muted-foreground">
                {item.progress.candidateNotes}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">No candidate notes.</p>
            )}
            {item.evidence?.length ? (
              <ul className="space-y-1">
                {item.evidence.map((ev) => (
                  <li key={ev.id}>
                    <button
                      type="button"
                      className="text-xs text-sky-700 underline"
                      onClick={() => void openEvidence(ev.id)}
                    >
                      {ev.originalFilename}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Decision</Label>
                <Select
                  value={itemDecisions[item.id]?.decision || ''}
                  onValueChange={(v) =>
                    setItemDecisions((prev) => ({
                      ...prev,
                      [item.id]: {
                        decision: v,
                        decisionNotes: prev[item.id]?.decisionNotes || '',
                      },
                    }))
                  }
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="changes_requested">Changes requested</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Notes (required for changes/reject)</Label>
                <Textarea
                  className="min-h-[64px] text-sm"
                  value={itemDecisions[item.id]?.decisionNotes || ''}
                  onChange={(e) =>
                    setItemDecisions((prev) => ({
                      ...prev,
                      [item.id]: {
                        decision: prev[item.id]?.decision || '',
                        decisionNotes: e.target.value,
                      },
                    }))
                  }
                />
              </div>
            </div>
          </div>
        </TrainingRecordsSection>
      ))}

      <TrainingRecordsSection title="Your details">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">Full name</Label>
            <Input className="h-8" value={signerName} onChange={(e) => setSignerName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Rank</Label>
            <Input className="h-8" value={signerRank} onChange={(e) => setSignerRank(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">CoC / certificate number</Label>
            <Input className="h-8" value={coc} onChange={(e) => setCoc(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Issuing authority</Label>
            <Input className="h-8" value={authority} onChange={(e) => setAuthority(e.target.value)} />
          </div>
        </div>
        <div className="mt-3 space-y-1">
          <Label className="text-xs">Declaration</Label>
          <Textarea value={declaration} onChange={(e) => setDeclaration(e.target.value)} rows={3} />
        </div>
        <div className="mt-3 space-y-1">
          <Label className="text-xs">Overall feedback (optional)</Label>
          <Textarea
            value={overallFeedback}
            onChange={(e) => setOverallFeedback(e.target.value)}
            rows={2}
          />
        </div>
        <label className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
          <Checkbox
            checked={authorised}
            onCheckedChange={(v) => setAuthorised(v === true)}
            className="mt-0.5"
          />
          <span>I am authorised to assess these Training Record tasks for this vessel.</span>
        </label>
        <label className="mt-2 flex items-start gap-2 text-xs text-muted-foreground">
          <Checkbox
            checked={assessed}
            onCheckedChange={(v) => setAssessed(v === true)}
            className="mt-0.5"
          />
          <span>I personally assessed each selected task.</span>
        </label>
        <Button
          className="mt-4"
          disabled={
            submitting ||
            !authorised ||
            !assessed ||
            !allDecided ||
            !signerName.trim() ||
            !signerRank.trim() ||
            !coc.trim() ||
            !authority.trim() ||
            declaration.trim().length < 10
          }
          onClick={() => void submit()}
        >
          {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Submit decisions
        </Button>
      </TrainingRecordsSection>
    </div>
  );
}
