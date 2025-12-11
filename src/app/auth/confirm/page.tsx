'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle, Loader2 } from 'lucide-react';
import LogoOnboarding from '@/components/logo-onboarding';

function EmailConfirmPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isValid, setIsValid] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    // Check if the request came from a valid email confirmation link
    // Valid confirmation links will have either:
    // 1. Hash params with access_token (from Supabase email link)
    // 2. Query params like token, type, or confirmed=true
    // 3. A referrer from an email confirmation process
    
    const hashParams = typeof window !== 'undefined' ? window.location.hash : '';
    const hasHashToken = hashParams && (
      hashParams.includes('access_token') ||
      hashParams.includes('type=signup') ||
      hashParams.includes('type=email') ||
      hashParams.includes('type=recovery')
    );
    
    const hasQueryParams = searchParams?.get('token') ||
                          searchParams?.get('type') ||
                          searchParams?.get('confirmed') === 'true';
    
    // Check if coming from a valid email confirmation flow
    const isValidConfirmation = hasHashToken || hasQueryParams;
    
    console.log('[EMAIL CONFIRM] Validation check:', {
      hasHashToken: !!hasHashToken,
      hasQueryParams: !!hasQueryParams,
      isValidConfirmation,
      hashParams: hashParams ? 'present' : 'missing',
      searchParams: searchParams?.toString() || 'none',
    });
    
    if (isValidConfirmation) {
      setIsValid(true);
      setIsChecking(false);
    } else {
      // Invalid access - redirect to login after a brief moment
      console.log('[EMAIL CONFIRM] Invalid access attempt - redirecting to login');
      setIsChecking(false);
      setTimeout(() => {
        router.replace('/login?error=invalid_confirmation_link');
      }, 2000);
    }
  }, [searchParams, router]);

  // Show loading while checking
  if (isChecking) {
    return (
      <div className="dark animated-gradient-background flex min-h-screen flex-col items-center justify-center px-4">
        <div className="mb-8">
          <LogoOnboarding />
        </div>
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-white" />
          <p className="text-sm text-white/80">Verifying confirmation...</p>
        </div>
      </div>
    );
  }

  // Show error if invalid access
  if (!isValid) {
    return (
      <div className="dark animated-gradient-background flex min-h-screen flex-col items-center justify-center px-4">
        <div className="mb-8">
          <LogoOnboarding />
        </div>
        <div className="relative w-full max-w-md p-1 border border-primary/20 rounded-xl bg-black/20 backdrop-blur-sm">
          <Card className="w-full border-none bg-transparent text-card-foreground shadow-none rounded-xl">
            <CardHeader className="text-center">
              <CardTitle className="font-headline text-2xl text-white">Invalid Access</CardTitle>
              <CardDescription className="text-white/60">
                This page can only be accessed via a valid email confirmation link.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground text-center text-white/80">
                Redirecting you to the login page...
              </p>
              <Button asChild className="w-full rounded-xl" size="lg">
                <Link href="/login">Go to Login</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Show success confirmation (only if valid)
  return (
    <div className="dark animated-gradient-background flex min-h-screen flex-col items-center justify-center px-4">
      <div className="mb-8">
        <LogoOnboarding />
      </div>
      <div className="relative w-full max-w-md p-1 border border-primary/20 rounded-xl bg-black/20 backdrop-blur-sm">
        <div className="absolute -top-px -left-px h-4 w-4 border-t-2 border-l-2 border-accent rounded-tl-xl"></div>
        <div className="absolute -top-px -right-px h-4 w-4 border-t-2 border-r-2 border-accent rounded-tr-xl"></div>
        <div className="absolute -bottom-px -left-px h-4 w-4 border-b-2 border-l-2 border-accent rounded-bl-xl"></div>
        <div className="absolute -bottom-px -right-px h-4 w-4 border-b-2 border-r-2 border-accent rounded-br-xl"></div>
        
        <Card className="w-full border-none bg-transparent text-card-foreground shadow-none rounded-xl">
          <CardHeader className="text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20 mb-4">
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
            <CardTitle className="font-headline text-2xl">Email Confirmed!</CardTitle>
            <CardDescription>
              Your email address has been successfully verified.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              You can now log in to your SeaJourney account and start tracking your maritime career.
            </p>
            <Button asChild className="w-full rounded-xl" size="lg">
              <Link href="/login">Go to Login</Link>
            </Button>
            <p className="text-xs text-muted-foreground text-center mt-4">
              Having trouble?{' '}
              <Link href="/login" className="text-primary hover:underline font-medium">
                Contact Support
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function EmailConfirmPage() {
  return (
    <Suspense
      fallback={
        <div className="dark animated-gradient-background flex min-h-screen flex-col items-center justify-center px-4">
          <div className="mb-8">
            <LogoOnboarding />
          </div>
          <Loader2 className="h-8 w-8 animate-spin text-white" />
        </div>
      }
    >
      <EmailConfirmPageInner />
    </Suspense>
  );
}
