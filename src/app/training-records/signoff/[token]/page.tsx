'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
  MCA_PILOT_ATTRIBUTION,
  MCA_PILOT_DISCLAIMER,
  MCA_PILOT_OGL_URL,
  MCA_PILOT_SOURCE_URL,
} from '@/lib/trb/pilot';
import { TRB_DISCLAIMER } from '@/lib/trb/constants';

type SingleResolve = {
  ok: true;
  kind?: 'single';
  isMcaPilot?: boolean;
  candidate: { name: string; vesselName: string | null };
  programme: {
    name: string;
    version: string | null;
    disclaimer: string;
    attribution?: string | null;
    sourceUrl?: string | null;
    oglUrl?: string | null;
  };
  section: { title: string; sourceSectionReference?: string | null } | null;
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
    requiredSignerRole?: string | null;
  } | null;
  progress: {
    id: string;
    candidateNotes: string | null;
    claimedCompletedAt: string | null;
  };
  evidence: {
    id: string;
    originalFilename: string;
    mimeType: string;
    fileSize: number;
  }[];
  priorChangesRequested: {
    id: string;
    decisionNotes: string | null;
    signedAt: string;
    signerName: string;
  }[];
  request: {
    expiresAt: string;
    signerEmail: string;
    signerName: string | null;
    requiredSignerRole?: string | null;
  };
};

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
    officialDescription?: string | null;
    seajourneySummary?: string | null;
    seajourneyGuidance?: string | null;
    evidenceGuidance?: string | null;
  } | null;
  evidence: {
    id: string;
    originalFilename: string;
    mimeType: string;
    fileSize: number;
  }[];
};

type BatchResolve = {
  ok: true;
  kind: 'batch';
  isMcaPilot?: boolean;
  candidate: { name: string; userId?: string };
  programme: {
    name: string;
    version: string | null;
    disclaimer: string;
    attribution?: string | null;
    sourceUrl?: string | null;
    oglUrl?: string | null;
  };
  batch: {
    id: string;
    status: string;
    expiresAt: string;
    optionalMessage: string | null;
    signerEmail: string;
    signerName: string | null;
    vesselName: string | null;
    requiredSignerRole?: string | null;
  };
  counts: { total: number };
  items: BatchItem[];
};

type ItemDecision = {
  decision: 'approved' | 'changes_requested' | 'rejected' | '';
  decisionNotes: string;
};

export default function TrbSignoffClientPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [loading, setLoading] = useState(true);
  const [single, setSingle] = useState<SingleResolve | null>(null);
  const [batch, setBatch] = useState<BatchResolve | null>(null);
  const [errorReason, setErrorReason] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{
    summary: string;
    recordHash?: string;
  } | null>(null);

  const [signerName, setSignerName] = useState('');
  const [signerRank, setSignerRank] = useState('');
  const [coc, setCoc] = useState('');
  const [authority, setAuthority] = useState('');
  const [declaration, setDeclaration] = useState(
    'I confirm that I am authorised and have personally assessed the candidate against these demonstration training tasks.',
  );
  const [notes, setNotes] = useState('');
  const [overallFeedback, setOverallFeedback] = useState('');
  const [authorised, setAuthorised] = useState(false);
  const [assessed, setAssessed] = useState(false);
  const [officialBookStatus, setOfficialBookStatus] = useState('');
  const [officialBookNotes, setOfficialBookNotes] = useState('');
  const [itemDecisions, setItemDecisions] = useState<Record<string, ItemDecision>>(
    {},
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [fbEase, setFbEase] = useState('3');
  const [fbClarity, setFbClarity] = useState('3');
  const [fbConfidence, setFbConfidence] = useState('3');
  const [fbWorked, setFbWorked] = useState('');
  const [fbSubmitted, setFbSubmitted] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/trb/signoff/${encodeURIComponent(token)}`);
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setErrorReason(json.reason || json.error || 'unavailable');
        setSingle(null);
        setBatch(null);
        return;
      }
      if (json.kind === 'batch') {
        setBatch(json as BatchResolve);
        setSingle(null);
        if (json.batch?.signerName) setSignerName(json.batch.signerName);
        const init: Record<string, ItemDecision> = {};
        for (const item of json.items || []) {
          init[item.id] = { decision: '', decisionNotes: '' };
        }
        setItemDecisions(init);
      } else {
        setSingle(json as SingleResolve);
        setBatch(null);
        if (json.request?.signerName) setSignerName(json.request.signerName);
      }
    } catch {
      setErrorReason('unavailable');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const allBatchDecided = useMemo(() => {
    if (!batch) return false;
    return batch.items.every(
      (i) => itemDecisions[i.id]?.decision && itemDecisions[i.id].decision !== '',
    );
  }, [batch, itemDecisions]);

  async function openEvidence(evidenceId: string) {
    const res = await fetch(
      `/api/trb/evidence/download?evidenceId=${encodeURIComponent(evidenceId)}&token=${encodeURIComponent(token)}`,
    );
    const json = await res.json();
    if (!res.ok) return;
    window.open(json.signedUrl, '_blank', 'noopener,noreferrer');
  }

  function setAllDecisions(decision: 'approved' | 'changes_requested') {
    if (!batch) return;
    setItemDecisions((prev) => {
      const next = { ...prev };
      for (const item of batch.items) {
        next[item.id] = {
          decision,
          decisionNotes:
            decision === 'approved' ? prev[item.id]?.decisionNotes || '' : prev[item.id]?.decisionNotes || '',
        };
      }
      return next;
    });
  }

  async function submitSingle(decision: 'approved' | 'changes_requested' | 'rejected') {
    if (!authorised || !assessed) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/trb/signoff/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision,
          signerName,
          signerRank,
          signerCocNumber: coc,
          signerIssuingAuthority: authority,
          authorisedConfirmation: true,
          personallyAssessedConfirmation: true,
          signerDeclaration: declaration,
          decisionNotes: notes || undefined,
          officialBookStatus: officialBookStatus || undefined,
          officialBookNotes: officialBookNotes || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErrorReason(json.error || 'submit_failed');
        return;
      }
      setDone({
        summary: decision.replace(/_/g, ' '),
        recordHash: json.result?.recordHash,
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function submitBatch() {
    if (!authorised || !assessed || !batch || !allBatchDecided) return;
    setSubmitting(true);
    try {
      const decisions = batch.items.map((item) => ({
        itemId: item.id,
        decision: itemDecisions[item.id].decision as
          | 'approved'
          | 'changes_requested'
          | 'rejected',
        decisionNotes: itemDecisions[item.id].decisionNotes || undefined,
      }));
      const res = await fetch(`/api/trb/signoff/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      });
      const json = await res.json();
      if (!res.ok) {
        setErrorReason(json.error || json.code || 'submit_failed');
        return;
      }
      const r = json.result || {};
      setDone({
        summary: `${r.approved ?? 0} approved · ${r.changes_requested ?? 0} changes · ${r.rejected ?? 0} rejected`,
      });
      setConfirmOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  const programme = single?.programme || batch?.programme;
  const isMcaPilot = single?.isMcaPilot || batch?.isMcaPilot;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <header
        className="sticky top-0 z-50 w-full border-b shrink-0"
        style={{ backgroundColor: '#000b15', borderColor: 'rgba(255, 255, 255, 0.1)' }}
      >
        <div className="container mx-auto flex h-16 items-center px-4">
          <a href="/" className="text-white font-semibold text-lg">
            SeaJourney
          </a>
          <span className="ml-3 text-white/70 text-sm">Digital TRB Companion</span>
        </div>
      </header>

      <main className="flex-1 container mx-auto max-w-3xl px-4 py-8 space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading review…
          </div>
        ) : done ? (
          <Card>
            <CardHeader>
              <CardTitle>Decision recorded</CardTitle>
              <CardDescription>
                Thank you. This secure link is now used and cannot be submitted again.
                Dashboard review for the same request is also closed.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>
                Outcome: <Badge>{done.summary}</Badge>
              </p>
              {done.recordHash ? (
                <p className="text-xs text-muted-foreground break-all">
                  Integrity hash: {done.recordHash}
                </p>
              ) : null}
              <Alert>
                <AlertTitle>Credentials</AlertTitle>
                <AlertDescription>
                  Your CoC details were recorded as <strong>self-declared</strong>. SeaJourney
                  has not independently verified them in this pilot. Digital approval does not
                  replace the official TRB signature.
                </AlertDescription>
              </Alert>
              <Alert>
                <AlertTitle>Pilot disclaimer</AlertTitle>
                <AlertDescription>{MCA_PILOT_DISCLAIMER}</AlertDescription>
              </Alert>
              {!fbSubmitted ? (
                <div className="space-y-2 border-t pt-3">
                  <p className="font-medium text-sm">Optional pilot feedback</p>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {(
                      [
                        ['Ease', fbEase, setFbEase],
                        ['Clarity', fbClarity, setFbClarity],
                        ['Confidence', fbConfidence, setFbConfidence],
                      ] as const
                    ).map(([label, value, setter]) => (
                      <div key={label} className="space-y-1">
                        <Label className="text-xs">{label}</Label>
                        <Select value={value} onValueChange={setter}>
                          <SelectTrigger className="h-8">
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
                  <Textarea
                    rows={2}
                    placeholder="What worked?"
                    value={fbWorked}
                    onChange={(e) => setFbWorked(e.target.value)}
                  />
                  <Button
                    size="sm"
                    onClick={async () => {
                      await fetch('/api/trb/feedback', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          token,
                          easeOfUseRating: Number(fbEase),
                          clarityRating: Number(fbClarity),
                          confidenceRating: Number(fbConfidence),
                          whatWorked: fbWorked || null,
                          wouldUseAgain: true,
                        }),
                      });
                      setFbSubmitted(true);
                    }}
                  >
                    Submit feedback
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Thank you for your feedback.</p>
              )}
            </CardContent>
          </Card>
        ) : errorReason ? (
          <Alert variant="destructive">
            <AlertTitle>Link unavailable</AlertTitle>
            <AlertDescription>
              This review link is invalid, expired, or already used ({errorReason}).
              {errorReason === 'used' || errorReason === 'token_not_pending'
                ? ' A decision may already have been recorded from Training Sign-offs in the dashboard.'
                : ''}
            </AlertDescription>
          </Alert>
        ) : single || batch ? (
          <>
            <Alert>
              <AlertTitle>Pilot programme</AlertTitle>
              <AlertDescription>
                {programme?.disclaimer ||
                  (isMcaPilot ? MCA_PILOT_DISCLAIMER : TRB_DISCLAIMER)}
              </AlertDescription>
            </Alert>

            {isMcaPilot ? (
              <Alert>
                <AlertTitle>Attribution</AlertTitle>
                <AlertDescription className="space-y-1">
                  <p>{programme?.attribution || MCA_PILOT_ATTRIBUTION}</p>
                  <p className="text-xs">
                    <a
                      className="underline"
                      href={programme?.sourceUrl || MCA_PILOT_SOURCE_URL}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Official publication
                    </a>
                    {' · '}
                    <a
                      className="underline"
                      href={programme?.oglUrl || MCA_PILOT_OGL_URL}
                      target="_blank"
                      rel="noreferrer"
                    >
                      OGL v3.0
                    </a>
                  </p>
                </AlertDescription>
              </Alert>
            ) : null}

            {batch ? (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">
                      Multi-task review · {batch.counts.total} tasks
                    </CardTitle>
                    <CardDescription>
                      {batch.programme.name}
                      {batch.programme.version ? ` · v${batch.programme.version}` : ''}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <p>
                      <strong>Candidate:</strong> {batch.candidate.name}
                      {batch.batch.vesselName
                        ? ` · Vessel: ${batch.batch.vesselName}`
                        : ''}
                    </p>
                    {batch.batch.optionalMessage ? (
                      <div>
                        <p className="font-medium">Crew message</p>
                        <p className="whitespace-pre-wrap text-muted-foreground">
                          {batch.batch.optionalMessage}
                        </p>
                      </div>
                    ) : null}
                    <p className="text-xs text-muted-foreground">
                      Link expires{' '}
                      {new Date(batch.batch.expiresAt).toLocaleString('en-GB')}
                    </p>
                  </CardContent>
                </Card>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setAllDecisions('approved')}
                  >
                    Approve all
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setAllDecisions('changes_requested')}
                  >
                    Request changes on all
                  </Button>
                </div>

                {batch.items.map((item) => (
                  <Card key={item.id}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">
                        {item.task?.taskCode} ·{' '}
                        {item.task?.officialTitle || item.task?.title}
                      </CardTitle>
                      <CardDescription>{item.section?.title}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                      <p className="whitespace-pre-wrap">
                        {item.task?.officialDescription || item.task?.description}
                      </p>
                      <div>
                        <p className="font-medium">Candidate notes</p>
                        <p className="whitespace-pre-wrap text-muted-foreground">
                          {item.progress?.candidateNotes || '—'}
                        </p>
                      </div>
                      <div>
                        <p className="font-medium mb-1">Evidence</p>
                        {item.evidence.length === 0 ? (
                          <p className="text-muted-foreground">No files uploaded.</p>
                        ) : (
                          item.evidence.map((e) => (
                            <button
                              key={e.id}
                              type="button"
                              className="block text-left underline text-sm"
                              onClick={() => void openEvidence(e.id)}
                            >
                              {e.originalFilename}
                            </button>
                          ))
                        )}
                      </div>
                      <div className="space-y-2 border-t pt-3">
                        <Label>Decision</Label>
                        <Select
                          value={itemDecisions[item.id]?.decision || ''}
                          onValueChange={(v) =>
                            setItemDecisions((prev) => ({
                              ...prev,
                              [item.id]: {
                                ...prev[item.id],
                                decision: v as ItemDecision['decision'],
                              },
                            }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Choose decision" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="approved">Approve</SelectItem>
                            <SelectItem value="changes_requested">
                              Request changes
                            </SelectItem>
                            <SelectItem value="rejected">Reject</SelectItem>
                          </SelectContent>
                        </Select>
                        <Textarea
                          rows={2}
                          placeholder="Feedback (required for changes / reject)"
                          value={itemDecisions[item.id]?.decisionNotes || ''}
                          onChange={(e) =>
                            setItemDecisions((prev) => ({
                              ...prev,
                              [item.id]: {
                                ...prev[item.id],
                                decisionNotes: e.target.value,
                              },
                            }))
                          }
                        />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </>
            ) : null}

            {single ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">
                    {single.task?.taskCode} ·{' '}
                    {single.task?.officialTitle || single.task?.title}
                  </CardTitle>
                  <CardDescription>
                    {single.programme.name}
                    {single.programme.version ? ` · v${single.programme.version}` : ''} ·{' '}
                    {single.section?.title}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <p>
                    <strong>Candidate:</strong> {single.candidate.name}
                    {single.candidate.vesselName
                      ? ` · Vessel: ${single.candidate.vesselName}`
                      : ''}
                  </p>
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Official task wording
                    </p>
                    <p className="mt-1 whitespace-pre-wrap">
                      {single.task?.officialDescription || single.task?.description}
                    </p>
                  </div>
                  <div>
                    <p className="font-medium">Candidate notes</p>
                    <p className="whitespace-pre-wrap text-muted-foreground">
                      {single.progress.candidateNotes || '—'}
                    </p>
                  </div>
                  <div>
                    <p className="font-medium mb-1">Evidence</p>
                    {single.evidence.length === 0 ? (
                      <p className="text-muted-foreground">No files uploaded.</p>
                    ) : (
                      single.evidence.map((e) => (
                        <button
                          key={e.id}
                          type="button"
                          className="block text-left underline text-sm"
                          onClick={() => void openEvidence(e.id)}
                        >
                          {e.originalFilename}
                        </button>
                      ))
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Link expires{' '}
                    {new Date(single.request.expiresAt).toLocaleString('en-GB')}
                  </p>
                </CardContent>
              </Card>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {batch ? 'Confirm & submit decisions' : 'Your decision'}
                </CardTitle>
                <CardDescription>
                  Credentials are self-declared unless SeaJourney has separately verified
                  them.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Full name</Label>
                    <Input
                      value={signerName}
                      onChange={(e) => setSignerName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Rank</Label>
                    <Input
                      value={signerRank}
                      onChange={(e) => setSignerRank(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>CoC number</Label>
                    <Input value={coc} onChange={(e) => setCoc(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Issuing authority</Label>
                    <Input
                      value={authority}
                      onChange={(e) => setAuthority(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Declaration</Label>
                  <Textarea
                    value={declaration}
                    onChange={(e) => setDeclaration(e.target.value)}
                    rows={3}
                  />
                </div>
                {batch ? (
                  <div className="space-y-1.5">
                    <Label>Overall feedback (optional)</Label>
                    <Textarea
                      value={overallFeedback}
                      onChange={(e) => setOverallFeedback(e.target.value)}
                      rows={2}
                    />
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Label>Decision notes (required for changes / reject)</Label>
                    <Textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={3}
                    />
                  </div>
                )}
                <label className="flex items-start gap-2 text-sm">
                  <Checkbox
                    checked={authorised}
                    onCheckedChange={(v) => setAuthorised(v === true)}
                  />
                  <span>I am authorised to review these training tasks.</span>
                </label>
                <label className="flex items-start gap-2 text-sm">
                  <Checkbox
                    checked={assessed}
                    onCheckedChange={(v) => setAssessed(v === true)}
                  />
                  <span>I have personally assessed the candidate for these tasks.</span>
                </label>
                {single?.isMcaPilot ? (
                  <div className="space-y-2 rounded-md border p-3">
                    <Label className="text-xs">
                      Official Training Record Book status (optional)
                    </Label>
                    <Select
                      value={officialBookStatus}
                      onValueChange={setOfficialBookStatus}
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue placeholder="Optional — captain report" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="not_recorded">Not recorded</SelectItem>
                        <SelectItem value="awaiting_signature">
                          Awaiting / will be signed
                        </SelectItem>
                        <SelectItem value="signed">Already signed in official TRB</SelectItem>
                        <SelectItem value="discrepancy_reported">
                          Discrepancy reported
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <Textarea
                      rows={2}
                      placeholder="Optional notes"
                      value={officialBookNotes}
                      onChange={(e) => setOfficialBookNotes(e.target.value)}
                    />
                  </div>
                ) : null}

                {batch ? (
                  confirmOpen ? (
                    <div className="space-y-3 rounded-md border border-amber-200 bg-amber-50 p-3">
                      <p className="text-sm font-medium">Confirm submission</p>
                      <ul className="max-h-40 space-y-1 overflow-y-auto text-xs">
                        {batch.items.map((item) => (
                          <li key={item.id}>
                            {item.task?.taskCode}:{' '}
                            {(itemDecisions[item.id]?.decision || '').replace(/_/g, ' ')}
                          </li>
                        ))}
                      </ul>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          disabled={submitting}
                          onClick={() => void submitBatch()}
                        >
                          {submitting ? (
                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          ) : null}
                          Confirm & submit
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={submitting}
                          onClick={() => setConfirmOpen(false)}
                        >
                          Back
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      disabled={
                        submitting || !authorised || !assessed || !allBatchDecided
                      }
                      onClick={() => setConfirmOpen(true)}
                    >
                      Review & submit all decisions
                    </Button>
                  )
                ) : (
                  <div className="flex flex-wrap gap-2 pt-2">
                    <Button
                      disabled={submitting || !authorised || !assessed}
                      onClick={() => void submitSingle('approved')}
                    >
                      Approve
                    </Button>
                    <Button
                      variant="outline"
                      disabled={submitting || !authorised || !assessed}
                      onClick={() => void submitSingle('changes_requested')}
                    >
                      Request changes
                    </Button>
                    <Button
                      variant="destructive"
                      disabled={submitting || !authorised || !assessed}
                      onClick={() => void submitSingle('rejected')}
                    >
                      Reject
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        ) : null}
      </main>

      <footer
        className="shrink-0 border-t py-6"
        style={{ backgroundColor: '#000b15', borderColor: 'rgba(255, 255, 255, 0.1)' }}
      >
        <div className="container mx-auto px-4 text-center text-sm text-white/60">
          &copy; {new Date().getFullYear()} SeaJourney · Digital TRB Companion pilot
        </div>
      </footer>
    </div>
  );
}
