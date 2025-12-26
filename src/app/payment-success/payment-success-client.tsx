// app/payment-success/payment-success-client.tsx
'use client';

import { useEffect, useState } from 'react';
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

  useEffect(() => {
    const verifyPayment = async () => {
      if (!sessionId) {
        setError('No session ID provided');
        setIsVerifying(false);
        return;
      }

      if (!user?.id) {
        setError('User not authenticated');
        setIsVerifying(false);
        return;
      }

      try {
        setIsVerifying(true);

        const res = await fetch('/api/stripe/verify-checkout-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId }),
        });

        if (!res.ok) {
          const errorText = await res.text();
          console.error('[CLIENT] API error response:', {
            status: res.status,
            statusText: res.statusText,
            body: errorText,
          });
          throw new Error(`API error: ${res.status} ${res.statusText}`);
        }

        let result: any;
        try {
          result = await res.json();
        } catch (jsonError) {
          console.error('[CLIENT] Failed to parse JSON response:', jsonError);
          throw new Error('Invalid response from server');
        }

        console.log('[CLIENT] Verification result:', result);

        if (result.success) {
          const tier = result.tier ?? 'premium';
          const productName = result.productName;
          const alreadyUpdated = result.alreadyUpdated || result.updatedByWebhook;
          const status = result.status || 'success';

          console.log('[CLIENT] Payment verification successful:', {
            tier,
            productName,
            alreadyUpdated,
            status,
          });

          // Only update if webhook hasn't already updated it
          // If status is 'pending', the webhook is still processing, so we'll wait
          if (!alreadyUpdated && status === 'success') {
            try {
              console.log('[CLIENT] Updating user subscription:', {
                userId: user.id,
                tier,
                productName,
              });

              await updateUserProfile(supabase, user.id, {
                subscriptionStatus: 'active',
                subscriptionTier: tier,
                email: user.email,
              });

              console.log('[CLIENT] Successfully updated Supabase users table');
            } catch (supabaseError: any) {
              console.error('[CLIENT] Supabase update error:', supabaseError);
              // Don't fail if update fails - webhook might have already updated it
              // Just log the error and continue
              console.warn('[CLIENT] Update failed, but continuing:', supabaseError?.message);
            }
          } else if (alreadyUpdated) {
            console.log('[CLIENT] Subscription already updated by webhook, skipping client update');
          } else if (status === 'pending') {
            console.log('[CLIENT] Payment verified but subscription update pending, webhook processing');
          }

          setIsSuccess(true);
          const description = status === 'pending'
            ? `Your payment has been verified. Your ${productName || tier} subscription is being activated. Please refresh if needed.`
            : `Your ${productName || tier} subscription has been activated. Welcome to SeaJourney!`;
          
          toast({
            title: 'Payment Successful!',
            description,
          });

          setTimeout(() => {
            router.push('/dashboard');
          }, 3000);
        } else {
          // If verification failed but payment status suggests success, check database directly
          const paymentStatus = result.payment_status;
          const sessionStatus = result.session_status;
          
          if (paymentStatus === 'paid' || sessionStatus === 'complete') {
            console.log('[CLIENT] Verification returned false but payment appears successful, checking database...');
            
            // Check database directly to see if subscription is active
            try {
              const { data: userProfile } = await supabase
                .from('users')
                .select('subscription_status, subscription_tier')
                .eq('id', user.id)
                .single();
              
              if (userProfile && userProfile.subscription_status === 'active') {
                console.log('[CLIENT] ✅ Subscription is active in database despite verification failure');
                setIsSuccess(true);
                toast({
                  title: 'Payment Successful!',
                  description: 'Your subscription has been activated. Welcome to SeaJourney!',
                });
                setTimeout(() => {
                  router.push('/dashboard');
                }, 3000);
                return;
              }
            } catch (dbError) {
              console.error('[CLIENT] Error checking database:', dbError);
            }
          }
          
          const errorMsg = result.error || result.errorMessage || 'Payment verification failed';
          console.error('[CLIENT] Verification failed:', errorMsg);
          setError(errorMsg);
          toast({
            title: 'Verification Failed',
            description: errorMsg,
            variant: 'destructive',
          });
        }
      } catch (err: any) {
        console.error('[CLIENT] Payment verification error:', {
          message: err?.message,
          stack: err?.stack,
          name: err?.name,
          error: err,
        });
        const errorMessage = err?.message || 'An unexpected error occurred';
        setError(errorMessage);
        toast({
          title: 'Error',
          description: errorMessage,
          variant: 'destructive',
        });
      } finally {
        setIsVerifying(false);
      }
    };

    if (sessionId && user) {
      verifyPayment();
    } else if (!user) {
      const timer = setTimeout(() => {
        if (!user) {
          setError('Please log in to verify your payment');
          setIsVerifying(false);
        }
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [sessionId, user, supabase, router, toast]);

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
                Verifying your payment...
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
              Payment Verification Failed
            </CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button asChild variant="outline" className="w-full rounded-lg">
              <Link href="/offers">Back to Offers</Link>
            </Button>
            <Button asChild variant="ghost" className="w-full rounded-lg">
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
