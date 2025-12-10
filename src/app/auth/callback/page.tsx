'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSupabase } from '@/supabase';
import { Loader2, CheckCircle } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import LogoOnboarding from '@/components/logo-onboarding';
import { updateUserProfile } from '@/supabase/database/queries';

// Inner component that actually uses hooks like useSearchParams
function AuthCallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { supabase } = useSupabase();
  const [isProcessing, setIsProcessing] = useState(true);
  const [isEmailConfirmed, setIsEmailConfirmed] = useState(false);
  const [shouldShowConfirm, setShouldShowConfirm] = useState(false);

  useEffect(() => {
    // IMPORTANT: Check hash params IMMEDIATELY (synchronously) before any async operations
    // Supabase may clear the hash after processing, so we need to capture it first
    const hashParams = window.location.hash;
    const isEmailConfirmation =
      hashParams?.includes('type=signup') ||
      hashParams?.includes('type=email') ||
      searchParams?.get('type') === 'signup' ||
      searchParams?.get('type') === 'email';

    // Log for debugging
    console.log('[AUTH CALLBACK] Hash params:', hashParams);
    console.log('[AUTH CALLBACK] Search params:', searchParams.toString());
    console.log('[AUTH CALLBACK] Is email confirmation:', isEmailConfirmation);

    // If email confirmation detected, show confirmation UI instead of redirecting
    if (isEmailConfirmation) {
      console.log('[AUTH CALLBACK] Email confirmation detected, showing confirmation UI');
      setShouldShowConfirm(true);
      
      // Wait for Supabase to process the confirmation
      async function processEmailConfirmation() {
        try {
          // Give Supabase time to process the URL and create session
          await new Promise((resolve) => setTimeout(resolve, 1000));
          
          // Check if session was created (email was confirmed)
          const {
            data: { session },
          } = await supabase.auth.getSession();

          if (session?.user) {
            console.log('[AUTH CALLBACK] Email confirmed successfully, user:', session.user.id);
            
            // IMPORTANT: Create user record in users table now that we have a session
            // This is required because RLS policies need auth.uid() to match the user ID
            // During signup, there's no session yet, so the insert fails
            try {
              const { data: { user: authUser } } = await supabase.auth.getUser();
              if (authUser) {
                // Check if user exists in users table
                const { data: existingUser, error: checkError } = await supabase
                  .from('users')
                  .select('id')
                  .eq('id', authUser.id)
                  .maybeSingle();

                if (checkError) {
                  console.error('[AUTH CALLBACK] Error checking for existing user:', checkError);
                }

                if (!existingUser) {
                  console.log('[AUTH CALLBACK] User record not found in users table, creating it...');
                  
                  // Create user record directly (we have a session now, so RLS will allow it)
                  const { error: insertError } = await supabase
                    .from('users')
                    .insert({
                      id: authUser.id,
                      email: authUser.email || '',
                      username: authUser.user_metadata?.username || `user_${authUser.id.slice(0, 8)}`,
                      first_name: '',
                      last_name: '',
                      registration_date: new Date().toISOString(),
                      role: 'crew',
                      subscription_tier: 'free',
                      subscription_status: 'inactive',
                    });

                  if (insertError) {
                    console.error('[AUTH CALLBACK] Error creating user profile:', insertError);
                    // Try using updateUserProfile as fallback
                    try {
                      await updateUserProfile(supabase, authUser.id, {
                        email: authUser.email || '',
                        username: authUser.user_metadata?.username || `user_${authUser.id.slice(0, 8)}`,
                        subscriptionTier: 'free',
                        subscriptionStatus: 'inactive',
                      });
                      console.log('[AUTH CALLBACK] User record created via updateUserProfile');
                    } catch (fallbackError) {
                      console.error('[AUTH CALLBACK] Fallback profile creation also failed:', fallbackError);
                    }
                  } else {
                    console.log('[AUTH CALLBACK] User record created successfully');
                  }
                } else {
                  console.log('[AUTH CALLBACK] User record already exists in users table');
                }
              }
            } catch (profileError) {
              console.error('[AUTH CALLBACK] Error ensuring user profile exists:', profileError);
              // Don't fail the confirmation flow if profile creation fails
              // But log it so we can debug
            }
            
            // IMPORTANT: Sign the user out after email confirmation
            // This ensures they need to manually log in with their credentials
            // Supabase automatically logs users in when they confirm email, but we want them
            // to manually log in after confirmation for security
            try {
              console.log('[AUTH CALLBACK] Signing user out after email confirmation');
              await supabase.auth.signOut();
              console.log('[AUTH CALLBACK] User signed out successfully');
            } catch (signOutError) {
              console.error('[AUTH CALLBACK] Error signing out user:', signOutError);
              // Don't fail the flow if sign out fails, but log it
            }
            
            setIsEmailConfirmed(true);
          } else {
            console.log('[AUTH CALLBACK] Email confirmation may have already been processed');
            setIsEmailConfirmed(true); // Still show success, as email might already be confirmed
          }
        } catch (error) {
          console.error('[AUTH CALLBACK] Error processing email confirmation:', error);
          setIsEmailConfirmed(true); // Show success anyway
        } finally {
          setIsProcessing(false);
        }
      }
      
      processEmailConfirmation();
      return;
    }

    // For other auth flows, process normally
    async function handleRedirect() {
      try {
        // Give Supabase a moment to process the URL + session
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Check current session
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        console.log('[AUTH CALLBACK] Session check:', { hasSession: !!session, error });

        // For regular login flows, check if user is authenticated
        if (session && !error) {
          router.replace('/dashboard');
        } else {
          // No session or error, redirect to login
          router.replace('/login');
        }
      } catch (error) {
        console.error('Callback processing error:', error);
        router.replace('/login');
      } finally {
        setIsProcessing(false);
      }
    }

    handleRedirect();
  }, [supabase, router, searchParams]);

  // Show email confirmation UI
  if (shouldShowConfirm) {
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
              {isProcessing ? (
                <>
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 mb-4">
                    <Loader2 className="h-8 w-8 text-primary animate-spin" />
                  </div>
                  <CardTitle className="font-headline text-2xl">Confirming Email...</CardTitle>
                  <CardDescription>
                    Please wait while we verify your email address.
                  </CardDescription>
                </>
              ) : (
                <>
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20 mb-4">
                    <CheckCircle className="h-8 w-8 text-green-500" />
                  </div>
                  <CardTitle className="font-headline text-2xl">Email Confirmed!</CardTitle>
                  <CardDescription>
                    Your email address has been successfully verified.
                  </CardDescription>
                </>
              )}
            </CardHeader>
            {!isProcessing && (
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
            )}
          </Card>
        </div>
      </div>
    );
  }

  // Show loading for other auth flows
  return (
    <div className="flex min-h-screen items-center justify-center dark animated-gradient-background">
      <div className="text-center space-y-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
        <p className="text-sm text-muted-foreground">
          {isProcessing ? 'Processing authentication...' : 'Redirecting...'}
        </p>
      </div>
    </div>
  );
}

// Outer component that wraps the inner one in Suspense (fixes the error)
export default function AuthCallback() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center dark animated-gradient-background">
          <div className="text-center space-y-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
            <p className="text-sm text-muted-foreground">
              Processing authentication...
            </p>
          </div>
        </div>
      }
    >
      <AuthCallbackInner />
    </Suspense>
  );
}
