'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useSupabase } from '@/supabase';
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

function VerificationResultContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { supabase } = useSupabase();
  const [isLoading, setIsLoading] = useState(true);
  const [status, setStatus] = useState<VerificationStatus | null>(null);
  const [data, setData] = useState<VerificationData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Try multiple methods to get the code parameter (mobile browsers sometimes have issues with useSearchParams)
    let code = searchParams.get('code');
    
    // Fallback: try reading directly from window.location if useSearchParams didn't work
    if (!code && typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      code = urlParams.get('code');
    }
    
    // Decode the code in case it was double-encoded
    if (code) {
      try {
        code = decodeURIComponent(code);
      } catch (e) {
        // If decoding fails, use the original code
        console.warn('[VERIFY] Failed to decode code parameter:', e);
      }
    }

    console.log('[VERIFY] Code from searchParams:', searchParams.get('code'));
    console.log('[VERIFY] Code from window.location:', typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('code') : 'N/A');
    console.log('[VERIFY] Final code used:', code);

    if (!code) {
      console.error('[VERIFY] No code parameter found, redirecting to verify page');
      router.push('/verify');
      return;
    }

    const verifyCode = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Format the input: remove all non-alphanumeric characters, then add SJ- prefix
        const userInput = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
        
        console.log('[VERIFY] User input after cleaning:', userInput);
        console.log('[VERIFY] User input length:', userInput.length);
        
        if (userInput.length < 8) {
          console.error('[VERIFY] Code is too short:', userInput.length);
          setStatus('not_found');
          setIsLoading(false);
          return;
        }
        
        const codeForDatabase = `SJ-${userInput.substring(0, 4)}${userInput.substring(4, 8)}`; // SJ-982F8484 format
        
        console.log('[VERIFY] Code for database lookup:', codeForDatabase);

        // Look up by testimonial_code only
        let { data: recordData, error: fetchError } = await supabase
          .from('approved_testimonials')
          .select('*')
          .eq('testimonial_code', codeForDatabase)
          .maybeSingle();

        console.log('[VERIFY] Database query result:', { recordData: !!recordData, error: fetchError });

        if (fetchError) {
          console.error('[VERIFY] Error fetching record:', fetchError);
          setError('An error occurred while verifying the record. Please try again.');
          setIsLoading(false);
          return;
        }

        if (!recordData) {
          console.log('[VERIFY] No exact match found, trying case-insensitive search');
          // Try case-insensitive search as fallback
          const { data: caseInsensitiveData } = await supabase
            .from('approved_testimonials')
            .select('*')
            .ilike('testimonial_code', codeForDatabase)
            .maybeSingle();

          console.log('[VERIFY] Case-insensitive query result:', { recordData: !!caseInsensitiveData });

          if (caseInsensitiveData) {
            recordData = caseInsensitiveData;
          } else {
            // Try searching with just the 8-character code (without SJ- prefix) as another fallback
            console.log('[VERIFY] Trying search without SJ- prefix');
            const { data: codeOnlyData } = await supabase
              .from('approved_testimonials')
              .select('*')
              .ilike('testimonial_code', `%${userInput}%`)
              .maybeSingle();

            console.log('[VERIFY] Code-only search result:', { recordData: !!codeOnlyData });

            if (codeOnlyData) {
              recordData = codeOnlyData;
            } else {
              console.log('[VERIFY] No record found for code:', codeForDatabase);
              setStatus('not_found');
              setIsLoading(false);
              return;
            }
          }
        }

        // Check if the original testimonial still exists and is approved
        const { data: originalTestimonial, error: testimonialError } = await supabase
          .from('testimonials')
          .select('id, status')
          .eq('id', recordData.testimonial_id)
          .maybeSingle();

        let verificationStatus: VerificationStatus = 'verified';

        if (testimonialError || !originalTestimonial) {
          verificationStatus = 'voided';
        } else if (originalTestimonial.status !== 'approved') {
          verificationStatus = 'voided';
        }

        setStatus(verificationStatus);
        setData({
          crew_name: recordData.crew_name,
          rank: recordData.rank,
          vessel_name: recordData.vessel_name,
          imo: recordData.imo,
          start_date: recordData.start_date,
          end_date: recordData.end_date,
          total_days: recordData.total_days,
          sea_days: recordData.sea_days,
          standby_days: recordData.standby_days,
          captain_name: recordData.captain_name,
          captain_license: recordData.captain_license,
          approved_at: recordData.approved_at,
          testimonial_code: recordData.testimonial_code,
          document_id: recordData.document_id,
        });
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
        <div className="border-b bg-muted/30">
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
        <div className="border-b bg-muted/30">
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
        <div className="border-b bg-muted/30">
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
        <div className="border-b bg-muted/30">
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

  if (status === 'verified' && data) {
    return (
      <div className="min-h-screen bg-background">
        {/* Header */}
        <div className="border-b bg-muted/30">
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
        <div className="border-b bg-muted/30">
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

