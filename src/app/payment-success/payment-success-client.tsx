// app/payment-success/payment-success-client.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSupabase, useUser } from '@/supabase';
import { updateUserProfile } from '@/supabase/database/queries';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle, Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import LogoOnboarding from '@/components/logo-onboarding';
import Link from 'next/link';

type VerifyResponse =
  | {
      success: true;
      status: 'success' | 'processing' | 'pending';
      tier?: string;
      productName?: string;
      alreadyUpdated?: boolean;
      updatedByWebhook?: boolean;
      payment_status?: string | null;
      session_status?: string | null;
      warning?: string;
    }
  | {
      success: false;
      status?: 'error';
      error?: string;
      errorMessage?: string;
      payment_status?: string | null;
      session_status?: string | null;
    };

export default function PaymentSuccessClient() {
  const [isVerifying, setIsVerifying] = useState(true);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const router = useRouter();
  const searchParams = useSearchParams();
  const { supabase } = useSupabase();
  const { user } = useUser();
  const { toast } = useToast();

  const sessionId = searchParams.get('session_id');

  // Prevent double-running in React Strict Mode / rerenders
  const startedRef = useRef(false);

  useEffect(() => {
    // If we already succeeded or already started, do nothing
    if (isSuccess || startedRef.current) return;

    const verifyWithPolling = async () => {
      // Don’t fail instantly. Wait a bit for sessionId/user hydration.
      const START_TIMEOUT_MS = 8000; // wait up to 8s for sessionId + user
      const VERIFY_TIMEOUT_MS = 30000; // total time to poll verify/db
      const POLL_INTERVAL_MS = 1200;

      const startWait = Date.now();

      setIsVerifying(true);
      setError(null);

      // Step 1: wait for sessionId and user to exist
      while (Date.now() - startWait < START_TIMEOUT_MS) {
        if (sessionId && user?.id) break;
        await new Promise((r) => setTimeout(r, 150));
      }

      if (!sessionId) {
        setIsVerifying(false);
        setError('Missing session_id in return URL from Stripe.');
        toast({
          title: 'Error',
          description: 'Missing session_id in return URL from Stripe.',
          variant: 'destructive',
        });
        return;
      }

      if (!user?.id) {
        setIsVerifying(false);
        setError('Please log in to verify your payment.');
        toast({
          title: 'Login required',
          description: 'Please log in to verify your payment.',
          variant: 'destructive',
        });
        return;
      }

      // Mark started only after we have the required inputs
      startedRef.current = true;

      // Step 2: poll verification endpoint (and DB fallback)
      const verifyStart = Date.now();
      let lastProcessingToastAt = 0;

      while (Date.now() - verifyStart < VERIFY_TIMEOUT_MS) {
        try {
          const res = await fetch(
            `/api/stripe/verify-checkout-session?session_id=${encodeURIComponent(
              sessionId,
            )}`,
            {
              method: 'GET',
              cache: 'no-store',
            },
          );

          let result: VerifyResponse | null = null;
          try {
            result = (await res.json()) as VerifyResponse;
          } catch {
            // ignore parse errors, treat as transient
            result = null;
          }

          console.log('[CLIENT] Verification response:', {
            ok: res.ok,
            status: res.status,
            result,
          });

          // If Stripe verify says success
          if (result && result.success) {
            const status = result.status || 'success';
            const tier = result.tier ?? 'premium';
            const productName = result.productName;
            const alreadyUpdated =
              !!result.alreadyUpdated || !!result.updatedByWebhook;

            // If verified + DB is ready (success), finish
            if (status === 'success') {
              // Optional client-side update (only if webhook didn’t already do it)
              if (!alreadyUpdated) {
                try {
                  await updateUserProfile(supabase, user.id, {
                    subscriptionStatus: 'active',
                    subscriptionTier: tier,
                    email: user.email,
                  });
                } catch (e: any) {
                  console.warn(
                    '[CLIENT] Client update failed (continuing):',
                    e?.message,
                  );
                }
              }

              setIsSuccess(true);
              setIsVerifying(false);

              toast({
                title: 'Payment Successful!',
                description: `Your ${
                  productName || tier
                } subscription has been activated. Welcome to SeaJourney!`,
              });

              setTimeout(() => {
                router.push('/dashboard');
              }, 1500);

              return;
            }

            // Otherwise, "processing/pending" is normal → keep polling
            const now = Date.now();
            if (now - lastProcessingToastAt > 5000) {
              lastProcessingToastAt = now;
              toast({
                title: 'Finalising your subscription…',
                description:
                  result.warning ||
                  `We’ve confirmed payment. Activating your ${
                    productName || tier
                  } plan…`,
              });
            }

            await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
            continue;
          }

          // If verify endpoint isn't ok or returns failure, do a DB check.
          // This handles webhook timing + any transient API failures.
          try {
            const { data: userProfile, error: dbErr } = await supabase
              .from('users')
              .select('subscription_status, subscription_tier')
              .eq('id', user.id)
              .maybeSingle();

            if (!dbErr && userProfile?.subscription_status === 'active') {
              setIsSuccess(true);
              setIsVerifying(false);

              toast({
                title: 'Payment Successful!',
                description:
                  'Your subscription is active. Redirecting to your dashboard…',
              });

              setTimeout(() => {
                router.push('/dashboard');
              }, 1500);

              return;
            }
          } catch (dbError) {
            console.warn('[CLIENT] DB check failed (continuing):', dbError);
          }

          // Not active yet → keep polling quietly
          await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        } catch (err) {
          console.warn('[CLIENT] Verification request failed (retrying):', err);
          await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        }
      }

      // Step 3: timeout → show a helpful message, not a scary “failed”
      setIsVerifying(false);
      setError(
        'We confirmed your checkout, but activation is taking longer than usual. Please refresh, or go to the dashboard — it should unlock shortly.',
      );
      toast({
        title: 'Still processing',
        description:
          'Activation is taking longer than usual. Try refreshing, or go to the dashboard.',
        variant: 'destructive',
      });
    };

    verifyWithPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, user?.id]);

  if (isVerifying) {
    return (
      <div className="dark animated-gradient-background flex min-h-screen flex-col items-center justify-center px-4">
        <div className="mb-8">
          <LogoOnboarding />
        </div>
        <Card className="w-full max-w-md border-primary/20 bg-black/20 backdrop-blur-sm">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center space-y-4">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <p className="text-center text-muted-foreground">
                Finalising your subscription…
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dark animated-gradient-background flex min-h-screen flex-col items-center justify-center px-4">
        <div className="mb-8">
          <LogoOnboarding />
        </div>
        <Card className="w-full max-w-md border-destructive/50 bg-black/20 backdrop-blur-sm">
          <CardHeader className="text-center">
            <CardTitle className="font-headline text-2xl text-destructive">
              Subscription Still Processing
            </CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button asChild variant="outline" className="w-full rounded-lg">
              <Link href="/offers">Back to Offers</Link>
            </Button>
            <Button asChild className="w-full rounded-lg">
              <Link href="/dashboard">Go to Dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="dark animated-gradient-background flex min-h-screen flex-col items-center justify-center px-4">
        <div className="mb-8">
          <LogoOnboarding />
        </div>
        <div className="relative w-full max-w-md p-1 border border-primary/20 rounded-xl bg-black/20 backdrop-blur-sm">
          <div className="absolute -top-px -left-px h-4 w-4 border-t-2 border-l-2 border-accent rounded-tl-xl" />
          <div className="absolute -top-px -right-px h-4 w-4 border-t-2 border-r-2 border-accent rounded-tr-xl" />
          <div className="absolute -bottom-px -left-px h-4 w-4 border-b-2 border-l-2 border-accent rounded-bl-xl" />
          <div className="absolute -bottom-px -right-px h-4 w-4 border-b-2 border-r-2 border-accent rounded-br-xl" />

          <Card className="w-full border-none bg-transparent text-card-foreground shadow-none rounded-xl">
            <CardHeader className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-500/20 mb-4">
                <CheckCircle className="h-6 w-6 text-green-500" />
              </div>
              <CardTitle className="font-headline text-2xl">
                Payment Successful!
              </CardTitle>
              <CardDescription>
                Your subscription has been activated. You now have full access
                to SeaJourney.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-center gap-2 text-primary">
                <Sparkles className="h-5 w-5" />
                <p className="font-semibold">Welcome to SeaJourney Premium!</p>
              </div>
              <p className="text-sm text-center text-muted-foreground">
                Redirecting you to your dashboard in a moment...
              </p>
              <Button asChild className="w-full rounded-lg">
                <Link href="/dashboard">Go to Dashboard Now</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return null;
}
