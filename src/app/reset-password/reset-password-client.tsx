'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
import { KeyRound, Loader2, Lock, ShieldCheck } from 'lucide-react';
import {
  WkAuthShell,
  WkAsideHero,
  WkPrimarySubmit,
  wkInputCls,
  wkLabelCls,
} from '@/components/wk/wk-auth-shell';
import {
  getRecoveryFromHash,
  hasRecoveryInSearch,
  hasRecoveryInUrl,
} from '@/lib/auth-recovery';

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

const aside = (
  <WkAsideHero
    eyebrow="Account security"
    title={
      <>
        Choose a <span className="wk-gradient-text">new password</span>.
      </>
    }
    description="You're almost done. Pick a strong password you haven't used on SeaJourney before — you'll sign in with it on your next visit."
    bullets={[
      {
        label: 'At least 8 characters',
        sub: 'Mix letters and numbers for a stronger password.',
        icon: <Lock className="h-4 w-4" />,
      },
      {
        label: 'Secure reset link',
        sub: 'This page only works from the email we sent you.',
        icon: <ShieldCheck className="h-4 w-4" />,
      },
    ]}
  />
);

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

    const markValid = () => {
      if (!mounted) return;
      setIsValidSession(true);
      if (window.location.hash || window.location.search) {
        window.history.replaceState({}, '', '/reset-password');
      }
    };

    const markInvalid = () => {
      if (!mounted) return;
      setIsValidSession(false);
    };

    const establishRecoverySession = async () => {
      const fromHash = getRecoveryFromHash(window.location.hash);
      if (fromHash) {
        const { data, error } = await supabase.auth.setSession({
          access_token: fromHash.accessToken,
          refresh_token: fromHash.refreshToken,
        });
        if (error || !data.session) {
          markInvalid();
          toast({
            title: 'Invalid Link',
            description:
              'This password reset link is invalid or has expired. Please request a new one.',
            variant: 'destructive',
          });
          return true;
        }
        markValid();
        return true;
      }

      const search = window.location.search;
      if (hasRecoveryInSearch(search)) {
        const params = new URLSearchParams(search);
        const tokenHash = params.get('token_hash') || params.get('token');
        if (tokenHash) {
          const { data, error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: 'recovery',
          });
          if (error || !data.session) {
            markInvalid();
            toast({
              title: 'Invalid Link',
              description:
                'This password reset link is invalid or has expired. Please request a new one.',
              variant: 'destructive',
            });
            return true;
          }
          markValid();
          return true;
        }
      }

      return false;
    };

    let subscription: { unsubscribe: () => void } | null = null;

    const run = async () => {
      const handled = await establishRecoverySession();
      if (handled || !mounted) return;

      const { data } = supabase.auth.onAuthStateChange((event) => {
        if (event === 'PASSWORD_RECOVERY') {
          markValid();
        }
      });
      subscription = data.subscription;

      let attempts = 0;
      const poll = async () => {
        if (!mounted || attempts >= 5) {
          if (!mounted) return;
          if (hasRecoveryInUrl()) {
            const {
              data: { session },
            } = await supabase.auth.getSession();
            if (session) markValid();
            else markInvalid();
          } else {
            markInvalid();
          }
          return;
        }

        attempts += 1;
        if (hasRecoveryInUrl()) {
          const {
            data: { session },
          } = await supabase.auth.getSession();
          if (session) {
            markValid();
            return;
          }
        }

        setTimeout(poll, Math.min(400 * attempts, 2000));
      };

      setTimeout(poll, 300);
    };

    void run();

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
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
    } catch (error: unknown) {
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

  if (isValidSession === null) {
    return (
      <WkAuthShell hideBackLink aside={aside}>
        <div
          className="wk-auth-card flex items-center justify-center p-10"
          style={{ minHeight: 260 }}
        >
          <Loader2
            className="h-8 w-8 animate-spin"
            style={{ color: 'var(--wk-accent)' }}
          />
        </div>
      </WkAuthShell>
    );
  }

  if (isValidSession === false) {
    return (
      <WkAuthShell aside={aside}>
        <div className="wk-auth-card p-8 sm:p-10">
          <div className="flex flex-col items-center text-center">
            <span
              className="inline-flex h-14 w-14 items-center justify-center rounded-2xl"
              style={{
                backgroundColor: 'var(--wk-bad-soft)',
                color: 'var(--wk-bad)',
                border: '1px solid color-mix(in srgb, var(--wk-bad) 35%, transparent)',
              }}
            >
              <KeyRound className="h-7 w-7" />
            </span>
            <h1
              className="mt-5 text-2xl font-semibold tracking-tight"
              style={{ color: 'var(--wk-text)' }}
            >
              <span className="wk-gradient-text">Invalid reset link</span>
            </h1>
            <p
              className="mt-2 text-sm"
              style={{ color: 'var(--wk-text-soft)' }}
            >
              This password reset link is invalid or has expired. Request a new
              one and open it from your email.
            </p>
          </div>

          <div
            className="my-6 h-px w-full"
            style={{ backgroundColor: 'var(--wk-line)' }}
          />

          <Link href="/forgot-password" className="wk-btn wk-btn-primary w-full">
            Request New Reset Link
          </Link>

          <p
            className="mt-6 text-center text-sm"
            style={{ color: 'var(--wk-text-muted)' }}
          >
            Remember your password?{' '}
            <Link href="/login" className="wk-link">
              Sign in
            </Link>
          </p>
        </div>
      </WkAuthShell>
    );
  }

  return (
    <WkAuthShell aside={aside}>
      <div className="wk-auth-card p-8 sm:p-10">
        <div className="flex items-center gap-3">
          <span
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl"
            style={{
              backgroundColor: 'var(--wk-accent-soft)',
              color: 'var(--wk-accent)',
              border: '1px solid var(--wk-accent-ring)',
            }}
          >
            <Lock className="h-5 w-5" />
          </span>
          <div>
            <h1
              className="text-2xl font-semibold tracking-tight"
              style={{ color: 'var(--wk-text)' }}
            >
              <span className="wk-gradient-text">Set</span> new password
            </h1>
            <p className="text-sm" style={{ color: 'var(--wk-text-muted)' }}>
              Enter your new password below.
            </p>
          </div>
        </div>

        <div
          className="my-6 h-px w-full"
          style={{ backgroundColor: 'var(--wk-line)' }}
        />

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleResetPassword)}
            className="space-y-5"
            noValidate
          >
            <FormField
              control={form.control}
              name="password"
              render={({ field, fieldState }) => (
                <FormItem className="space-y-1.5">
                  <FormLabel className={wkLabelCls}>New password</FormLabel>
                  <FormControl>
                    <input
                      type="password"
                      placeholder="••••••••"
                      autoComplete="new-password"
                      aria-invalid={fieldState.invalid || undefined}
                      className={wkInputCls}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage className="wk-error" />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field, fieldState }) => (
                <FormItem className="space-y-1.5">
                  <FormLabel className={wkLabelCls}>Confirm password</FormLabel>
                  <FormControl>
                    <input
                      type="password"
                      placeholder="••••••••"
                      autoComplete="new-password"
                      aria-invalid={fieldState.invalid || undefined}
                      className={wkInputCls}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage className="wk-error" />
                </FormItem>
              )}
            />

            <WkPrimarySubmit type="submit" loading={isLoading}>
              Update Password
            </WkPrimarySubmit>
          </form>
        </Form>
      </div>
    </WkAuthShell>
  );
}
