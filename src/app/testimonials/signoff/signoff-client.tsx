// app/testimonials/signoff/signoff-client.tsx
'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { format, parse } from 'date-fns';
import Link from 'next/link';
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Ship,
  AlertCircle,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import Logo from '@/components/logo';

interface TestimonialSummary {
  id: string;
  vessel_id: string;
  start_date: string;
  end_date: string;
  total_days: number;
  at_sea_days: number;
  standby_days: number;
  yard_days: number;
  leave_days: number;
  captain_name: string | null;
  captain_email: string | null;
  crew_member_name?: string | null;
  crew_member_position?: string | null;
  vessel: {
    id: string;
    name: string;
    type: string | null;
    imo?: string | null;
    mmsi?: string | null;
    flag?: string | null;
    gross_tonnage?: number | null;
    length_m?: number | null;
    beam?: number | null;
    draft?: number | null;
    call_sign?: string | null;
    [key: string]: unknown;
  } | null;
}

const SignoffLayout = ({
  children,
  title,
}: {
  children: React.ReactNode;
  title?: string;
}) => (
  <div className="min-h-screen flex flex-col">
    <header
      className="sticky top-0 z-50 w-full border-b backdrop-blur-md shrink-0"
      style={{
        backgroundColor: '#000b15',
        borderColor: 'rgba(255, 255, 255, 0.1)',
      }}
    >
      <div className="container mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
        <Logo className="text-white" />
        {title && (
          <span className="text-sm font-medium text-white/80 hidden sm:block">
            {title}
          </span>
        )}
      </div>
    </header>
    <main className="flex-1 flex flex-col bg-white">{children}</main>
    <footer
      className="shrink-0 border-t py-6"
      style={{ backgroundColor: '#000b15', borderColor: 'rgba(255, 255, 255, 0.1)' }}
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-white/60">
        <span>&copy; {new Date().getFullYear()} SeaJourney. All rights reserved.</span>
        <Link href="/verify" className="text-white/70 hover:text-white transition-colors">
          Verify records
        </Link>
      </div>
    </footer>
  </div>
);

export default function SignoffClient() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const email = searchParams.get('email');

  const [testimonial, setTestimonial] = useState<TestimonialSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [action, setAction] = useState<'approve' | 'reject' | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [commentConduct, setCommentConduct] = useState('');
  const [commentAbility, setCommentAbility] = useState('');
  const [commentGeneral, setCommentGeneral] = useState('');

  useEffect(() => {
    async function load() {
      if (!token || !email) {
        setError('Invalid sign-off link.');
        setLoading(false);
        return;
      }

      const res = await fetch(
        `/api/captain/signoff?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`,
      );
      const json = await res.json();

      if (!res.ok || !json.success) {
        setError(json.error || 'This sign-off link is invalid or has expired.');
        setLoading(false);
        return;
      }

      setTestimonial(json.testimonial);
      setLoading(false);
    }

    load();
  }, [token, email]);

  async function handleDecision(decision: 'approve' | 'reject') {
    if (!token || !email || !testimonial) return;

    if (decision === 'reject' && !rejectionReason.trim()) {
      setError('Please provide a reason for rejection.');
      return;
    }

    setProcessing(true);
    setError(null);
    setMessage(null);

    const res = await fetch('/api/captain/signoff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        email,
        decision,
        rejectionReason: decision === 'reject' ? rejectionReason.trim() : undefined,
        commentConduct: decision === 'approve' ? commentConduct.trim() : undefined,
        commentAbility: decision === 'approve' ? commentAbility.trim() : undefined,
        commentGeneral: decision === 'approve' ? commentGeneral.trim() : undefined,
      }),
    });

    const json = await res.json();
    setProcessing(false);

    if (!json.success) {
      setError(json.error || 'Failed to record your decision. Please try again later.');
      return;
    }

    setMessage(
      decision === 'approve'
        ? 'Thank you. Your approval has been recorded.'
        : 'Your rejection has been recorded.',
    );
    setAction(decision);
  }

  if (loading) {
    return (
      <SignoffLayout title="Captain sign-off">
        <div className="flex-1 flex items-center justify-center py-16">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center space-y-6">
              <Loader2 className="h-10 w-10 animate-spin text-muted-foreground mx-auto" />
              <p className="text-sm text-muted-foreground">Loading testimonial…</p>
            </div>
          </div>
        </div>
      </SignoffLayout>
    );
  }

  if (error && !testimonial) {
    return (
      <SignoffLayout title="Captain sign-off">
        <div className="flex-1 flex items-center justify-center py-16">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="w-full max-w-md mx-auto rounded-xl border border-border bg-card p-8 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-50">
              <AlertCircle className="h-7 w-7 text-amber-600" />
            </div>
            <h2 className="text-xl font-semibold text-foreground">Unable to load</h2>
            <p className="mt-2 text-muted-foreground">{error}</p>
            <p className="mt-4 text-sm text-muted-foreground">
              If you believe this is an error, please contact the person who requested this testimonial.
            </p>
            </div>
          </div>
        </div>
      </SignoffLayout>
    );
  }

  if (message && action) {
    const isApproved = action === 'approve';

    return (
      <SignoffLayout title="Captain sign-off">
        <div className="flex-1 flex items-center justify-center py-16">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="w-full max-w-lg mx-auto rounded-xl border border-border bg-card p-8 shadow-sm">
            <div className="text-center">
              <div
                className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full ${
                  isApproved ? 'bg-emerald-50' : 'bg-red-50'
                }`}
              >
                {isApproved ? (
                  <CheckCircle2 className="h-7 w-7 text-emerald-600" />
                ) : (
                  <XCircle className="h-7 w-7 text-red-600" />
                )}
              </div>
              <h2 className="text-xl font-semibold text-foreground">
                {isApproved ? 'Testimonial approved' : 'Testimonial rejected'}
              </h2>
              <p className="mt-2 text-muted-foreground">
                {isApproved
                  ? 'Thank you for confirming this sea service record. The crew member has been notified.'
                  : 'Your response has been recorded. The crew member has been notified with your reason.'}
              </p>
            </div>
            {testimonial && (
              <div className="mt-6 pt-6 border-t space-y-3">
                <h3 className="text-sm font-semibold text-foreground">Summary</h3>
                {(testimonial.crew_member_name || testimonial.crew_member_position) && (
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground mb-1">Testimonial for</p>
                    <p className="font-medium text-sm text-foreground">{testimonial.crew_member_name || 'Crew member'}</p>
                    {testimonial.crew_member_position && (
                      <p className="text-xs text-muted-foreground mt-0.5">{testimonial.crew_member_position}</p>
                    )}
                  </div>
                )}
                {testimonial.vessel && (
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                    <Ship className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-foreground">{testimonial.vessel.name}</p>
                      {testimonial.vessel.type && (
                        <p className="text-xs text-muted-foreground mt-0.5">{testimonial.vessel.type}</p>
                      )}
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground mb-1">Service period</p>
                    <p className="font-medium text-xs leading-tight text-foreground">
                      {format(parse(testimonial.start_date, 'yyyy-MM-dd', new Date()), 'MMM d, yyyy')} –{' '}
                      {format(parse(testimonial.end_date, 'yyyy-MM-dd', new Date()), 'MMM d, yyyy')}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground mb-1">Total days</p>
                    <p className="font-medium text-lg text-foreground">{testimonial.total_days}</p>
                  </div>
                </div>
              </div>
            )}
            <p className="mt-6 text-xs text-center text-muted-foreground">
              This link is no longer valid and cannot be used again.
            </p>
            </div>
          </div>
        </div>
      </SignoffLayout>
    );
  }

  if (!testimonial) return null;

  const startDate = parse(testimonial.start_date, 'yyyy-MM-dd', new Date());
  const endDate = parse(testimonial.end_date, 'yyyy-MM-dd', new Date());

  return (
    <SignoffLayout title="Captain sign-off">
      <div className="flex-1 w-full py-8 sm:py-10">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <h1 className="font-headline text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
              Sea service testimonial
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Review the sea service record below and approve or reject this request.
            </p>
          </div>

          {error && (
            <Alert variant="destructive" className="mb-6">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-5 gap-6 xl:gap-8">
            {/* Left: Sea service details (crew data) */}
            <div className="xl:col-span-2 space-y-4">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Sea service details
              </h2>
              <div className="rounded-xl border border-border bg-muted/30 overflow-hidden">
                {/* Testimonial for (crew member) */}
                {(testimonial.crew_member_name || testimonial.crew_member_position) && (
                  <div className="p-5 sm:p-6 border-b border-border">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">Testimonial for</p>
                    <p className="text-xl font-semibold text-foreground">
                      {testimonial.crew_member_name || 'Crew member'}
                    </p>
                    {testimonial.crew_member_position && (
                      <p className="text-sm text-muted-foreground mt-1">{testimonial.crew_member_position}</p>
                    )}
                  </div>
                )}
                {/* Vessel */}
                <div className="p-5 sm:p-6 border-b border-border">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">Vessel</p>
                  <p className="text-xl font-semibold text-foreground">
                    {testimonial.vessel?.name || 'Unknown vessel'}
                  </p>
                  {testimonial.vessel?.type && (
                    <p className="text-sm text-muted-foreground mt-1">{testimonial.vessel.type}</p>
                  )}
                  {(testimonial.vessel?.imo || testimonial.vessel?.mmsi || testimonial.vessel?.flag || testimonial.vessel?.gross_tonnage != null) && (
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 pt-3 border-t border-border text-xs text-muted-foreground">
                      {testimonial.vessel?.imo && <span><span className="font-medium">IMO</span> {testimonial.vessel.imo}</span>}
                      {testimonial.vessel?.mmsi && <span><span className="font-medium">MMSI</span> {testimonial.vessel.mmsi}</span>}
                      {testimonial.vessel?.flag && <span><span className="font-medium">Flag</span> {testimonial.vessel.flag}</span>}
                      {testimonial.vessel?.gross_tonnage != null && <span><span className="font-medium">GT</span> {testimonial.vessel.gross_tonnage}</span>}
                    </div>
                  )}
                </div>

                {/* Service period */}
                <div className="p-5 sm:p-6 border-b border-border">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">Service period</p>
                  <p className="text-base font-medium text-foreground">
                    {format(startDate, 'd MMMM yyyy')} – {format(endDate, 'd MMMM yyyy')}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">{testimonial.total_days} days total</p>
                </div>

                {/* Breakdown stats */}
                <div className="p-5 sm:p-6">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">Days breakdown</p>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'At sea', value: testimonial.at_sea_days },
                      { label: 'Standby', value: testimonial.standby_days },
                      { label: 'In yard', value: testimonial.yard_days },
                      { label: 'On leave', value: testimonial.leave_days },
                    ].map(({ label, value }) => (
                      <div
                        key={label}
                        className="rounded-lg border border-border bg-background px-4 py-3"
                      >
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <p className="text-2xl font-semibold text-foreground tabular-nums">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Your response (comments, rejection, actions) */}
            <div className="xl:col-span-3 space-y-4">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Your response
              </h2>
              <div className="rounded-xl border border-border bg-card p-5 sm:p-6 lg:p-8 space-y-6">
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Comments (optional)</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Included on the testimonial document.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-2 sm:col-span-1">
                      <Label htmlFor="comment-conduct" className="text-sm text-foreground">Conduct</Label>
                      <Textarea
                        id="comment-conduct"
                        placeholder="Conduct…"
                        value={commentConduct}
                        onChange={(e) => setCommentConduct(e.target.value)}
                        rows={3}
                        className="resize-none"
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-1">
                      <Label htmlFor="comment-ability" className="text-sm text-foreground">Ability</Label>
                      <Textarea
                        id="comment-ability"
                        placeholder="Ability…"
                        value={commentAbility}
                        onChange={(e) => setCommentAbility(e.target.value)}
                        rows={3}
                        className="resize-none"
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-1">
                      <Label htmlFor="comment-general" className="text-sm text-foreground">General</Label>
                      <Textarea
                        id="comment-general"
                        placeholder="General comments…"
                        value={commentGeneral}
                        onChange={(e) => setCommentGeneral(e.target.value)}
                        rows={3}
                        className="resize-none"
                      />
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label htmlFor="rejection-reason" className="text-sm font-semibold text-foreground">
                    Rejection reason <span className="text-muted-foreground font-normal">(required if rejecting)</span>
                  </Label>
                  <Textarea
                    id="rejection-reason"
                    placeholder="If you reject, provide a reason for the crew member…"
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    rows={3}
                    className="resize-none"
                  />
                </div>

                <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
                  <Button
                    onClick={() => handleDecision('reject')}
                    disabled={processing}
                    variant="destructive"
                    className="flex-1 h-11 font-medium"
                  >
                    {processing ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing…</>
                    ) : (
                      <><XCircle className="mr-2 h-4 w-4" /> Reject</>
                    )}
                  </Button>
                  <Button
                    onClick={() => handleDecision('approve')}
                    disabled={processing}
                    className="flex-1 h-11 font-medium bg-primary hover:bg-primary/90 text-primary-foreground"
                  >
                    {processing ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing…</>
                    ) : (
                      <><CheckCircle2 className="mr-2 h-4 w-4" /> Approve</>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <p className="mt-8 text-center text-xs text-muted-foreground">
            This link expires after use. Questions? Contact the person who requested this testimonial.
          </p>
        </div>
      </div>
    </SignoffLayout>
  );
}
