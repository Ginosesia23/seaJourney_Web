'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { useSupabase } from '@/supabase';
import { Loader2, Lock } from 'lucide-react';
import LogoOnboarding from '@/components/logo-onboarding';

const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, { message: 'Password must be at least 8 characters long.' }),
    confirmPassword: z
      .string()
      .min(8, { message: 'Please confirm your password.' }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;

export default function ResetPasswordClient() {
  const [isLoading, setIsLoading] = useState(false);
  const [isValidSession, setIsValidSession] = useState<boolean | null>(null);

  const { supabase } = useSupabase();
  const router = useRouter();
  const { toast } = useToast();

  const form = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  useEffect(() => {
    let mounted = true;

    const checkSession = async () => {
      // 1) Check for existing session first
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session) {
        if (mounted) setIsValidSession(true);
        return;
      }

      // 2) Handle URL hash parameters (Supabase sends tokens in hash after redirect)
      const hashParams = window.location.hash;
      if (hashParams) {
        const params = new URLSearchParams(hashParams.substring(1));
        const accessToken = params.get('access_token');
        const type = params.get('type');
        const refreshToken = params.get('refresh_token');

        if (accessToken && type === 'recovery' && refreshToken) {
          try {
            const { data, error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });

            if (error) {
              console.error('[RESET PASSWORD] Error setting session:', error);
              if (mounted) {
                setIsValidSession(false);
                toast({
                  title: 'Invalid Link',
                  description:
                    'This password reset link is invalid or has expired. Please request a new one.',
                  variant: 'destructive',
                });
              }
              return;
            }

            if (data.session && mounted) {
              setIsValidSession(true);
              // Clean up URL
              window.history.replaceState({}, '', '/reset-password');
            }
            return;
          } catch (error) {
            console.error('[RESET PASSWORD] Exception setting session:', error);
            if (mounted) setIsValidSession(false);
            return;
          }
        }
      }

      // 3) Handle query parameters (some email clients or Supabase configs might use query params)
      const searchParams = new URLSearchParams(window.location.search);
      const tokenHash = searchParams.get('token_hash') || searchParams.get('token');
      const typeParam = searchParams.get('type');
      const redirectTo = searchParams.get('redirect_to');

      if (tokenHash && typeParam === 'recovery') {
        try {
          const { data, error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: 'recovery',
          });

          if (error || !data.session) {
            console.error('[RESET PASSWORD] Error verifying OTP:', error);
            if (mounted) {
              setIsValidSession(false);
              toast({
                title: 'Invalid Link',
                description:
                  'This password reset link is invalid or has expired. Please request a new one.',
                variant: 'destructive',
              });
            }
            return;
          }

          if (data.session && mounted) {
            setIsValidSession(true);
            // Clean up URL
            window.history.replaceState({}, '', '/reset-password');
          }
          return;
        } catch (error) {
          console.error('[RESET PASSWORD] Exception verifying OTP:', error);
          if (mounted) setIsValidSession(false);
          return;
        }
      }

      // 4) Set up auth state change listener to catch PASSWORD_RECOVERY events
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange(async (event, session) => {
        console.log('[RESET PASSWORD] Auth state change:', event, !!session);
        
        if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
          if (mounted) {
            setIsValidSession(true);
            // Clean up URL
            window.history.replaceState({}, '', '/reset-password');
          }
        } else if (event === 'SIGNED_OUT') {
          if (mounted) setIsValidSession(false);
        }
      });

      // 5) Poll for session (Supabase's /auth/v1/verify might establish session server-side)
      // Check multiple times with increasing delays to catch async session establishment
      let checkCount = 0;
      const maxChecks = 5;
      
      const pollForSession = async () => {
        if (!mounted || checkCount >= maxChecks) {
          if (!mounted) return;
          
          // Final check - if still no session, mark as invalid
          const {
            data: { session: finalSession },
          } = await supabase.auth.getSession();
          
          if (!finalSession && mounted) {
            setIsValidSession(false);
          } else if (finalSession && mounted) {
            setIsValidSession(true);
            window.history.replaceState({}, '', '/reset-password');
          }
          return;
        }

        checkCount++;
        const {
          data: { session: polledSession },
        } = await supabase.auth.getSession();

        if (polledSession && mounted) {
          setIsValidSession(true);
          // Clean up URL
          if (window.location.hash || window.location.search) {
            window.history.replaceState({}, '', '/reset-password');
          }
        } else if (mounted) {
          // Check again with exponential backoff
          setTimeout(pollForSession, Math.min(500 * Math.pow(2, checkCount - 1), 3000));
        }
      };

      // Start polling after a short initial delay
      setTimeout(pollForSession, 300);

      return () => {
        mounted = false;
        subscription.unsubscribe();
      };
    };

    checkSession();
  }, [supabase, toast]);

  const handleResetPassword = async (data: ResetPasswordFormValues) => {
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: data.password,
      });

      if (error) {
        toast({
          title: 'Error',
          description:
            error.message || 'Failed to reset password. Please try again.',
          variant: 'destructive',
        });
        setIsLoading(false);
        return;
      }

      toast({
        title: 'Password Updated',
        description:
          'Your password has been successfully updated. You can now sign in.',
      });

      setTimeout(() => {
        router.push('/login');
      }, 2000);
    } catch (error: any) {
      console.error('Password reset failed:', error);
      toast({
        title: 'Error',
        description: 'An unexpected error occurred. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Loading state while we check the session
  if (isValidSession === null) {
    return (
      <div className="dark animated-gradient-background flex min-h-screen flex-col items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-white" />
      </div>
    );
  }

  // Invalid / expired link
  if (isValidSession === false) {
    return (
      <div className="dark animated-gradient-background flex min-h-screen flex-col items-center justify-center px-4">
        <div className="mb-8">
          <LogoOnboarding />
        </div>
        <Card className="w-full max-w-md border-primary/20 bg-black/20 backdrop-blur-sm">
          <CardHeader className="text-center">
            <CardTitle className="font-headline text-2xl">
              Invalid Reset Link
            </CardTitle>
            <CardDescription>
              This password reset link is invalid or has expired.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              asChild
              variant="outline"
              className="w-full rounded-lg"
            >
              <a href="/forgot-password">Request New Reset Link</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Valid session – show reset form
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
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 mb-4">
              <Lock className="h-6 w-6 text-primary" />
            </div>
            <CardTitle className="font-headline text-2xl">
              Set New Password
            </CardTitle>
            <CardDescription>Enter your new password below.</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(handleResetPassword)}
                className="space-y-4"
              >
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>New Password</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="••••••••"
                          {...field}
                          className="rounded-lg"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm Password</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="••••••••"
                          {...field}
                          className="rounded-lg"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  className="w-full rounded-lg"
                  disabled={isLoading}
                  variant="default"
                >
                  {isLoading && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Update Password
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
