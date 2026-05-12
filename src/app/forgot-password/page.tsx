'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
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
import { ArrowLeft, KeyRound, Mail } from 'lucide-react';
import {
  WkAuthShell,
  WkAsideHero,
  WkPrimarySubmit,
  wkInputCls,
  wkLabelCls,
} from '@/components/wk/wk-auth-shell';

const forgotPasswordSchema = z.object({
  email: z.string().email({ message: 'Please enter a valid email address.' }),
});

type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPasswordPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [isEmailSent, setIsEmailSent] = useState(false);
  const [sentTo, setSentTo] = useState<string>('');

  const { supabase } = useSupabase();
  const { toast } = useToast();

  const form = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const handleResetPassword = async (data: ForgotPasswordFormValues) => {
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) {
        toast({
          title: 'Error',
          description:
            error.message ||
            'Failed to send password reset email. Please try again.',
          variant: 'destructive',
        });
        return;
      }

      setSentTo(data.email);
      setIsEmailSent(true);
      toast({
        title: 'Email Sent',
        description: 'Check your email for password reset instructions.',
      });
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

  const aside = (
    <WkAsideHero
      eyebrow="Password help"
      title={
        <>
          Let&apos;s get you{' '}
          <span className="wk-gradient-text">back on board</span>.
        </>
      }
      description="Forgotten passwords happen. Enter the email you signed up with and we'll send you a secure reset link — it'll expire after one hour for your safety."
      bullets={[
        {
          label: 'Secure one-time link',
          sub: 'Valid for 60 minutes, from SeaJourney only.',
          icon: <KeyRound className="h-4 w-4" />,
        },
        {
          label: 'Sent straight to your inbox',
          sub: 'Check spam if it doesn’t arrive within a minute.',
          icon: <Mail className="h-4 w-4" />,
        },
      ]}
    />
  );

  if (isEmailSent) {
    return (
      <WkAuthShell aside={aside}>
        <div className="wk-auth-card p-8 sm:p-10">
          <div className="flex flex-col items-center text-center">
            <span
              className="inline-flex h-14 w-14 items-center justify-center rounded-2xl"
              style={{
                backgroundColor: 'var(--wk-accent-soft)',
                color: 'var(--wk-accent)',
                border: '1px solid var(--wk-accent-ring)',
              }}
            >
              <Mail className="h-7 w-7" />
            </span>
            <h1
              className="mt-5 text-2xl font-semibold tracking-tight"
              style={{ color: 'var(--wk-text)' }}
            >
              <span className="wk-gradient-text">Check your email</span>
            </h1>
            <p
              className="mt-2 text-sm"
              style={{ color: 'var(--wk-text-soft)' }}
            >
              We&apos;ve sent password reset instructions to{' '}
              <strong style={{ color: 'var(--wk-text)' }}>
                {sentTo || 'your email address'}
              </strong>
              .
            </p>
            <p
              className="mt-1 text-xs"
              style={{ color: 'var(--wk-text-muted)' }}
            >
              The link will expire in 1 hour. Didn&apos;t receive it? Check your
              spam folder, or try again in a minute.
            </p>
          </div>

          <div
            className="my-6 h-px w-full"
            style={{ backgroundColor: 'var(--wk-line)' }}
          />

          <div className="flex flex-col gap-3 sm:flex-row">
            <Link href="/login" className="wk-btn wk-btn-ghost flex-1">
              <ArrowLeft className="h-4 w-4" />
              Back to Login
            </Link>
            <button
              type="button"
              onClick={() => {
                setIsEmailSent(false);
                setSentTo('');
                form.reset();
              }}
              className="wk-btn wk-btn-ghost flex-1"
            >
              Send again
            </button>
          </div>
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
            <KeyRound className="h-5 w-5" />
          </span>
          <div>
            <h1
              className="text-2xl font-semibold tracking-tight"
              style={{ color: 'var(--wk-text)' }}
            >
              <span className="wk-gradient-text">Reset</span> your password
            </h1>
            <p className="text-sm" style={{ color: 'var(--wk-text-muted)' }}>
              We&apos;ll email you a secure link to choose a new one.
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
              name="email"
              render={({ field, fieldState }) => (
                <FormItem className="space-y-1.5">
                  <FormLabel className={wkLabelCls}>Email</FormLabel>
                  <FormControl>
                    <input
                      type="email"
                      placeholder="you@example.com"
                      autoComplete="email"
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
              Send Reset Link
            </WkPrimarySubmit>
          </form>
        </Form>

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
