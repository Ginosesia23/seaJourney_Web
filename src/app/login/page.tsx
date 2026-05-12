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
import { useSupabase, useUser } from '@/supabase';
import { Loader2, LogIn, ShieldCheck, Sparkles, Users } from 'lucide-react';
import { getUserProfile, updateUserProfile } from '@/supabase/database/queries';
import {
  WkAuthShell,
  WkAsideHero,
  WkPrimarySubmit,
  wkInputCls,
  wkLabelCls,
} from '@/components/wk/wk-auth-shell';

const loginSchema = z.object({
  email: z.string().email({ message: 'Please enter a valid email address.' }),
  password: z.string().min(1, { message: 'Password is required.' }),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingUser, setIsCheckingUser] = useState(true);

  const { supabase } = useSupabase();
  const router = useRouter();
  const { toast } = useToast();
  const { user, isUserLoading } = useUser();

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const checkUserAndRedirect = async (userId: string) => {
    try {
      const userProfile = await getUserProfile(supabase, userId);
      if (userProfile.role === 'vessel') {
        router.push('/dashboard/crew');
      } else if (userProfile.role === 'admin') {
        router.push('/dashboard');
      } else {
        if (userProfile.subscriptionStatus === 'active') {
          router.push('/dashboard');
        } else {
          router.push('/offers');
        }
      }
    } catch (error) {
      console.error('Failed to fetch user profile for redirection:', error);
      router.push('/dashboard');
    }
  };

  useEffect(() => {
    if (!isUserLoading && user) {
      checkUserAndRedirect(user.id);
    } else if (!isUserLoading && !user) {
      setIsCheckingUser(false);
    }
  }, [user, isUserLoading, router, supabase]);

  const handleLogin = async (data: LoginFormValues) => {
    setIsLoading(true);
    try {
      const { data: authData, error } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });

      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          toast({
            title: 'Login Failed',
            description:
              'Invalid email or password. Please check your credentials and try again.',
            variant: 'destructive',
          });
        } else if (error.message.includes('Email not confirmed')) {
          toast({
            title: 'Email Not Verified',
            description:
              'Please check your email and verify your account before signing in.',
            variant: 'destructive',
          });
        } else if (error.message.includes('Too many requests')) {
          toast({
            title: 'Too Many Attempts',
            description: 'Please wait a moment before trying again.',
            variant: 'destructive',
          });
        } else {
          toast({
            title: 'Login Failed',
            description:
              error.message || 'An error occurred during login. Please try again.',
            variant: 'destructive',
          });
        }
        return;
      }

      if (authData.user) {
        try {
          const userProfile = await getUserProfile(supabase, authData.user.id);
          console.log('[LOGIN] User profile found:', userProfile);
        } catch (_profileError: any) {
          console.log('[LOGIN] User profile not found, creating it...');
          try {
            await updateUserProfile(supabase, authData.user.id, {
              email: authData.user.email || '',
              username:
                authData.user.user_metadata?.username ||
                `user_${authData.user.id.slice(0, 8)}`,
              subscriptionTier: 'free',
              subscriptionStatus: 'inactive',
            });
            console.log('[LOGIN] User profile created successfully');
          } catch (createError: any) {
            console.error('[LOGIN] Error creating user profile:', createError);
            toast({
              title: 'Login Successful',
              description:
                'Logged in successfully, but there was an issue with your profile. Please contact support if you experience any issues.',
              variant: 'default',
            });
            return;
          }
        }

        toast({
          title: 'Welcome Back!',
          description: 'You have been successfully logged in.',
        });
      }
    } catch (error: any) {
      console.error('Login failed:', error);
      toast({
        title: 'Login Failed',
        description:
          error.message || 'An unexpected error occurred. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isCheckingUser) {
    return (
      <WkAuthShell hideBackLink>
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

  return (
    <WkAuthShell
      aside={
        <WkAsideHero
          eyebrow="SeaJourney"
          title={
            <>
              Welcome <span className="wk-gradient-text">back on board</span>.
            </>
          }
          description="Pick up exactly where you left off — log sea time, track certificates, and generate verifiable records in seconds."
          bullets={[
            {
              label: 'Verified sea service records',
              sub: 'Share a QR or SJ-code to prove your history.',
              icon: <ShieldCheck className="h-4 w-4" />,
            },
            {
              label: 'Official MCA, AMSA & testimonial forms',
              sub: 'Auto-filled from your voyage history.',
              icon: <Sparkles className="h-4 w-4" />,
            },
            {
              label: 'A trusted crew & vessel network',
              sub: 'Stay in touch with past vessels and captains.',
              icon: <Users className="h-4 w-4" />,
            },
          ]}
        />
      }
    >
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
            <LogIn className="h-5 w-5" />
          </span>
          <div>
            <h1
              className="text-2xl font-semibold tracking-tight"
              style={{ color: 'var(--wk-text)' }}
            >
              <span className="wk-gradient-text">Sign in</span> to your account
            </h1>
            <p className="text-sm" style={{ color: 'var(--wk-text-muted)' }}>
              Welcome back — let&apos;s get you to your dashboard.
            </p>
          </div>
        </div>

        <div
          className="my-6 h-px w-full"
          style={{ backgroundColor: 'var(--wk-line)' }}
        />

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleLogin)}
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

            <FormField
              control={form.control}
              name="password"
              render={({ field, fieldState }) => (
                <FormItem className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <FormLabel className={wkLabelCls}>Password</FormLabel>
                    <Link
                      href="/forgot-password"
                      className="wk-link text-xs"
                    >
                      Forgot?
                    </Link>
                  </div>
                  <FormControl>
                    <input
                      type="password"
                      placeholder="••••••••"
                      autoComplete="current-password"
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
              Sign In
            </WkPrimarySubmit>
          </form>
        </Form>

        <p
          className="mt-6 text-center text-sm"
          style={{ color: 'var(--wk-text-muted)' }}
        >
          Don&apos;t have an account?{' '}
          <Link href="/signup" className="wk-link">
            Create one
          </Link>
        </p>
      </div>
    </WkAuthShell>
  );
}
