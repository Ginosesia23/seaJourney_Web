'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { format, parse } from 'date-fns';
import { CheckCircle2, XCircle, Loader2, Ship, Calendar, Clock, AlertCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
    [key: string]: any; // Allow other fields from database
  } | null;
}

export default function SignoffPage() {
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

  useEffect(() => {
    async function load() {
      if (!token || !email) {
        setError('Invalid sign-off link.');
        setLoading(false);
        return;
      }

      const res = await fetch(
        `/api/captain/signoff?token=${encodeURIComponent(token)}&email=${encodeURIComponent(
          email,
        )}`,
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
      <div className="flex min-h-screen items-center justify-center bg-[#0c1721]">
        <div className="text-center">
          <div className="flex items-center justify-center mb-8">
            <Image
              src="/seajourney_logo_white.png"
              alt="SeaJourney"
              width={256}
              height={92}
              className="h-auto w-64 object-contain"
              priority
            />
          </div>
          <Loader2 className="h-8 w-8 animate-spin text-white mx-auto mt-6" />
          <p className="text-white/70 mt-4">Loading testimonial...</p>
        </div>
      </div>
    );
  }

  if (error && !testimonial) {
    return (
      <div className="min-h-screen bg-[#0c1721]">
        {/* Header with Logo */}
        <header className="bg-gradient-to-r from-[#0c1721] to-[#1a2d3f] border-b border-white/10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="flex items-center justify-center">
              <Image
                src="/seajourney_logo_white.png"
                alt="SeaJourney"
                width={256}
                height={92}
                className="h-auto w-64 object-contain"
                priority
              />
            </div>
          </div>
        </header>

        {/* Error Content */}
        <div className="flex min-h-[calc(100vh-200px)] items-center justify-center p-4">
          <div className="w-full max-w-lg">
            <Card className="bg-white border-gray-200 shadow-2xl overflow-hidden">
              {/* Status Header */}
              <div className="bg-gradient-to-r from-amber-500 to-amber-600 px-6 py-6 text-center">
                <div className="flex items-center justify-center mb-4">
                  <div className="h-16 w-16 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-sm">
                    <AlertCircle className="h-8 w-8 text-white" strokeWidth={2.5} />
                  </div>
                </div>
                <p className="text-white/90 text-base">
                  {error}
                </p>
              </div>

              {/* Content */}
              <CardContent className="px-6 py-6">
                <div className="text-center">
                  <p className="text-sm text-gray-600">
                    If you believe this is an error, please contact the person who requested this testimonial.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Footer */}
            <div className="mt-8 text-center">
              <p className="text-sm text-white/60">
                SeaJourney • Digital sea service testimonials
              </p>
              <p className="text-xs text-white/40 mt-1">
                www.seajourney.co.uk
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (message && action) {
    const isApproved = action === 'approve';
    
    return (
      <div className="min-h-screen bg-[#0c1721]">
        {/* Header with Logo */}
        <header className="bg-gradient-to-r from-[#0c1721] to-[#1a2d3f] border-b border-white/10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="flex items-center justify-center">
              <Image
                src="/seajourney_logo_white.png"
                alt="SeaJourney"
                width={256}
                height={92}
                className="h-auto w-64 object-contain"
                priority
              />
            </div>
          </div>
        </header>

        {/* Success Content */}
        <div className="flex min-h-[calc(100vh-200px)] items-center justify-center p-4">
          <div className="w-full max-w-2xl">
            <Card className="bg-white border-gray-200 shadow-2xl overflow-hidden">
              {/* Status Header - Compact */}
              <div className={`${isApproved ? 'bg-gradient-to-r from-green-500 to-green-600' : 'bg-gradient-to-r from-red-500 to-red-600'} px-6 py-6 text-center`}>
                <div className="flex items-center justify-center mb-3">
                  <div className="h-16 w-16 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-sm">
                    {isApproved ? (
                      <CheckCircle2 className="h-8 w-8 text-white" strokeWidth={2.5} />
                    ) : (
                      <XCircle className="h-8 w-8 text-white" strokeWidth={2.5} />
                    )}
                  </div>
                </div>
                <h1 className="text-xl font-bold text-white mb-2">
                  {isApproved ? 'Testimonial Approved' : 'Testimonial Rejected'}
                </h1>
                <p className="text-white/90 text-sm">
                  {isApproved 
                    ? 'Thank you for confirming this sea service record.'
                    : 'Your response has been recorded.'}
                </p>
              </div>

              {/* Content */}
              <CardContent className="px-6 py-6">
                <div className="space-y-5">
                  {/* Summary Message */}
                  <div className={`p-4 rounded-xl ${isApproved ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                    <p className={`text-center ${isApproved ? 'text-green-800' : 'text-red-800'} text-sm font-medium`}>
                      {isApproved
                        ? 'The crew member has been notified of your approval. This testimonial can now be used for official purposes.'
                        : 'The crew member has been notified with your reason for rejection.'}
                    </p>
                  </div>

                  {/* Testimonial Summary (if available) */}
                  {testimonial && (
                    <>
                      <Separator />
                      <div className="space-y-3">
                        <h3 className="text-base font-semibold text-gray-900">Testimonial Summary</h3>
                        
                        {testimonial.vessel && (
                          <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl">
                            <Ship className="h-4 w-4 text-[#2E8BC0] mt-0.5 flex-shrink-0" />
                            <div className="flex-1">
                              <p className="font-semibold text-gray-900 text-sm">{testimonial.vessel.name}</p>
                              {testimonial.vessel.type && (
                                <p className="text-xs text-gray-600 mt-0.5">{testimonial.vessel.type}</p>
                              )}
                            </div>
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-3">
                          <div className="p-3 bg-gray-50 rounded-xl">
                            <p className="text-xs text-gray-600 mb-1">Service Period</p>
                            <p className="font-semibold text-gray-900 text-xs leading-tight">
                              {format(parse(testimonial.start_date, 'yyyy-MM-dd', new Date()), 'MMM d, yyyy')} - {format(parse(testimonial.end_date, 'yyyy-MM-dd', new Date()), 'MMM d, yyyy')}
                            </p>
                          </div>
                          <div className="p-3 bg-gray-50 rounded-xl">
                            <p className="text-xs text-gray-600 mb-1">Total Days</p>
                            <p className="font-semibold text-gray-900 text-xl">{testimonial.total_days}</p>
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                  {/* Next Steps */}
                  <Separator />
                  <div className="text-center space-y-1.5">
                    <p className="text-xs text-gray-600">
                      {isApproved
                        ? 'You can safely close this page. No further action is required.'
                        : 'If you have any concerns, please contact the crew member directly.'}
                    </p>
                    <p className="text-xs text-gray-500">
                      This link is no longer valid and cannot be used again.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Footer */}
            <div className="mt-8 text-center">
              <p className="text-sm text-white/60">
                SeaJourney • Digital sea service testimonials
              </p>
              <p className="text-xs text-white/40 mt-1">
                www.seajourney.co.uk
              </p>
            </div>
          </div>
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
    <div className="min-h-screen bg-[#0c1721]">
      {/* Header with Logo */}
      <header className="bg-gradient-to-r from-[#0c1721] to-[#1a2d3f] border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-center">
            <Image
              src="/seajourney_logo_white.png"
              alt="SeaJourney"
              width={256}
              height={92}
              className="h-auto w-64 object-contain"
              priority
            />
          </div>
          <p className="text-center mt-6 text-white/70 text-sm">
            Sea Service Testimonial Signoff
          </p>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">

        {error && (
          <Alert variant="destructive" className="mb-6 bg-red-50 border-red-200">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Card className="bg-white border-gray-200 shadow-xl">
          <CardHeader className="border-b border-gray-200 bg-gradient-to-r from-[#0c1721] to-[#1a2d3f] text-white">
            <CardTitle className="text-white text-xl">Testimonial Details</CardTitle>
            <CardDescription className="text-white/80">
              Please review the sea service record below and approve or reject this request.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Vessel Information */}
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-gray-500 mb-3">
                <Ship className="h-4 w-4 text-[#2E8BC0]" />
                Vessel Information
              </div>
              <div className="space-y-3">
                <div>
                  <p className="text-xl font-bold text-gray-900">
                    {testimonial.vessel?.name || 'Unknown Vessel'}
                  </p>
                  {testimonial.vessel?.type && (
                    <p className="text-sm text-gray-600 mt-1">{testimonial.vessel.type}</p>
                  )}
                </div>
                {(testimonial.vessel?.imo || testimonial.vessel?.mmsi || testimonial.vessel?.flag || testimonial.vessel?.gross_tonnage) && (
                  <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm pt-2 border-t border-gray-100">
                    {testimonial.vessel?.imo && (
                      <div>
                        <span className="text-gray-500">IMO: </span>
                        <span className="font-medium text-gray-900">{testimonial.vessel.imo}</span>
                      </div>
                    )}
                    {testimonial.vessel?.mmsi && (
                      <div>
                        <span className="text-gray-500">MMSI: </span>
                        <span className="font-medium text-gray-900">{testimonial.vessel.mmsi}</span>
                      </div>
                    )}
                    {testimonial.vessel?.flag && (
                      <div>
                        <span className="text-gray-500">Flag: </span>
                        <span className="font-medium text-gray-900">{testimonial.vessel.flag}</span>
                      </div>
                    )}
                    {testimonial.vessel?.gross_tonnage && (
                      <div>
                        <span className="text-gray-500">Gross Tonnage: </span>
                        <span className="font-medium text-gray-900">{testimonial.vessel.gross_tonnage} GT</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <Separator className="bg-gray-200" />

            {/* Date Range */}
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-gray-500 mb-2">
                <Calendar className="h-4 w-4 text-[#2E8BC0]" />
                Service Period
              </div>
              <p className="text-xl font-bold text-gray-900">
                {format(startDate, 'MMMM d, yyyy')} - {format(endDate, 'MMMM d, yyyy')}
              </p>
              <p className="text-sm text-gray-600 mt-1">
                {testimonial.total_days} total days
              </p>
            </div>

            <Separator className="bg-gray-200" />

            {/* Day Breakdown - Compact Design */}
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-gray-500 mb-2">
                <Clock className="h-4 w-4 text-[#2E8BC0]" />
                Service Breakdown
              </div>
              <div className="flex flex-wrap gap-3">
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[#2E8BC0]/20 bg-[#2E8BC0]/5">
                  <span className="text-sm text-gray-600">At Sea:</span>
                  <span className="text-sm font-bold text-[#2E8BC0]">{testimonial.at_sea_days}</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[#2E8BC0]/20 bg-[#2E8BC0]/5">
                  <span className="text-sm text-gray-600">Standby:</span>
                  <span className="text-sm font-bold text-[#2E8BC0]">{testimonial.standby_days}</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[#2E8BC0]/20 bg-[#2E8BC0]/5">
                  <span className="text-sm text-gray-600">In Yard:</span>
                  <span className="text-sm font-bold text-[#2E8BC0]">{testimonial.yard_days}</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[#2E8BC0]/20 bg-[#2E8BC0]/5">
                  <span className="text-sm text-gray-600">On Leave:</span>
                  <span className="text-sm font-bold text-[#2E8BC0]">{testimonial.leave_days}</span>
                </div>
              </div>
            </div>

            <Separator />

            {/* Action Section */}
            <div className="space-y-4">
              {/* Rejection Reason Input */}
              <div className="space-y-2">
                <Label htmlFor="rejection-reason" className="text-gray-700">Rejection Reason (Required if rejecting)</Label>
                <Textarea
                  id="rejection-reason"
                  placeholder="Please provide a reason for rejection if you plan to reject this testimonial..."
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  rows={3}
                  className="resize-none border-gray-300 rounded-xl"
                />
                <p className="text-xs text-gray-500">
                  This reason will be shared with the crew member if you reject the testimonial.
                </p>
              </div>

              <Separator className="bg-gray-200" />

              <div className="flex items-center justify-center gap-4">
                <Button
                  onClick={() => handleDecision('approve')}
                  disabled={processing}
                  size="lg"
                  className="flex-1 bg-[#2E8BC0] hover:bg-[#2E8BC0]/90 text-white rounded-xl"
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
                  size="lg"
                  variant="destructive"
                  className="flex-1 rounded-xl"
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

        <div className="mt-8 text-center text-sm text-white/70">
          <p>
            This link will expire after use. If you have any questions, please contact the crew member directly.
          </p>
        </div>
      </div>
    </div>
  );
}

