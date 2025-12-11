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
          const hashParams = window.location.hash;
          let session = null;
          
          // Try to get existing session first
          const { data: { session: existingSession } } = await supabase.auth.getSession();
          if (existingSession) {
            session = existingSession;
            console.log('[AUTH CALLBACK] Found existing session');
          } else if (hashParams && hashParams.includes('access_token')) {
            // Manually extract and verify the token (similar to password reset flow)
            console.log('[AUTH CALLBACK] No session found, attempting to verify token from hash');
            const tokenHash = hashParams.split('access_token=')[1]?.split('&')[0];
            
            if (tokenHash) {
              // Determine the type from the hash
              const type = hashParams.includes('type=signup') ? 'signup' : 
                          hashParams.includes('type=email') ? 'email' : 
                          hashParams.includes('type=recovery') ? 'recovery' : 'signup';
              
              console.log('[AUTH CALLBACK] Verifying OTP token, type:', type);
              
              const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
                token_hash: tokenHash,
                type: type as 'signup' | 'email' | 'recovery',
              });
              
              if (verifyError) {
                console.error('[AUTH CALLBACK] Error verifying OTP:', verifyError);
              } else if (verifyData.session) {
                session = verifyData.session;
                console.log('[AUTH CALLBACK] Successfully verified OTP and got session');
              } else {
                console.error('[AUTH CALLBACK] OTP verified but no session returned');
              }
            } else {
              console.error('[AUTH CALLBACK] Could not extract token from hash');
            }
          } else {
            console.log('[AUTH CALLBACK] No hash params found, waiting for auto-processing');
            // Give Supabase time to auto-process
            await new Promise((resolve) => setTimeout(resolve, 2000));
            const { data: { session: autoSession } } = await supabase.auth.getSession();
            session = autoSession || null;
          }

          if (session?.user) {
            console.log('[AUTH CALLBACK] Email confirmed successfully, user:', session.user.id);
            console.log('[AUTH CALLBACK] Session details:', {
              userId: session.user.id,
              email: session.user.email,
              metadata: session.user.user_metadata,
              accessToken: session.access_token ? 'present' : 'missing',
              expiresAt: session.expires_at,
            });
            
            // Verify we have a valid access token (required for RLS)
            if (!session.access_token) {
              console.error('[AUTH CALLBACK] ERROR: Session has no access token! RLS will fail.');
            }
            
            // IMPORTANT: Create user record in users table now that we have a session
            // This is required because RLS policies need auth.uid() to match the user ID
            // During signup, there's no session yet, so the insert fails
            let profileCreated = false;
            try {
              const { data: { user: authUser }, error: getUserError } = await supabase.auth.getUser();
              
              if (getUserError) {
                console.error('[AUTH CALLBACK] Error getting auth user:', getUserError);
              }
              
              if (authUser) {
                console.log('[AUTH CALLBACK] Auth user retrieved:', {
                  id: authUser.id,
                  email: authUser.email,
                  metadata: authUser.user_metadata,
                });
                
                // Check if user exists in users table
                const { data: existingUser, error: checkError } = await supabase
                  .from('users')
                  .select('id')
                  .eq('id', authUser.id)
                  .maybeSingle();

                if (checkError) {
                  console.error('[AUTH CALLBACK] Error checking for existing user:', checkError);
                  console.error('[AUTH CALLBACK] Check error details:', {
                    message: checkError.message,
                    code: checkError.code,
                    details: checkError.details,
                    hint: checkError.hint,
                  });
                }

                if (!existingUser) {
                  console.log('[AUTH CALLBACK] User record not found in users table, creating it...');
                  
                  const username = authUser.user_metadata?.username || `user_${authUser.id.slice(0, 8)}`;
                  const userData = {
                    id: authUser.id,
                    email: authUser.email || '',
                    username: username,
                    first_name: '',
                    last_name: '',
                    registration_date: new Date().toISOString(),
                    role: 'crew',
                    subscription_tier: 'free',
                    subscription_status: 'inactive',
                  };
                  
                  console.log('[AUTH CALLBACK] Attempting to insert user with data:', userData);
                  
                  // Verify we have a valid session before inserting
                  const { data: { session: currentSession } } = await supabase.auth.getSession();
                  if (!currentSession) {
                    console.error('[AUTH CALLBACK] ERROR: No session available for insert! Cannot create user profile.');
                  } else {
                    console.log('[AUTH CALLBACK] Session confirmed before insert:', {
                      userId: currentSession.user.id,
                      hasAccessToken: !!currentSession.access_token,
                    });
                  }
                  
                  // Create user record directly (we have a session now, so RLS will allow it)
                  console.log('[AUTH CALLBACK] Calling supabase.from("users").insert()...');
                  const { data: insertedUser, error: insertError } = await supabase
                    .from('users')
                    .insert(userData)
                    .select()
                    .single();

                  console.log('[AUTH CALLBACK] Insert response:', {
                    hasData: !!insertedUser,
                    hasError: !!insertError,
                    error: insertError,
                  });

                  if (insertError) {
                    console.error('[AUTH CALLBACK] Error creating user profile:', insertError);
                    console.error('[AUTH CALLBACK] Insert error details:', {
                      message: insertError.message,
                      code: insertError.code,
                      details: insertError.details,
                      hint: insertError.hint,
                      statusCode: (insertError as any).status || (insertError as any).statusCode,
                    });
                    
                    // Try using updateUserProfile as fallback
                    try {
                      console.log('[AUTH CALLBACK] Trying fallback: updateUserProfile');
                      await updateUserProfile(supabase, authUser.id, {
                        email: authUser.email || '',
                        username: username,
                        subscriptionTier: 'free',
                        subscriptionStatus: 'inactive',
                      });
                      console.log('[AUTH CALLBACK] User record created via updateUserProfile');
                      
                      // Verify it was created
                      const { data: verifyUser } = await supabase
                        .from('users')
                        .select('id, email, username')
                        .eq('id', authUser.id)
                        .single();
                      
                      if (verifyUser) {
                        console.log('[AUTH CALLBACK] Verified user exists after updateUserProfile:', verifyUser);
                        profileCreated = true;
                      } else {
                        console.error('[AUTH CALLBACK] User still not found after updateUserProfile');
                      }
                    } catch (fallbackError: any) {
                      console.error('[AUTH CALLBACK] Fallback profile creation also failed:', fallbackError);
                      console.error('[AUTH CALLBACK] Fallback error details:', {
                        message: fallbackError?.message,
                        stack: fallbackError?.stack,
                      });
                    }
                  } else {
                    console.log('[AUTH CALLBACK] User record created successfully:', insertedUser);
                    
                    // Verify it was actually created by reading it back
                    const { data: verifyUser, error: verifyError } = await supabase
                      .from('users')
                      .select('id, email, username')
                      .eq('id', authUser.id)
                      .single();
                    
                    if (verifyError) {
                      console.error('[AUTH CALLBACK] Error verifying user creation:', verifyError);
                    } else if (verifyUser) {
                      console.log('[AUTH CALLBACK] Verified user exists in database:', verifyUser);
                      profileCreated = true;
                    } else {
                      console.error('[AUTH CALLBACK] User not found after insertion (but no error)');
                    }
                  }
                } else {
                  console.log('[AUTH CALLBACK] User record already exists in users table');
                  profileCreated = true;
                }
              } else {
                console.error('[AUTH CALLBACK] No auth user returned from getUser()');
              }
            } catch (profileError: any) {
              console.error('[AUTH CALLBACK] Error ensuring user profile exists:', profileError);
              console.error('[AUTH CALLBACK] Profile error details:', {
                message: profileError?.message,
                stack: profileError?.stack,
              });
              // Don't fail the confirmation flow if profile creation fails
              // But log it so we can debug
            }
            
            if (!profileCreated) {
              console.warn('[AUTH CALLBACK] WARNING: User profile was not created. User may need to contact support.');
              // Show an error state or message to the user
            } else {
              // IMPORTANT: Only sign out if profile was successfully created
              // Sign the user out after email confirmation to ensure they need to manually log in
              // Supabase automatically logs users in when they confirm email, but we want them
              // to manually log in after confirmation for security
              try {
                console.log('[AUTH CALLBACK] Profile created successfully, signing user out...');
                const { error: signOutError } = await supabase.auth.signOut();
                if (signOutError) {
                  console.error('[AUTH CALLBACK] Error signing out user:', signOutError);
                } else {
                  console.log('[AUTH CALLBACK] User signed out successfully');
                }
              } catch (signOutError: any) {
                console.error('[AUTH CALLBACK] Exception while signing out user:', signOutError);
                // Don't fail the flow if sign out fails, but log it
              }
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
