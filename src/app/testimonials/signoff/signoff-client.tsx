// app/testimonials/signoff/signoff-client.tsx
'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { format, parse } from 'date-fns';
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Ship,
  Calendar,
  Clock,
  AlertCircle,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import Image from 'next/image';

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
    [key: string]: any;
  } | null;
}

export default function SignoffClient() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const email = searchParams.get('email');

  const [testimonial, setTestimonial] = useState<TestimonialSummary | null>(
    null,
  );
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
        `/api/captain/signoff?token=${encodeURIComponent(
          token,
        )}&email=${encodeURIComponent(email)}`,
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
        rejectionReason:
          decision === 'reject' ? rejectionReason.trim() : undefined,
        commentConduct: decision === 'approve' ? commentConduct.trim() : undefined,
        commentAbility: decision === 'approve' ? commentAbility.trim() : undefined,
        commentGeneral: decision === 'approve' ? commentGeneral.trim() : undefined,
      }),
    });

    const json = await res.json();
    setProcessing(false);

    if (!json.success) {
      setError(
        json.error ||
          'Failed to record your decision. Please try again later.',
      );
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
      <div className="flex min-h-screen items-center justify-center subtle-gradient-background">
        <div className="text-center space-y-6">
          <div className="flex items-center justify-center mb-6">
            <Image
              src="/seajourney_logo_white.png"
              alt="SeaJourney"
              width={180}
              height={64}
              className="h-14 w-auto"
              priority
            />
          </div>
          <Loader2 className="h-8 w-8 animate-spin text-white/70 mx-auto" />
          <p className="text-sm text-white/70">Loading testimonial...</p>
        </div>
      </div>
    );
  }

  if (error && !testimonial) {
    return (
      <div className="min-h-screen subtle-gradient-background flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-lg space-y-6">
          {/* Branding Header */}
          <div className="flex items-center justify-center py-8 border-b border-white/10">
            <Image
              src="/seajourney_logo_white.png"
              alt="SeaJourney"
              width={200}
              height={72}
              className="h-16 w-auto"
              priority
            />
          </div>

          <Card>
            <CardHeader className="text-center pb-4">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <AlertCircle className="h-6 w-6 text-muted-foreground" />
              </div>
              <CardTitle className="text-xl">Unable to Load</CardTitle>
              <CardDescription className="text-base mt-2">
                {error}
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <p className="text-sm text-muted-foreground">
                If you believe this is an error, please contact the person who
                requested this testimonial.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (message && action) {
    const isApproved = action === 'approve';

    return (
      <div className="min-h-screen subtle-gradient-background flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-lg space-y-6">
          {/* Branding Header */}
          <div className="flex items-center justify-center py-8 border-b border-white/10">
            <Image
              src="/seajourney_logo_white.png"
              alt="SeaJourney"
              width={200}
              height={72}
              className="h-16 w-auto"
              priority
            />
          </div>

          <Card>
            <CardHeader className="text-center pb-4">
              <div
                className={`mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full ${
                  isApproved ? 'bg-green-50' : 'bg-red-50'
                }`}
              >
                {isApproved ? (
                  <CheckCircle2 className="h-6 w-6 text-green-600" />
                ) : (
                  <XCircle className="h-6 w-6 text-red-600" />
                )}
              </div>
              <CardTitle className="text-xl">
                {isApproved ? 'Testimonial Approved' : 'Testimonial Rejected'}
              </CardTitle>
              <CardDescription className="text-base mt-2">
                {isApproved
                  ? 'Thank you for confirming this sea service record. The crew member has been notified.'
                  : 'Your response has been recorded. The crew member has been notified with your reason.'}
              </CardDescription>
            </CardHeader>

            {testimonial && (
              <CardContent className="space-y-4 pt-0">
                <Separator />
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold">Summary</h3>
                  {testimonial.vessel && (
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                      <Ship className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">
                          {testimonial.vessel.name}
                        </p>
                        {testimonial.vessel.type && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {testimonial.vessel.type}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-lg bg-muted/50">
                      <p className="text-xs text-muted-foreground mb-1">
                        Service Period
                      </p>
                      <p className="font-medium text-xs leading-tight">
                        {format(
                          parse(
                            testimonial.start_date,
                            'yyyy-MM-dd',
                            new Date(),
                          ),
                          'MMM d, yyyy',
                        )}{' '}
                        -{' '}
                        {format(
                          parse(
                            testimonial.end_date,
                            'yyyy-MM-dd',
                            new Date(),
                          ),
                          'MMM d, yyyy',
                        )}
                      </p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/50">
                      <p className="text-xs text-muted-foreground mb-1">
                        Total Days
                      </p>
                      <p className="font-medium text-lg">
                        {testimonial.total_days}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            )}

            <CardContent className="pt-4">
              <p className="text-xs text-center text-muted-foreground">
                This link is no longer valid and cannot be used again.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!testimonial) {
    return null;
  }

  const startDate = parse(testimonial.start_date, 'yyyy-MM-dd', new Date());
  const endDate = parse(testimonial.end_date, 'yyyy-MM-dd', new Date());

  return (
    <div className="min-h-screen subtle-gradient-background">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* Branding Header */}
        <div className="flex items-center justify-center mb-10 py-8 border-b border-white/10">
          <Image
            src="/seajourney_logo_white.png"
            alt="SeaJourney"
            width={200}
            height={72}
            className="h-16 w-auto"
            priority
          />
        </div>

        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold tracking-tight mb-2 text-white">
            Sea Service Testimonial
          </h1>
          <p className="text-sm text-white/70">
            Please review the sea service record below and approve or reject
            this request.
          </p>
        </div>

        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            {/* Vessel Information */}
            <div className="space-y-4">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-2">
                  <Ship className="h-4 w-4" />
                  Vessel
                </div>
                <div className="space-y-2">
                  <p className="text-lg font-semibold">
                    {testimonial.vessel?.name || 'Unknown Vessel'}
                  </p>
                  {testimonial.vessel?.type && (
                    <p className="text-sm text-muted-foreground">
                      {testimonial.vessel.type}
                    </p>
                  )}
                  {(testimonial.vessel?.imo ||
                    testimonial.vessel?.mmsi ||
                    testimonial.vessel?.flag ||
                    testimonial.vessel?.gross_tonnage) && (
                    <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-xs text-muted-foreground pt-2 border-t">
                      {testimonial.vessel?.imo && (
                        <span>
                          <span className="font-medium">IMO:</span>{' '}
                          {testimonial.vessel.imo}
                        </span>
                      )}
                      {testimonial.vessel?.mmsi && (
                        <span>
                          <span className="font-medium">MMSI:</span>{' '}
                          {testimonial.vessel.mmsi}
                        </span>
                      )}
                      {testimonial.vessel?.flag && (
                        <span>
                          <span className="font-medium">Flag:</span>{' '}
                          {testimonial.vessel.flag}
                        </span>
                      )}
                      {testimonial.vessel?.gross_tonnage && (
                        <span>
                          <span className="font-medium">GT:</span>{' '}
                          {testimonial.vessel.gross_tonnage}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <Separator />

              {/* Date Range */}
              <div>
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-2">
                  <Calendar className="h-4 w-4" />
                  Service Period
                </div>
                <p className="text-base font-medium">
                  {format(startDate, 'MMMM d, yyyy')} -{' '}
                  {format(endDate, 'MMMM d, yyyy')}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {testimonial.total_days} total days
                </p>
              </div>

              <Separator />

              {/* Service Breakdown */}
              <div>
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-3">
                  <Clock className="h-4 w-4" />
                  Service Breakdown
                </div>
                <div className="flex flex-wrap gap-2">
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border bg-background">
                    <span className="text-xs text-muted-foreground">
                      At Sea:
                    </span>
                    <span className="text-xs font-medium">
                      {testimonial.at_sea_days}
                    </span>
                  </div>
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border bg-background">
                    <span className="text-xs text-muted-foreground">
                      Standby:
                    </span>
                    <span className="text-xs font-medium">
                      {testimonial.standby_days}
                    </span>
                  </div>
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border bg-background">
                    <span className="text-xs text-muted-foreground">
                      In Yard:
                    </span>
                    <span className="text-xs font-medium">
                      {testimonial.yard_days}
                    </span>
                  </div>
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border bg-background">
                    <span className="text-xs text-muted-foreground">
                      On Leave:
                    </span>
                    <span className="text-xs font-medium">
                      {testimonial.leave_days}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            <Separator />

            {/* Action Section */}
            <div className="space-y-4">
              {/* Captain Comments Section */}
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold mb-3">Comments (Optional)</h3>
                  <p className="text-xs text-muted-foreground mb-4">
                    You may provide comments on the following areas. These will be included in the testimonial document.
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="comment-conduct" className="text-sm">
                    Conduct
                  </Label>
                  <Textarea
                    id="comment-conduct"
                    placeholder="Comment on the seafarer's conduct..."
                    value={commentConduct}
                    onChange={(e) => setCommentConduct(e.target.value)}
                    rows={2}
                    className="resize-none"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="comment-ability" className="text-sm">
                    Ability
                  </Label>
                  <Textarea
                    id="comment-ability"
                    placeholder="Comment on the seafarer's ability..."
                    value={commentAbility}
                    onChange={(e) => setCommentAbility(e.target.value)}
                    rows={2}
                    className="resize-none"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="comment-general" className="text-sm">
                    General Comments
                  </Label>
                  <Textarea
                    id="comment-general"
                    placeholder="Any additional general comments..."
                    value={commentGeneral}
                    onChange={(e) => setCommentGeneral(e.target.value)}
                    rows={2}
                    className="resize-none"
                  />
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="rejection-reason" className="text-sm">
                  Rejection Reason{' '}
                  <span className="text-muted-foreground font-normal">
                    (Required if rejecting)
                  </span>
                </Label>
                <Textarea
                  id="rejection-reason"
                  placeholder="Please provide a reason for rejection if you plan to reject this testimonial..."
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  rows={3}
                  className="resize-none"
                />
                <p className="text-xs text-muted-foreground">
                  This reason will be shared with the crew member if you reject
                  the testimonial.
                </p>
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={() => handleDecision('approve')}
                  disabled={processing}
                  className="flex-1"
                  variant="default"
                >
                  {processing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Approve
                    </>
                  )}
                </Button>
                <Button
                  onClick={() => handleDecision('reject')}
                  disabled={processing}
                  className="flex-1"
                  variant="destructive"
                >
                  {processing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <XCircle className="mr-2 h-4 w-4" />
                      Reject
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="mt-8 text-center">
          <p className="text-xs text-white/60">
            This link will expire after use. If you have any questions, please
            contact the crew member directly.
          </p>
        </div>
      </div>
    </div>
  );
}
