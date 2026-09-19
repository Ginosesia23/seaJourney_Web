'use client';

import { useCallback, useEffect, useState } from 'react';
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
import { MCA_PILOT_ATTRIBUTION, MCA_PILOT_DISCLAIMER, MCA_PILOT_OGL_URL, MCA_PILOT_SOURCE_URL } from '@/lib/trb/pilot';
import { TRB_DISCLAIMER } from '@/lib/trb/constants';

type ResolveOk = {
  ok: true;
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
  section: {
    title: string;
    source_section_reference?: string | null;
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
    required_signer_role?: string | null;
  } | null;
  progress: {
    id: string;
    enrollmentId?: string;
    candidateNotes: string | null;
    claimedCompletedAt: string | null;
  };
  evidence: {
    id: string;
    original_filename: string;
    mime_type: string;
    file_size: number;
  }[];
  priorChangesRequested: {
    id: string;
    decision_notes: string | null;
    signed_at: string;
    signer_name: string;
  }[];
  request: {
    expiresAt: string;
    signerEmail: string;
    signerName: string | null;
    requiredSignerRole?: string | null;
  };
};

export default function TrbSignoffClientPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ResolveOk | null>(null);
  const [errorReason, setErrorReason] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ decision: string; recordHash?: string } | null>(null);

  const [signerName, setSignerName] = useState('');
  const [signerRank, setSignerRank] = useState('');
  const [coc, setCoc] = useState('');
  const [authority, setAuthority] = useState('');
  const [declaration, setDeclaration] = useState(
    'I confirm that I am authorised and have personally assessed the candidate against this demonstration training task.',
  );
  const [notes, setNotes] = useState('');
  const [authorised, setAuthorised] = useState(false);
  const [assessed, setAssessed] = useState(false);
  const [officialBookStatus, setOfficialBookStatus] = useState<string>('');
  const [officialBookNotes, setOfficialBookNotes] = useState('');
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
        setData(null);
        return;
      }
      setData(json as ResolveOk);
      if (json.request?.signerName) setSignerName(json.request.signerName);
    } catch {
      setErrorReason('unavailable');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openEvidence(evidenceId: string) {
    const res = await fetch(
      `/api/trb/evidence/download?evidenceId=${encodeURIComponent(evidenceId)}&token=${encodeURIComponent(token)}`,
    );
    const json = await res.json();
    if (!res.ok) return;
    window.open(json.signedUrl, '_blank', 'noopener,noreferrer');
  }

  async function submit(decision: 'approved' | 'changes_requested' | 'rejected') {
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
        decision,
        recordHash: json.result?.recordHash,
      });
    } finally {
      setSubmitting(false);
    }
  }

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
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>
                Decision: <Badge>{done.decision.replace(/_/g, ' ')}</Badge>
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
                <AlertDescription>
                  {MCA_PILOT_DISCLAIMER}
                </AlertDescription>
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
            </AlertDescription>
          </Alert>
        ) : data ? (
          <>
            <Alert>
              <AlertTitle>Pilot programme</AlertTitle>
              <AlertDescription>
                {data.programme.disclaimer ||
                  (data.isMcaPilot ? MCA_PILOT_DISCLAIMER : TRB_DISCLAIMER)}
              </AlertDescription>
            </Alert>

            {data.isMcaPilot ? (
              <Alert>
                <AlertTitle>Attribution</AlertTitle>
                <AlertDescription className="space-y-1">
                  <p>{data.programme.attribution || MCA_PILOT_ATTRIBUTION}</p>
                  <p className="text-xs">
                    <a
                      className="underline"
                      href={data.programme.sourceUrl || MCA_PILOT_SOURCE_URL}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Official publication
                    </a>
                    {' · '}
                    <a
                      className="underline"
                      href={data.programme.oglUrl || MCA_PILOT_OGL_URL}
                      target="_blank"
                      rel="noreferrer"
                    >
                      OGL v3.0
                    </a>
                  </p>
                </AlertDescription>
              </Alert>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  {data.task?.task_code} ·{' '}
                  {data.task?.official_title || data.task?.title}
                </CardTitle>
                <CardDescription>
                  {data.programme.name}
                  {data.programme.version ? ` · v${data.programme.version}` : ''} ·{' '}
                  {data.section?.title}
                  {data.task?.source_task_reference
                    ? ` · ${data.task.source_task_reference}`
                    : ''}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p>
                  <strong>Candidate:</strong> {data.candidate.name}
                  {data.candidate.vesselName
                    ? ` · Vessel: ${data.candidate.vesselName}`
                    : ''}
                </p>
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Official task wording
                  </p>
                  <p className="mt-1 whitespace-pre-wrap">
                    {data.task?.official_description || data.task?.description}
                  </p>
                </div>
                <div className="rounded-md border bg-muted/40 px-3 py-2">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    SeaJourney guidance (not official)
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                    {data.task?.seajourney_summary ||
                      data.task?.seajourney_guidance ||
                      data.task?.seajourney_completion_guidance ||
                      data.task?.evidence_guidance ||
                      '—'}
                  </p>
                </div>
                {data.request.requiredSignerRole || data.task?.required_signer_role ? (
                  <p className="text-xs text-muted-foreground">
                    Required signer role:{' '}
                    {(
                      data.request.requiredSignerRole ||
                      data.task?.required_signer_role ||
                      ''
                    ).replace(/_/g, ' ')}
                  </p>
                ) : null}
                <div>
                  <p className="font-medium">Candidate notes</p>
                  <p className="whitespace-pre-wrap text-muted-foreground">
                    {data.progress.candidateNotes || '—'}
                  </p>
                </div>
                {data.priorChangesRequested.length > 0 ? (
                  <div>
                    <p className="font-medium">Previous changes requested</p>
                    {data.priorChangesRequested.map((p) => (
                      <p key={p.id} className="text-muted-foreground">
                        {p.signer_name}: {p.decision_notes} (
                        {new Date(p.signed_at).toLocaleDateString('en-GB')})
                      </p>
                    ))}
                  </div>
                ) : null}
                <div>
                  <p className="font-medium mb-1">Evidence</p>
                  {data.evidence.length === 0 ? (
                    <p className="text-muted-foreground">No files uploaded.</p>
                  ) : (
                    data.evidence.map((e) => (
                      <button
                        key={e.id}
                        type="button"
                        className="block text-left underline text-sm"
                        onClick={() => void openEvidence(e.id)}
                      >
                        {e.original_filename}
                      </button>
                    ))
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Link expires {new Date(data.request.expiresAt).toLocaleString('en-GB')}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Your decision</CardTitle>
                <CardDescription>
                  Credentials are self-declared unless SeaJourney has separately verified them.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Full name</Label>
                    <Input value={signerName} onChange={(e) => setSignerName(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Rank</Label>
                    <Input value={signerRank} onChange={(e) => setSignerRank(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>CoC number</Label>
                    <Input value={coc} onChange={(e) => setCoc(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Issuing authority</Label>
                    <Input value={authority} onChange={(e) => setAuthority(e.target.value)} />
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
                <div className="space-y-1.5">
                  <Label>Decision notes (required for changes / reject)</Label>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
                </div>
                <label className="flex items-start gap-2 text-sm">
                  <Checkbox
                    checked={authorised}
                    onCheckedChange={(v) => setAuthorised(v === true)}
                  />
                  <span>I am authorised to review this training task.</span>
                </label>
                <label className="flex items-start gap-2 text-sm">
                  <Checkbox
                    checked={assessed}
                    onCheckedChange={(v) => setAssessed(v === true)}
                  />
                  <span>I have personally assessed the candidate for this task.</span>
                </label>
                {data.isMcaPilot ? (
                  <div className="space-y-2 rounded-md border p-3">
                    <Label className="text-xs">
                      Will or has the corresponding task also been signed in the
                      candidate&apos;s official Training Record Book?
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
                      placeholder="Optional notes (stored separately from the candidate)"
                      value={officialBookNotes}
                      onChange={(e) => setOfficialBookNotes(e.target.value)}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      This does not change the digital decision. Digital approval does not mark
                      the official book as signed.
                    </p>
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button
                    disabled={submitting || !authorised || !assessed}
                    onClick={() => void submit('approved')}
                  >
                    Approve
                  </Button>
                  <Button
                    variant="outline"
                    disabled={submitting || !authorised || !assessed}
                    onClick={() => void submit('changes_requested')}
                  >
                    Request changes
                  </Button>
                  <Button
                    variant="destructive"
                    disabled={submitting || !authorised || !assessed}
                    onClick={() => void submit('rejected')}
                  >
                    Reject
                  </Button>
                </div>
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
