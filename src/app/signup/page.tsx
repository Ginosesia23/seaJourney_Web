'use client';

import { Suspense, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
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
import { Loader2, UserPlus, Anchor, Compass, FileCheck } from 'lucide-react';
import {
  WkAuthShell,
  WkAsideHero,
  WkPrimarySubmit,
  wkInputCls,
  wkLabelCls,
} from '@/components/wk/wk-auth-shell';

const signupSchema = z.object({
  username: z
    .string()
    .min(3, { message: 'Username must be at least 3 characters long.' }),
  email: z.string().email({ message: 'Please enter a valid email.' }),
  password: z
    .string()
    .min(8, { message: 'Password must be at least 8 characters long.' }),
  firstName: z.string().min(1, { message: 'First name is required.' }),
  lastName: z.string().min(1, { message: 'Last name is required.' }),
  position: z.string().min(1, { message: 'Position is required.' }),
  agreeToTerms: z.boolean().refine((val) => val === true, {
    message:
      'You must agree to the Terms & Conditions and Privacy Policy to create an account.',
  }),
});

type SignupFormValues = z.infer<typeof signupSchema>;

// Maritime position options
const POSITION_OPTIONS = [
  // Deck Department - Senior
  'Captain / Master',
  'Chief Officer',
  'First Officer',
  'First Mate',
  'Second Officer',
  'Third Officer',
  'Officer of the Watch (OOW)',
  'Deck Officer',
  'Bosun',
  // Deck Department - Deckhands
  'Lead Deckhand',
  'Senior Deckhand',
  'Deckhand',
  'Junior Deckhand',
  'Able Seaman (AB)',
  'Quartermaster',
  // Deck Department - Cadets
  'Deck Cadet',
  'Cadet',
  // Engine Department - Senior
  'Chief Engineer',
  'First Engineer',
  'Second Engineer',
  'Third Engineer',
  'Fourth Engineer',
  'Engineer',
  'Electrician',
  // Engine Department - Junior
  'Motorman / Oiler',
  'Wiper',
  'Engine Cadet',
  // Interior/Service - Management
  'Purser',
  'Chief Purser',
  // Interior/Service - Galley
  'Head Chef',
  'Chef / Cook',
  'Sous Chef',
  'Galley Assistant',
  // Interior/Service - Housekeeping
  'Head Housekeeper',
  'Chief Steward / Stewardess',
  '2nd Steward / Stewardess',
  'Steward / Stewardess',
  'Laundry Attendant',
  'Interior Crew',
  // Other Specialized Roles
  'Medical Officer',
  'Security Officer',
  'Radio Officer',
  'Safety Officer',
  'Environmental Officer',
  'Masseuse / Masseur',
  'Spa Therapist',
  'Other',
] as const;

function SignupPageInner() {
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingUser, setIsCheckingUser] = useState(true);

  const { supabase } = useSupabase();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { user, isUserLoading } = useUser();

  const redirectParam = searchParams.get('redirect');
  const planParam = searchParams.get('plan');

  const form = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      username: '',
      email: '',
      password: '',
      firstName: '',
      lastName: '',
      position: '',
      agreeToTerms: false,
    },
  });

  useEffect(() => {
    if (!isUserLoading) {
      if (user) {
        router.push('/dashboard');
      } else {
        setIsCheckingUser(false);
      }
    }
  }, [user, isUserLoading, router]);

  const handleSignup = async (data: SignupFormValues) => {
    setIsLoading(true);
    try {
      if (data.password.length < 8) {
        toast({
          title: 'Weak Password',
          description: 'Password must be at least 8 characters long.',
          variant: 'destructive',
        });
        setIsLoading(false);
        return;
      }

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: {
            username: data.username,
            firstName: data.firstName,
            lastName: data.lastName,
            position: data.position,
          },
          emailRedirectTo: `${window.location.origin}/auth/confirm`,
        },
      });

      if (authError) {
        if (
          authError.message.includes('already registered') ||
          authError.message.includes('already exists')
        ) {
          toast({
            title: 'Email Already Registered',
            description:
              'This email is already in use. Please try logging in instead.',
            variant: 'destructive',
          });
        } else if (authError.message.includes('Password')) {
          toast({
            title: 'Invalid Password',
            description:
              'Password does not meet requirements. Please use a stronger password.',
            variant: 'destructive',
          });
        } else {
          toast({
            title: 'Signup Failed',
            description:
              authError.message ||
              'An error occurred during sign-up. Please try again.',
            variant: 'destructive',
          });
        }
        setIsLoading(false);
        return;
      }

      if (!authData.user) {
        throw new Error('User creation failed');
      }

      try {
        const profileResponse = await fetch('/api/users/create-profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: authData.user.id,
            email: data.email,
            username: data.username,
            firstName: data.firstName,
            lastName: data.lastName,
            position: data.position,
            role: 'crew',
          }),
        });

        const profileResult = await profileResponse.json();

        if (!profileResponse.ok) {
          console.error('[SIGNUP] Profile creation API error:', profileResult);
        } else {
          console.log(
            '[SIGNUP] User profile created successfully with position:',
            profileResult,
          );
        }
      } catch (profileError: any) {
        console.error(
          '[SIGNUP] Error calling profile creation API:',
          profileError,
        );
      }

      if (authData.user && !authData.session) {
        toast({
          title: 'Check Your Email',
          description:
            'We sent you a confirmation email. Please verify your email address to complete signup.',
          variant: 'default',
        });
        router.push('/login');
      } else {
        toast({
          title: 'Account Created!',
          description:
            'Welcome to SeaJourney! Your account has been successfully created.',
        });

        let redirectUrl = redirectParam || '/offers';
        if (!redirectParam && planParam) {
          redirectUrl = `/offers?plan=${encodeURIComponent(planParam)}`;
        }

        router.push(redirectUrl);
      }
    } catch (error: any) {
      console.error('Signup failed:', error);
      toast({
        title: 'Signup Failed',
        description:
          error.message ||
          'An unexpected error occurred during sign-up. Please try again.',
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
      size="lg"
      aside={
        <WkAsideHero
          eyebrow="Join SeaJourney"
          title={
            <>
              Your maritime career,{' '}
              <span className="wk-gradient-text">fully documented</span>.
            </>
          }
          description="Create a free account to log voyages, track certificates, and generate verifiable testimonials — trusted by crew, vessels, and maritime authorities."
          bullets={[
            {
              label: 'Log sea time in seconds',
              sub: 'Automatic day, standby, and at-sea tallies.',
              icon: <Anchor className="h-4 w-4" />,
            },
            {
              label: 'Official forms, pre-filled',
              sub: 'MCA, AMSA, and yacht testimonials ready to sign.',
              icon: <FileCheck className="h-4 w-4" />,
            },
            {
              label: 'Beautifully tracked voyages',
              sub: 'World map, certificates, and subscriptions in one place.',
              icon: <Compass className="h-4 w-4" />,
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
            <UserPlus className="h-5 w-5" />
          </span>
          <div>
            <h1
              className="text-2xl font-semibold tracking-tight"
              style={{ color: 'var(--wk-text)' }}
            >
              <span className="wk-gradient-text">Create</span> your account
            </h1>
            <p className="text-sm" style={{ color: 'var(--wk-text-muted)' }}>
              Free forever for crew. No credit card required.
            </p>
          </div>
        </div>

        <div
          className="my-6 h-px w-full"
          style={{ backgroundColor: 'var(--wk-line)' }}
        />

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSignup)}
            className="space-y-4"
            noValidate
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="firstName"
                render={({ field, fieldState }) => (
                  <FormItem className="space-y-1.5">
                    <FormLabel className={wkLabelCls}>First name</FormLabel>
                    <FormControl>
                      <input
                        placeholder="John"
                        autoComplete="given-name"
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
                name="lastName"
                render={({ field, fieldState }) => (
                  <FormItem className="space-y-1.5">
                    <FormLabel className={wkLabelCls}>Last name</FormLabel>
                    <FormControl>
                      <input
                        placeholder="Doe"
                        autoComplete="family-name"
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
                name="username"
                render={({ field, fieldState }) => (
                  <FormItem className="space-y-1.5">
                    <FormLabel className={wkLabelCls}>Username</FormLabel>
                    <FormControl>
                      <input
                        placeholder="yourusername"
                        autoComplete="username"
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
                    <FormLabel className={wkLabelCls}>Password</FormLabel>
                    <FormControl>
                      <input
                        type="password"
                        placeholder="At least 8 characters"
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
                name="position"
                render={({ field, fieldState }) => (
                  <FormItem className="space-y-1.5">
                    <FormLabel className={wkLabelCls}>
                      Position / Role
                    </FormLabel>
                    <FormControl>
                      <select
                        aria-invalid={fieldState.invalid || undefined}
                        className={`${wkInputCls} wk-select`}
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        name={field.name}
                        ref={field.ref}
                      >
                        <option value="" disabled>
                          Select your position
                        </option>
                        {POSITION_OPTIONS.map((position) => (
                          <option key={position} value={position}>
                            {position}
                          </option>
                        ))}
                      </select>
                    </FormControl>
                    <FormMessage className="wk-error" />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="agreeToTerms"
              render={({ field, fieldState }) => (
                <FormItem className="pt-1">
                  <label className="flex items-start gap-3 text-sm leading-relaxed">
                    <input
                      type="checkbox"
                      checked={field.value}
                      onChange={(e) => field.onChange(e.target.checked)}
                      onBlur={field.onBlur}
                      name={field.name}
                      ref={field.ref}
                      aria-invalid={fieldState.invalid || undefined}
                      className="mt-0.5 h-4 w-4 cursor-pointer rounded"
                      style={{ accentColor: 'var(--wk-accent)' }}
                    />
                    <span style={{ color: 'var(--wk-text-soft)' }}>
                      I agree to the{' '}
                      <Link
                        href="/terms-of-service"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="wk-link"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Terms &amp; Conditions
                      </Link>{' '}
                      and{' '}
                      <Link
                        href="/privacy-policy"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="wk-link"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Privacy Policy
                      </Link>
                      .
                    </span>
                  </label>
                  <FormMessage className="wk-error" />
                </FormItem>
              )}
            />

            <WkPrimarySubmit type="submit" loading={isLoading}>
              Create Account
            </WkPrimarySubmit>
          </form>
        </Form>

        <p
          className="mt-6 text-center text-sm"
          style={{ color: 'var(--wk-text-muted)' }}
        >
          Already have an account?{' '}
          <Link href="/login" className="wk-link">
            Sign in
          </Link>
          {' · '}
          <Link href="/signup/vessel" className="wk-link">
            Register a vessel
          </Link>
        </p>
      </div>
    </WkAuthShell>
  );
}

export default function SignupPage() {
  return (
    <Suspense
      fallback={
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
      }
    >
      <SignupPageInner />
    </Suspense>
  );
}
