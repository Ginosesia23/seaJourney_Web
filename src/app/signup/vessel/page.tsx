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
import {
  Anchor,
  Compass,
  Loader2,
  Radar,
  Ship,
  ShieldCheck,
  Waves,
} from 'lucide-react';
import { UnifiedVesselSearchPicker } from '@/components/dashboard/unified-vessel-search-picker';
import {
  WkAuthShell,
  WkAsideHero,
  WkPrimarySubmit,
  wkInputCls,
  wkLabelCls,
} from '@/components/wk/wk-auth-shell';

const vesselSignupSchema = z.object({
  vesselId: z.string().min(1, { message: 'Please select your vessel.' }),
  vesselName: z.string().optional(),
  email: z.string().email({ message: 'Please enter a valid email.' }),
  password: z
    .string()
    .min(8, { message: 'Password must be at least 8 characters long.' }),
  agreeToTerms: z.boolean().refine((val) => val === true, {
    message:
      'You must agree to the Terms & Conditions and Privacy Policy to create an account.',
  }),
});

type VesselSignupFormValues = z.infer<typeof vesselSignupSchema>;

function VesselSignupPageInner() {
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingUser, setIsCheckingUser] = useState(true);

  const { supabase } = useSupabase();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectParam = searchParams.get('redirect');
  const { toast } = useToast();
  const { user, isUserLoading } = useUser();

  const form = useForm<VesselSignupFormValues>({
    resolver: zodResolver(vesselSignupSchema),
    defaultValues: {
      vesselId: '',
      vesselName: '',
      email: '',
      password: '',
      agreeToTerms: false,
    },
  });

  const handleVesselPickerChange = (vesselId: string, vesselName: string) => {
    form.setValue('vesselId', vesselId);
    form.setValue('vesselName', vesselName);
    if (vesselId) {
      form.clearErrors('vesselId');
    }
  };

  useEffect(() => {
    if (!isUserLoading) {
      if (user) {
        router.push(redirectParam || '/dashboard');
      } else {
        setIsCheckingUser(false);
      }
    }
  }, [user, isUserLoading, router, redirectParam]);

  const handleSignup = async (data: VesselSignupFormValues) => {
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

      let vesselId: string;

      if (!data.vesselId) {
        toast({
          title: 'Vessel Required',
          description: 'Please search for and select your vessel before registering.',
          variant: 'destructive',
        });
        setIsLoading(false);
        return;
      }

      const checkResponse = await fetch('/api/vessels/check-manager', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vesselId: data.vesselId }),
      });

      if (checkResponse.ok) {
        const checkData = await checkResponse.json();
        if (checkData.hasManager) {
          toast({
            title: 'Vessel Already Managed',
            description:
              'This vessel is already being managed by another account. Please select a different vessel.',
            variant: 'destructive',
          });
          setIsLoading(false);
          return;
        }
      } else {
        console.error('Failed to check vessel manager status');
      }

      vesselId = data.vesselId;

      try {
        const updateResponse = await fetch('/api/vessels/update', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vesselId,
            updates: { is_official: true },
          }),
        });

        if (!updateResponse.ok) {
          const updateError = await updateResponse.json();
          console.error(
            '[VESSEL SIGNUP] Error updating is_official:',
            updateError,
          );
        } else {
          console.log(
            '[VESSEL SIGNUP] Successfully updated is_official to true for vessel:',
            vesselId,
          );
        }
      } catch (updateError) {
        console.error(
          '[VESSEL SIGNUP] Error updating is_official:',
          updateError,
        );
      }

      const finalCheckResponse = await fetch('/api/vessels/check-manager', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vesselId }),
      });

      if (finalCheckResponse.ok) {
        const finalCheckData = await finalCheckResponse.json();
        if (finalCheckData.hasManager) {
          toast({
            title: 'Vessel Already Managed',
            description:
              'This vessel is already being managed by another account. Please try a different vessel.',
            variant: 'destructive',
          });
          setIsLoading(false);
          return;
        }
      }

      try {
        const profileResponse = await fetch('/api/users/create-profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: authData.user.id,
            email: data.email,
            role: 'vessel',
            activeVesselId: vesselId,
          }),
        });

        const profileResult = await profileResponse.json();

        if (!profileResponse.ok) {
          console.error(
            '[VESSEL SIGNUP] Profile creation API error:',
            profileResult,
          );
        } else {
          console.log(
            '[VESSEL SIGNUP] User profile created successfully:',
            profileResult,
          );
        }

        if (!profileResult.activeVesselId) {
          const { error: updateError } = await supabase
            .from('users')
            .update({ active_vessel_id: vesselId })
            .eq('id', authData.user.id);

          if (updateError) {
            console.error(
              '[VESSEL SIGNUP] Error updating active_vessel_id:',
              updateError,
            );
          }
        }

        try {
          const updateVesselResponse = await fetch('/api/vessels/update', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              vesselId,
              updates: { vessel_manager_id: authData.user.id },
            }),
          });

          if (!updateVesselResponse.ok) {
            const updateVesselError = await updateVesselResponse.json();
            console.error(
              '[VESSEL SIGNUP] Error updating vessel_manager_id:',
              updateVesselError,
            );
          } else {
            console.log(
              '[VESSEL SIGNUP] Successfully set vessel_manager_id for vessel:',
              vesselId,
            );
          }
        } catch (updateVesselError) {
          console.error(
            '[VESSEL SIGNUP] Error updating vessel_manager_id:',
            updateVesselError,
          );
        }
      } catch (profileError: any) {
        console.error(
          '[VESSEL SIGNUP] Error calling profile creation API:',
          profileError,
        );
        try {
          const { error: updateError } = await supabase
            .from('users')
            .update({ active_vessel_id: vesselId, role: 'vessel' })
            .eq('id', authData.user.id);

          if (updateError) {
            console.error(
              '[VESSEL SIGNUP] Error updating user profile:',
              updateError,
            );
          }

          try {
            const updateVesselResponse = await fetch('/api/vessels/update', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                vesselId,
                updates: { vessel_manager_id: authData.user.id },
              }),
            });

            if (!updateVesselResponse.ok) {
              console.error(
                '[VESSEL SIGNUP] Error updating vessel_manager_id in fallback',
              );
            }
          } catch (e) {
            console.error(
              '[VESSEL SIGNUP] Error updating vessel_manager_id in fallback:',
              e,
            );
          }
        } catch (updateError) {
          console.error(
            '[VESSEL SIGNUP] Fallback update failed:',
            updateError,
          );
        }
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
          title: 'Vessel Account Created!',
          description:
            'Welcome to SeaJourney! Your vessel account has been successfully created.',
        });
        router.push(redirectParam || '/dashboard');
      }
    } catch (error: any) {
      console.error('Vessel signup failed:', error);
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
      <WkAuthShell hideBackLink size="sm">
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
          eyebrow="For vessels"
          title={
            <>
              Manage your vessel on{' '}
              <span className="wk-gradient-text">SeaJourney</span>.
            </>
          }
          description="Register a vessel account to verify crew sea time, approve testimonials, and keep a shared, tamper-proof record of every voyage."
          bullets={[
            {
              label: 'One official vessel profile',
              sub: 'Crew can only link to a verified entry.',
              icon: <Ship className="h-4 w-4" />,
            },
            {
              label: 'Verify and sign sea time',
              sub: 'Approve crew testimonials with a single tap.',
              icon: <ShieldCheck className="h-4 w-4" />,
            },
            {
              label: 'A complete voyage history',
              sub: 'Crew rotations, routes, and hours in one place.',
              icon: <Compass className="h-4 w-4" />,
            },
            {
              label: 'Automatic state from AIS',
              sub: 'Daily vessel states sync from AIS — plus backfill past sea time on Premium.',
              icon: <Radar className="h-4 w-4" />,
            },
          ]}
        />
      }
    >
      <div className="wk-auth-card p-8 sm:p-10">
        <div className="flex items-center gap-3">
          <span
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl"
            style={{
              backgroundColor: 'var(--wk-accent-soft)',
              color: 'var(--wk-accent)',
              border: '1px solid var(--wk-accent-ring)',
            }}
          >
            <Ship className="h-5 w-5" />
          </span>
          <div>
            <h1
              className="text-2xl font-semibold tracking-tight"
              style={{ color: 'var(--wk-text)' }}
            >
              <span className="wk-gradient-text">Register</span> your vessel
            </h1>
            <p className="text-sm" style={{ color: 'var(--wk-text-muted)' }}>
              Create a vessel account to track your vessel&apos;s sea time.
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
            className="space-y-6"
            noValidate
          >
            {/* ---- Vessel Information ------------------------------------ */}
            <section className="space-y-4">
              <SectionHeader
                icon={<Waves className="h-3.5 w-3.5" />}
                label="Vessel Information"
              />

              <FormField
                control={form.control}
                name="vesselId"
                render={({ field, fieldState }) => (
                  <FormItem className="space-y-1.5">
                    <FormLabel className={wkLabelCls}>Your vessel</FormLabel>
                    <FormControl>
                      <UnifiedVesselSearchPicker
                        value={field.value || ''}
                        onChange={handleVesselPickerChange}
                        supabase={supabase}
                        blockManagedVessels
                        variant="auth"
                        placeholder="Search by name, MMSI, or IMO…"
                      />
                    </FormControl>
                    <p className="text-xs" style={{ color: 'var(--wk-text-muted)' }}>
                      Search SeaJourney and AIS in one place — pick your vessel from
                      the results.
                    </p>
                    <FormMessage className="wk-error" />
                  </FormItem>
                )}
              />
            </section>

            <div
              className="h-px w-full"
              style={{ backgroundColor: 'var(--wk-line)' }}
            />

            {/* ---- Account Information ----------------------------------- */}
            <section className="space-y-4">
              <SectionHeader
                icon={<Anchor className="h-3.5 w-3.5" />}
                label="Account Information"
              />

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
              </div>
            </section>

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
              Register Vessel
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
          <Link href="/signup" className="wk-link">
            Crew signup
          </Link>
        </p>
      </div>
    </WkAuthShell>
  );
}

/**
 * Small uppercase section header used to separate the vessel- and account-
 * info blocks in the form, with a leading themed icon chip.
 */
function SectionHeader({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="inline-flex h-6 w-6 items-center justify-center rounded-md"
        style={{
          backgroundColor: 'var(--wk-accent-soft)',
          color: 'var(--wk-accent)',
          border: '1px solid var(--wk-accent-ring)',
        }}
      >
        {icon}
      </span>
      <h3
        className="text-xs font-semibold uppercase tracking-wider"
        style={{ color: 'var(--wk-text-soft)' }}
      >
        {label}
      </h3>
      <span
        className="h-px flex-1"
        style={{ backgroundColor: 'var(--wk-line)' }}
      />
    </div>
  );
}

export default function VesselSignupPage() {
  return (
    <Suspense
      fallback={
        <WkAuthShell hideBackLink size="sm">
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
      <VesselSignupPageInner />
    </Suspense>
  );
}
