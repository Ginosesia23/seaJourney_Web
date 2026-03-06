'use client';

import { useEffect, useState, Suspense, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { createPublicSupabaseClient } from '@/lib/supabase-public';
import { CheckCircle2, XCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { format } from 'date-fns';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import LogoOnboarding from '@/components/logo-onboarding';
import { ArrowLeft, Search } from 'lucide-react';
import Link from 'next/link';

type VerificationStatus = 'verified' | 'voided' | 'not_found';
type DocumentType = 'testimonial' | 'proof_of_service';

interface VerificationData {
  crew_name: string;
  rank: string;
  vessel_name: string;
  imo: string | null;
  start_date: string;
  end_date: string;
  total_days: number;
  sea_days: number;
  standby_days: number;
  captain_name: string;
  captain_license: string | null;
  approved_at: string;
  testimonial_code: string | null;
  document_id: string;
}

interface ProofOfServiceData {
  verification_code: string;
  vessel_name: string;
  vessel_type: string | null;
  vessel_imo: string | null;
  crew_name: string;
  crew_position: string | null;
  start_date: string;
  end_date: string;
  total_days: number;
  at_sea_days: number;
  standby_days: number;
  yard_days: number;
  leave_days: number;
  generated_by_name: string;
  generated_by_email: string | null;
  created_at: string;
}

function VerificationResultContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  // Use public client for unauthenticated verification
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const [isLoading, setIsLoading] = useState(true);
  const [status, setStatus] = useState<VerificationStatus | null>(null);
  const [documentType, setDocumentType] = useState<DocumentType | null>(null);
  const [data, setData] = useState<VerificationData | null>(null);
  const [posData, setPosData] = useState<ProofOfServiceData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let code = searchParams.get('code');
    let typeParam = searchParams.get('type');

    if (!code && typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      code = urlParams.get('code');
      typeParam = typeParam ?? urlParams.get('type');
    }

    if (code) {
      try {
        code = decodeURIComponent(code);
      } catch (e) {
        console.warn('[VERIFY] Failed to decode code parameter:', e);
      }
    }

    if (!code) {
      router.push('/verify');
      return;
    }

    const restrictToType = typeParam === 'sj' || typeParam === 'pos' ? typeParam : null;

    const verifyCode = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const userInput = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
        let codePart: string;
        if (userInput.startsWith('POS') && userInput.length >= 11) {
          codePart = userInput.slice(3, 11);
        } else if (userInput.startsWith('SJ') && userInput.length >= 10) {
          codePart = userInput.slice(2, 10);
        } else {
          codePart = userInput.substring(0, 8);
        }

        if (codePart.length < 8) {
          setStatus('not_found');
          setIsLoading(false);
          return;
        }

        const sjCode = `SJ-${codePart}`;
        const posCode = `POS-${codePart}`;

        const tryPos = async (): Promise<boolean> => {
          const res = await fetch(`/api/verify/proof-of-service?code=${encodeURIComponent(posCode)}`);
          if (!res.ok) return false;
          const json = await res.json();
          if (json.found && json.record) {
            setDocumentType('proof_of_service');
            setPosData(json.record);
            setStatus('verified');
            return true;
          }
          return false;
        };

        const tryTestimonial = async () => {
          const { data: r, error: e } = await supabase
            .from('approved_testimonials')
            .select('*')
            .eq('testimonial_code', sjCode)
            .maybeSingle();
          if (e) throw e;
          return r;
        };

        const setTestimonialData = (row: {
          crew_name: string;
          rank: string;
          vessel_name: string;
          imo: string | null;
          start_date: string;
          end_date: string;
          total_days: number;
          sea_days: number;
          standby_days: number;
          captain_name: string;
          captain_license: string | null;
          approved_at: string;
          testimonial_code: string | null;
          document_id: string;
        }) => {
          setData({
            crew_name: row.crew_name,
            rank: row.rank,
            vessel_name: row.vessel_name,
            imo: row.imo,
            start_date: row.start_date,
            end_date: row.end_date,
            total_days: row.total_days,
            sea_days: row.sea_days,
            standby_days: row.standby_days,
            captain_name: row.captain_name,
            captain_license: row.captain_license,
            approved_at: row.approved_at,
            testimonial_code: row.testimonial_code,
            document_id: row.document_id,
          });
        };

        if (restrictToType === 'pos') {
          const posFound = await tryPos();
          if (!posFound) setStatus('not_found');
          setIsLoading(false);
          return;
        }

        if (restrictToType === 'sj') {
          let recordData = await tryTestimonial();
          if (!recordData) {
            const { data: caseInsensitiveData } = await supabase.from('approved_testimonials').select('*').ilike('testimonial_code', sjCode).maybeSingle();
            recordData = caseInsensitiveData ?? undefined;
          }
          if (!recordData) {
            const { data: codeOnlyData } = await supabase.from('approved_testimonials').select('*').ilike('testimonial_code', `%${codePart}%`).maybeSingle();
            recordData = codeOnlyData ?? undefined;
          }
          if (!recordData) {
            setStatus('not_found');
            setIsLoading(false);
            return;
          }
          setDocumentType('testimonial');
          let verificationStatus: VerificationStatus = 'verified';
          const { data: orig } = await supabase.from('testimonials').select('id, status').eq('id', recordData.testimonial_id).maybeSingle();
          if (orig && orig.status !== 'approved') verificationStatus = 'voided';
          setStatus(verificationStatus);
          setTestimonialData(recordData);
          setIsLoading(false);
          return;
        }

        if (userInput.startsWith('POS') && userInput.length >= 11) {
          const posFound = await tryPos();
          if (posFound) {
            setIsLoading(false);
            return;
          }
          let recordData = await tryTestimonial();
          if (!recordData) {
            const { data: caseInsensitiveData } = await supabase.from('approved_testimonials').select('*').ilike('testimonial_code', sjCode).maybeSingle();
            if (caseInsensitiveData) {
              setDocumentType('testimonial');
              setStatus('verified');
              setTestimonialData(caseInsensitiveData);
              setIsLoading(false);
              return;
            }
            setStatus('not_found');
            setIsLoading(false);
            return;
          }
          setDocumentType('testimonial');
          let verificationStatus: VerificationStatus = 'verified';
          const { data: orig } = await supabase.from('testimonials').select('id, status').eq('id', recordData.testimonial_id).maybeSingle();
          if (orig && orig.status !== 'approved') verificationStatus = 'voided';
          setStatus(verificationStatus);
          setTestimonialData(recordData);
          setIsLoading(false);
          return;
        }

        let recordData = await tryTestimonial();

        if (!recordData) {
          const { data: caseInsensitiveData } = await supabase
            .from('approved_testimonials')
            .select('*')
            .ilike('testimonial_code', sjCode)
            .maybeSingle();
          if (caseInsensitiveData) recordData = caseInsensitiveData;
        }

        if (!recordData) {
          const { data: codeOnlyData } = await supabase
            .from('approved_testimonials')
            .select('*')
            .ilike('testimonial_code', `%${codePart}%`)
            .maybeSingle();
          if (codeOnlyData) recordData = codeOnlyData;
        }

        if (!recordData) {
          const posFound = await tryPos();
          if (posFound) {
            setIsLoading(false);
            return;
          }
          setStatus('not_found');
          setIsLoading(false);
          return;
        }

        setDocumentType('testimonial');

        // For public verification, we trust the approved_testimonials snapshot
        // This is an immutable record that was created when the testimonial was approved
        // We don't need to check the original testimonial table for public verification
        // as that would require authentication and the snapshot itself is the source of truth
        
        // Note: The approved_testimonials table is designed to be immutable - once a record
        // exists there, it represents a verified approval at the time it was created.
        // Even if the original testimonial is later deleted or changed, the snapshot remains valid.
        
        let verificationStatus: VerificationStatus = 'verified';
        
        // Only check the original testimonial if we have authentication (optional check)
        // For public verification, we skip this and trust the snapshot
        const { data: originalTestimonial, error: testimonialError } = await supabase
          .from('testimonials')
          .select('id, status')
          .eq('id', recordData.testimonial_id)
          .maybeSingle();

        // If we successfully accessed the testimonials table (user is authenticated)
        // and the testimonial doesn't exist or isn't approved, mark as voided
        if (!testimonialError && originalTestimonial) {
          if (originalTestimonial.status !== 'approved') {
            verificationStatus = 'voided';
          }
        }
        // If testimonialError exists (likely RLS blocking unauthenticated access),
        // we ignore it and trust the approved_testimonials snapshot for public verification
        // This is expected behavior for unauthenticated users

        setStatus(verificationStatus);
        setTestimonialData(recordData);
      } catch (e: any) {
        console.error('Verification failed:', e);
        setError('An error occurred while verifying the record. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };

    verifyCode();
  }, [searchParams, router, supabase]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        {/* Header */}
        <div className="border-b bg-header text-header-foreground">
          <div className="container mx-auto px-6 py-4 flex justify-center">
            <LogoOnboarding />
          </div>
        </div>

        {/* Main Content */}
        <div className="container mx-auto px-6 py-8 max-w-2xl">
          <Card className="border-2 shadow-lg">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
                <p className="text-muted-foreground">Verifying record...</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        {/* Header */}
        <div className="border-b bg-header text-header-foreground">
          <div className="container mx-auto px-6 py-4 flex justify-center">
            <LogoOnboarding />
          </div>
        </div>

        {/* Main Content */}
        <div className="container mx-auto px-6 py-8 max-w-2xl">
          <Card className="border-2 shadow-lg">
            <CardContent className="pt-6">
              <Alert variant="destructive" className="mb-6">
                <XCircle className="h-5 w-5" />
                <AlertTitle className="font-bold">Verification Failed</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
              <div className="flex gap-3">
                <Button asChild variant="default" className="flex-1">
                  <Link href="/verify">
                    <Search className="mr-2 h-4 w-4" />
                    Try Another Code
                  </Link>
                </Button>
                <Button asChild variant="outline" className="flex-1">
                  <Link href="/">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to Home
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (status === 'not_found') {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        {/* Header */}
        <div className="border-b bg-header text-header-foreground">
          <div className="container mx-auto px-4 sm:px-6 py-3 sm:py-4 flex justify-center">
            <LogoOnboarding />
          </div>
        </div>

        {/* Main Content - Centered */}
        <div className="flex-1 flex items-center justify-center px-4 py-8 sm:py-12">
          <div className="w-full max-w-md">
            <Card className="border-2 shadow-xl">
              <CardContent className="pt-6 sm:pt-8 pb-6 sm:pb-8 px-4 sm:px-6">
                <div className="flex flex-col items-center text-center space-y-4 sm:space-y-6">
                  {/* Icon */}
                  <div className="rounded-full bg-red-100 dark:bg-red-900/20 p-3 sm:p-4">
                    <XCircle className="h-10 w-10 sm:h-12 sm:w-12 text-red-600 dark:text-red-400" />
                  </div>

                  {/* Title */}
                  <div>
                    <h2 className="text-xl sm:text-2xl font-bold text-foreground mb-2">
                      Code Not Found
                    </h2>
                    <p className="text-sm sm:text-base text-muted-foreground px-2">
                      No record found for the provided verification code. Please verify the code and try again.
                    </p>
                  </div>

                  {/* Buttons */}
                  <div className="flex flex-col gap-3 w-full pt-2">
                    <Button asChild variant="default" size="lg" className="w-full text-sm sm:text-base">
                      <Link href="/verify">
                        <Search className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />
                        Try Another Code
                      </Link>
                    </Button>
                    <Button asChild variant="outline" size="lg" className="w-full text-sm sm:text-base">
                      <Link href="/">
                        <ArrowLeft className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />
                        Back to Home
                      </Link>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'voided') {
    return (
      <div className="min-h-screen bg-background">
        {/* Header */}
        <div className="border-b bg-header text-header-foreground">
          <div className="container mx-auto px-4 sm:px-6 py-3 sm:py-4 flex justify-center">
            <LogoOnboarding />
          </div>
        </div>

        {/* Main Content */}
        <div className="container mx-auto px-4 sm:px-6 py-6 sm:py-8 max-w-2xl">
          <Card className="border-2 shadow-lg">
            <CardContent className="pt-4 sm:pt-6 px-4 sm:px-6 pb-4 sm:pb-6">
              <Alert variant="destructive" className="mb-4 sm:mb-6">
                <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5" />
                <AlertTitle className="font-bold flex items-center gap-2 text-sm sm:text-base">
                  ⚠️ Voided
                </AlertTitle>
                <AlertDescription className="text-xs sm:text-sm">
                  This record has been voided. The original testimonial is no longer valid or has been removed.
                </AlertDescription>
              </Alert>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button asChild variant="default" className="flex-1 text-sm sm:text-base">
                  <Link href="/verify">
                    <Search className="mr-2 h-4 w-4" />
                    Try Another Code
                  </Link>
                </Button>
                <Button asChild variant="outline" className="flex-1 text-sm sm:text-base">
                  <Link href="/">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to Home
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (status === 'verified' && documentType === 'proof_of_service' && posData) {
    return (
      <div className="min-h-screen bg-background">
        <div className="border-b bg-header text-header-foreground">
          <div className="container mx-auto px-4 sm:px-6 py-3 sm:py-4 flex justify-center">
            <LogoOnboarding />
          </div>
        </div>
        <div className="container mx-auto px-4 sm:px-6 py-6 sm:py-8 max-w-2xl">
          <div className="space-y-4 sm:space-y-6">
            <div className="rounded-xl border-2 border-green-500 bg-green-500/10 p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-start sm:items-center gap-3 sm:gap-4 flex-1 min-w-0">
                  <CheckCircle2 className="h-6 w-6 sm:h-8 sm:w-8 text-green-500 flex-shrink-0 mt-1 sm:mt-0" />
                  <div className="flex-1 min-w-0">
                    <h1 className="text-xl sm:text-2xl font-bold text-green-500">Verified</h1>
                    <p className="text-xs sm:text-sm text-muted-foreground mt-1 break-words">
                      <code className="font-mono font-semibold break-all">{posData.verification_code}</code> matches an official Proof of Service record.
                    </p>
                  </div>
                </div>
                <Badge variant="outline" className="bg-green-500/20 text-green-500 border-green-500 text-sm sm:text-base px-3 sm:px-4 py-1.5 sm:py-2 flex-shrink-0">
                  <CheckCircle2 className="h-3 w-3 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
                  Verified
                </Badge>
              </div>
            </div>

            <Card className="border-2 shadow-lg">
              <CardHeader className="bg-muted/50 border-b px-4 sm:px-6 py-3 sm:py-4">
                <CardTitle className="text-lg sm:text-xl font-bold text-primary">Proof of Service</CardTitle>
              </CardHeader>
              <CardContent className="pt-4 sm:pt-6 px-4 sm:px-6 pb-4 sm:pb-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                  <div>
                    <p className="text-xs sm:text-sm font-semibold text-muted-foreground mb-1.5 sm:mb-2">Crew member</p>
                    <p className="text-base sm:text-lg font-medium break-words">{posData.crew_name}</p>
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm font-semibold text-muted-foreground mb-1.5 sm:mb-2">Position</p>
                    <p className="text-base sm:text-lg font-medium break-words">{posData.crew_position ?? '—'}</p>
                  </div>
                </div>
                <Separator className="my-4" />
                <div>
                  <p className="text-xs sm:text-sm font-semibold text-muted-foreground mb-1.5 sm:mb-2">Vessel</p>
                  <p className="text-base sm:text-lg font-medium break-words">{posData.vessel_name}{posData.vessel_type ? ` (${posData.vessel_type})` : ''}</p>
                  {posData.vessel_imo && <p className="text-sm text-muted-foreground mt-1">IMO / Official No.: {posData.vessel_imo}</p>}
                </div>
                <Separator className="my-4" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                  <div>
                    <p className="text-xs sm:text-sm font-semibold text-muted-foreground mb-1.5 sm:mb-2">Service period</p>
                    <p className="text-base sm:text-lg font-medium">{format(new Date(posData.start_date), 'dd MMM yyyy')} – {format(new Date(posData.end_date), 'dd MMM yyyy')}</p>
                  </div>
                </div>
                <Separator className="my-4" />
                <div>
                  <p className="text-xs sm:text-sm font-semibold text-muted-foreground mb-2">Sea time breakdown (days)</p>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm">
                    <div><span className="text-muted-foreground block">Total</span><span className="font-semibold">{posData.total_days}</span></div>
                    <div><span className="text-muted-foreground block">At sea</span><span className="font-semibold">{posData.at_sea_days}</span></div>
                    <div><span className="text-muted-foreground block">Standby</span><span className="font-semibold">{posData.standby_days}</span></div>
                    <div><span className="text-muted-foreground block">Yard</span><span className="font-semibold">{posData.yard_days}</span></div>
                    <div><span className="text-muted-foreground block">At anchor</span><span className="font-semibold">{posData.leave_days}</span></div>
                  </div>
                </div>
                <Separator className="my-4" />
                <div>
                  <p className="text-xs sm:text-sm font-semibold text-muted-foreground mb-1.5 sm:mb-2">Generated by</p>
                  <p className="text-base font-medium break-words">{posData.generated_by_name}{posData.generated_by_email ? ` (${posData.generated_by_email})` : ''}</p>
                  <p className="text-xs text-muted-foreground mt-1">{format(new Date(posData.created_at), 'dd MMM yyyy')}</p>
                </div>
                <div className="mt-4 pt-4 border-t">
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Verification code</p>
                  <code className="block bg-muted px-3 py-2 rounded-lg text-sm font-mono font-semibold break-all">{posData.verification_code}</code>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-center pt-2 sm:pt-4">
              <Button asChild size="lg" variant="default" className="w-full sm:w-auto min-w-[200px]">
                <Link href="/verify">
                  <Search className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />
                  Verify New Record
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'verified' && data) {
    return (
      <div className="min-h-screen bg-background">
        {/* Header */}
        <div className="border-b bg-header text-header-foreground">
          <div className="container mx-auto px-4 sm:px-6 py-3 sm:py-4 flex justify-center">
            <LogoOnboarding />
          </div>
        </div>

        {/* Main Content */}
        <div className="container mx-auto px-4 sm:px-6 py-6 sm:py-8 max-w-7xl">
          <div className="space-y-4 sm:space-y-6">
            {/* Status Header */}
            <div className="rounded-xl border-2 border-green-500 bg-green-500/10 p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-start sm:items-center gap-3 sm:gap-4 flex-1 min-w-0">
                  <CheckCircle2 className="h-6 w-6 sm:h-8 sm:w-8 text-green-500 flex-shrink-0 mt-1 sm:mt-0" />
                  <div className="flex-1 min-w-0">
                    <h1 className="text-xl sm:text-2xl font-bold text-green-500">Verified</h1>
                    <p className="text-xs sm:text-sm text-muted-foreground mt-1 break-words">
                      <code className="font-mono font-semibold break-all">{data.testimonial_code}</code> matches an official record approved by {data.captain_name}
                    </p>
                  </div>
                </div>
                <Badge variant="outline" className="bg-green-500/20 text-green-500 border-green-500 text-sm sm:text-base px-3 sm:px-4 py-1.5 sm:py-2 flex-shrink-0">
                  <CheckCircle2 className="h-3 w-3 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
                  Verified
                </Badge>
              </div>
            </div>

            {/* Part 1 - Seafarer's Details */}
            <Card className="border-2 shadow-lg">
              <CardHeader className="bg-muted/50 border-b px-4 sm:px-6 py-3 sm:py-4">
                <CardTitle className="text-lg sm:text-xl font-bold text-primary">PART 1 – SEAFARER'S DETAILS</CardTitle>
              </CardHeader>
              <CardContent className="pt-4 sm:pt-6 px-4 sm:px-6 pb-4 sm:pb-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                  <div>
                    <p className="text-xs sm:text-sm font-semibold text-muted-foreground mb-1.5 sm:mb-2">Name</p>
                    <p className="text-base sm:text-lg font-medium break-words">{data.crew_name}</p>
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm font-semibold text-muted-foreground mb-1.5 sm:mb-2">Position / Rank</p>
                    <p className="text-base sm:text-lg font-medium break-words">{data.rank}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Part 2 - Service */}
            <Card className="border-2 shadow-lg">
              <CardHeader className="bg-muted/50 border-b px-4 sm:px-6 py-3 sm:py-4">
                <CardTitle className="text-lg sm:text-xl font-bold text-primary">PART 2 – SERVICE</CardTitle>
              </CardHeader>
              <CardContent className="pt-4 sm:pt-6 px-4 sm:px-6 pb-4 sm:pb-6">
                <div className="space-y-6 sm:space-y-8">
                  {/* Vessel Information */}
                  <div>
                    <h4 className="text-sm sm:text-base font-bold text-primary mb-3 sm:mb-4">ON BOARD:</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                      <div>
                        <p className="text-xs sm:text-sm font-semibold text-muted-foreground mb-1.5 sm:mb-2">Vessel Name</p>
                        <p className="text-base sm:text-lg font-medium break-words">{data.vessel_name}</p>
                      </div>
                      {data.imo && (
                        <div>
                          <p className="text-xs sm:text-sm font-semibold text-muted-foreground mb-1.5 sm:mb-2">IMO Number</p>
                          <p className="text-base sm:text-lg font-medium break-words">{data.imo}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <Separator />

                  {/* Service Dates */}
                  <div>
                    <h4 className="text-sm sm:text-base font-bold text-primary mb-3 sm:mb-4">SERVICE DATES:</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                      <div>
                        <p className="text-xs sm:text-sm font-semibold text-muted-foreground mb-1.5 sm:mb-2">From (Onboard Service)</p>
                        <p className="text-base sm:text-lg font-medium">{format(new Date(data.start_date), 'dd MMMM yyyy')}</p>
                      </div>
                      <div>
                        <p className="text-xs sm:text-sm font-semibold text-muted-foreground mb-1.5 sm:mb-2">Until</p>
                        <p className="text-base sm:text-lg font-medium">{format(new Date(data.end_date), 'dd MMMM yyyy')}</p>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Service Breakdown */}
                  <div>
                    <h4 className="text-sm sm:text-base font-bold text-primary mb-3 sm:mb-4">SERVICE BREAKDOWN (DAYS):</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
                      <div>
                        <p className="text-xs sm:text-sm font-semibold text-muted-foreground mb-1.5 sm:mb-2">Total Days</p>
                        <p className="text-xl sm:text-2xl font-bold">{data.total_days} days</p>
                      </div>
                      <div>
                        <p className="text-xs sm:text-sm font-semibold text-muted-foreground mb-1.5 sm:mb-2">Sea Days</p>
                        <p className="text-xl sm:text-2xl font-bold text-blue-600 dark:text-blue-400">{data.sea_days} days</p>
                      </div>
                      <div>
                        <p className="text-xs sm:text-sm font-semibold text-muted-foreground mb-1.5 sm:mb-2">Standby Days</p>
                        <p className="text-xl sm:text-2xl font-bold text-purple-600 dark:text-purple-400">{data.standby_days} days</p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Part 3 - Declaration by Master */}
            <Card className="border-2 shadow-lg">
              <CardHeader className="bg-muted/50 border-b px-4 sm:px-6 py-3 sm:py-4">
                <CardTitle className="text-lg sm:text-xl font-bold text-primary">PART 3 – DECLARATION BY MASTER</CardTitle>
              </CardHeader>
              <CardContent className="pt-4 sm:pt-6 px-4 sm:px-6 pb-4 sm:pb-6">
                <div className="space-y-4 sm:space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                    <div>
                      <p className="text-xs sm:text-sm font-semibold text-muted-foreground mb-1.5 sm:mb-2">Captain Name</p>
                      <p className="text-base sm:text-lg font-medium break-words">{data.captain_name}</p>
                    </div>
                    {data.captain_license && (
                      <div>
                        <p className="text-xs sm:text-sm font-semibold text-muted-foreground mb-1.5 sm:mb-2">License / Certification</p>
                        <p className="text-base sm:text-lg font-medium break-words">{data.captain_license}</p>
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm font-semibold text-muted-foreground mb-1.5 sm:mb-2">Approved Date</p>
                    <p className="text-base sm:text-lg font-medium">{format(new Date(data.approved_at), 'dd MMMM yyyy \'at\' HH:mm')}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Document Verification */}
            <Card className="border-2 border-primary/20 bg-primary/5 shadow-lg">
              <CardHeader className="bg-primary/10 border-b border-primary/20 px-4 sm:px-6 py-3 sm:py-4">
                <CardTitle className="text-lg sm:text-xl font-bold text-primary">DOCUMENT VERIFICATION</CardTitle>
              </CardHeader>
              <CardContent className="pt-4 sm:pt-6 px-4 sm:px-6 pb-4 sm:pb-6">
                <div className="space-y-4 sm:space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                    <div>
                      <p className="text-xs sm:text-sm font-semibold text-muted-foreground mb-1.5 sm:mb-2">Testimonial Code</p>
                      <code className="block bg-background border-2 border-primary/20 px-3 sm:px-4 py-2 sm:py-3 rounded-lg text-base sm:text-lg font-mono font-semibold text-primary break-all">
                        {data.testimonial_code}
                      </code>
                    </div>
                    <div>
                      <p className="text-xs sm:text-sm font-semibold text-muted-foreground mb-1.5 sm:mb-2">Document ID</p>
                      <code className="block bg-background border-2 border-primary/20 px-3 sm:px-4 py-2 sm:py-3 rounded-lg text-xs sm:text-sm font-mono text-muted-foreground break-all">
                        {data.document_id}
                      </code>
                    </div>
                  </div>
                  <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 p-4 sm:p-6">
                    <p className="text-sm sm:text-base text-blue-900 dark:text-blue-100">
                      <strong>Verification Note:</strong> This record matches the official testimonial document. 
                      Officials can cross-reference the code above with the code in the PDF footer to confirm authenticity.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Verify New Record Button */}
            <div className="flex justify-center pt-2 sm:pt-4">
              <Button asChild size="lg" variant="default" className="w-full sm:w-auto min-w-[200px]">
                <Link href="/verify">
                  <Search className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />
                  Verify New Record
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

export default function VerificationResultPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background">
        <div className="border-b bg-header text-header-foreground">
          <div className="container mx-auto px-4 sm:px-6 py-3 sm:py-4 flex justify-center">
            <LogoOnboarding />
          </div>
        </div>
        <div className="container mx-auto px-4 sm:px-6 py-6 sm:py-8 max-w-2xl">
          <Card className="border-2 shadow-lg">
            <CardContent className="pt-4 sm:pt-6 px-4 sm:px-6 pb-4 sm:pb-6">
              <div className="flex flex-col items-center justify-center py-8 sm:py-12">
                <Loader2 className="h-6 w-6 sm:h-8 sm:w-8 animate-spin text-primary mb-3 sm:mb-4" />
                <p className="text-sm sm:text-base text-muted-foreground">Loading...</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    }>
      <VerificationResultContent />
    </Suspense>
  );
}

