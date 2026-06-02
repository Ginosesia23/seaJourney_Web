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
  Ship,
  Check,
  X,
  ShieldCheck,
  Waves,
} from 'lucide-react';
import { vesselTypes, vesselTypeValues } from '@/lib/vessel-types';
import {
  WkAuthShell,
  WkAsideHero,
  WkPrimarySubmit,
  wkInputCls,
  wkLabelCls,
} from '@/components/wk/wk-auth-shell';

const vesselSignupSchema = z
  .object({
    vesselId: z.string().optional(),
    vesselName: z
      .string()
      .min(2, { message: 'Vessel name must be at least 2 characters long.' }),
    vesselType: z.enum(vesselTypeValues).optional(),
    officialNumber: z.string().optional(),
    email: z.string().email({ message: 'Please enter a valid email.' }),
    password: z
      .string()
      .min(8, { message: 'Password must be at least 8 characters long.' }),
    agreeToTerms: z.boolean().refine((val) => val === true, {
      message:
        'You must agree to the Terms & Conditions and Privacy Policy to create an account.',
    }),
  })
  .refine(
    (data) => {
      if (!data.vesselId && !data.vesselType) {
        return false;
      }
      return true;
    },
    {
      message:
        'Please select an existing vessel or provide vessel type to create a new one.',
      path: ['vesselType'],
    },
  );

type VesselSignupFormValues = z.infer<typeof vesselSignupSchema>;

interface VesselOption {
  id: string;
  name: string;
  type: string;
  officialNumber?: string;
}

function VesselSignupPageInner() {
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingUser, setIsCheckingUser] = useState(true);
  const [searchingVessels, setSearchingVessels] = useState(false);
  const [vesselOptions, setVesselOptions] = useState<VesselOption[]>([]);
  const [selectedVessel, setSelectedVessel] = useState<VesselOption | null>(null);

  const { supabase } = useSupabase();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectParam = searchParams.get('redirect');
  const { toast } = useToast();
  const { user, isUserLoading } = useUser();

  const form = useForm<VesselSignupFormValues>({
    resolver: zodResolver(vesselSignupSchema),
    defaultValues: {
      vesselId: undefined,
      vesselName: '',
      vesselType: undefined,
      officialNumber: '',
      email: '',
      password: '',
      agreeToTerms: false,
    },
  });

  const vesselName = form.watch('vesselName');

  useEffect(() => {
    const searchVessels = async () => {
      if (!vesselName || vesselName.length < 2) {
        setVesselOptions([]);
        setSelectedVessel(null);
        form.setValue('vesselId', undefined);
        return;
      }

      if (
        selectedVessel &&
        selectedVessel.name.toLowerCase() === vesselName.toLowerCase()
      ) {
        return;
      }

      setSearchingVessels(true);
      try {
        const response = await fetch('/api/vessels/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ searchTerm: vesselName }),
        });

        if (response.ok) {
          const data = await response.json();
          setVesselOptions(data.vessels || []);
        } else {
          setVesselOptions([]);
        }
      } catch (error) {
        console.error('Error searching vessels:', error);
        setVesselOptions([]);
      } finally {
        setSearchingVessels(false);
      }
    };

    const timeoutId = setTimeout(searchVessels, 300);
    return () => clearTimeout(timeoutId);
  }, [vesselName, selectedVessel, form]);

  const handleSelectExistingVessel = async (vessel: VesselOption) => {
    try {
      const response = await fetch('/api/vessels/check-manager', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vesselId: vessel.id }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.hasManager) {
          toast({
            title: 'Vessel Already Managed',
            description:
              'This vessel is already being managed by another account. Please select a different vessel or create a new one.',
            variant: 'destructive',
          });
          return;
        }
      }
    } catch (error) {
      console.error('Error checking vessel manager:', error);
    }

    setSelectedVessel(vessel);
    setVesselOptions([]);
    form.setValue('vesselId', vessel.id);
    form.setValue('vesselName', vessel.name);
    form.setValue('vesselType', undefined);
    form.setValue('officialNumber', vessel.officialNumber || '');
    form.clearErrors('vesselType');
  };

  const handleCreateNewVessel = () => {
    setSelectedVessel(null);
    form.setValue('vesselId', undefined);
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

      if (data.vesselId) {
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
                'This vessel is already being managed by another account. Please select a different vessel or create a new one.',
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
      } else {
        if (!data.vesselType) {
          toast({
            title: 'Vessel Type Required',
            description:
              'Please select a vessel type or choose an existing vessel.',
            variant: 'destructive',
          });
          setIsLoading(false);
          return;
        }

        const vesselResponse = await fetch('/api/vessels/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: data.vesselName,
            type: data.vesselType,
            officialNumber: data.officialNumber || null,
            isOfficial: true,
            vesselManagerId: authData.user.id,
          }),
        });

        if (!vesselResponse.ok) {
          const vesselError = await vesselResponse.json();
          console.error('[VESSEL SIGNUP] Vessel creation error:', vesselError);
          toast({
            title: 'Vessel Creation Failed',
            description:
              vesselError.error || 'Failed to create vessel. Please try again.',
            variant: 'destructive',
          });
          setIsLoading(false);
          return;
        }

        const vesselData = await vesselResponse.json();
        vesselId = vesselData.vessel.id;

        if (vesselData.alreadyExists) {
          const checkResponse = await fetch('/api/vessels/check-manager', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ vesselId }),
          });

          if (checkResponse.ok) {
            const checkData = await checkResponse.json();
            if (checkData.hasManager) {
              toast({
                title: 'Vessel Already Managed',
                description:
                  'This vessel already exists and is being managed by another account. Please select it from the search results instead.',
                variant: 'destructive',
              });
              setIsLoading(false);
              return;
            }
          }
        }
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
                name="vesselName"
                render={({ field, fieldState }) => (
                  <FormItem className="space-y-1.5">
                    <FormLabel className={wkLabelCls}>Vessel name</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <input
                          placeholder="Type vessel name to search or create new…"
                          aria-invalid={fieldState.invalid || undefined}
                          className={`${wkInputCls} pr-10`}
                          {...field}
                        />
                        {searchingVessels ? (
                          <Loader2
                            className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin"
                            style={{ color: 'var(--wk-text-muted)' }}
                          />
                        ) : null}
                      </div>
                    </FormControl>
                    <FormMessage className="wk-error" />

                    {/* Vessel search results */}
                    {!selectedVessel &&
                    vesselName &&
                    vesselName.length >= 2 &&
                    vesselOptions.length > 0 ? (
                      <div
                        className="relative z-10 mt-2 max-h-64 overflow-y-auto rounded-xl"
                        style={{
                          backgroundColor: 'var(--wk-bg-raised)',
                          border: '1px solid var(--wk-line)',
                          boxShadow: 'var(--wk-shadow-md)',
                        }}
                      >
                        <div
                          className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider"
                          style={{
                            color: 'var(--wk-text-muted)',
                            borderBottom: '1px solid var(--wk-line)',
                            backgroundColor: 'var(--wk-card-alt)',
                          }}
                        >
                          Existing vessels — tap to select
                        </div>
                        {vesselOptions.map((vessel) => (
                          <button
                            key={vessel.id}
                            type="button"
                            onClick={() => handleSelectExistingVessel(vessel)}
                            className="block w-full px-4 py-3 text-left transition-colors"
                            style={{
                              borderBottom: '1px solid var(--wk-line)',
                              color: 'var(--wk-text)',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor =
                                'var(--wk-accent-soft)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor =
                                'transparent';
                            }}
                          >
                            <div className="text-sm font-semibold">
                              {vessel.name}
                            </div>
                            <div
                              className="text-xs"
                              style={{ color: 'var(--wk-text-muted)' }}
                            >
                              {vesselTypes.find((t) => t.value === vessel.type)
                                ?.label || vessel.type}
                              {vessel.officialNumber
                                ? ` · ${vessel.officialNumber}`
                                : ''}
                            </div>
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={handleCreateNewVessel}
                          className="block w-full px-4 py-3 text-left text-sm font-medium transition-colors"
                          style={{
                            color: 'var(--wk-accent)',
                            backgroundColor: 'var(--wk-accent-soft)',
                          }}
                        >
                          + Create new vessel: &ldquo;{vesselName}&rdquo;
                        </button>
                      </div>
                    ) : null}

                    {/* Selected vessel pill */}
                    {selectedVessel ? (
                      <div
                        className="mt-2 flex items-center justify-between rounded-xl px-3 py-2.5"
                        style={{
                          backgroundColor: 'var(--wk-accent-soft)',
                          border: '1px solid var(--wk-accent-ring)',
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg"
                            style={{
                              backgroundColor: 'var(--wk-bg-raised)',
                              color: 'var(--wk-accent)',
                              border: '1px solid var(--wk-accent-ring)',
                            }}
                          >
                            <Check className="h-4 w-4" />
                          </span>
                          <div>
                            <div
                              className="text-sm font-semibold"
                              style={{ color: 'var(--wk-text)' }}
                            >
                              {selectedVessel.name}
                            </div>
                            <div
                              className="text-xs"
                              style={{ color: 'var(--wk-text-muted)' }}
                            >
                              {vesselTypes.find(
                                (t) => t.value === selectedVessel.type,
                              )?.label || selectedVessel.type}
                              {selectedVessel.officialNumber
                                ? ` · ${selectedVessel.officialNumber}`
                                : ''}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={handleCreateNewVessel}
                          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-opacity hover:opacity-80"
                          style={{ color: 'var(--wk-accent-strong)' }}
                        >
                          <X className="h-3 w-3" />
                          Change
                        </button>
                      </div>
                    ) : null}
                  </FormItem>
                )}
              />

              {!selectedVessel ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="vesselType"
                    render={({ field, fieldState }) => (
                      <FormItem className="space-y-1.5">
                        <FormLabel className={wkLabelCls}>
                          Vessel type
                        </FormLabel>
                        <FormControl>
                          <select
                            aria-invalid={fieldState.invalid || undefined}
                            className={`${wkInputCls} wk-select`}
                            value={field.value ?? ''}
                            onChange={(e) =>
                              field.onChange(e.target.value || undefined)
                            }
                            onBlur={field.onBlur}
                            name={field.name}
                            ref={field.ref}
                          >
                            <option value="" disabled>
                              Select vessel type
                            </option>
                            {vesselTypes.map((t) => (
                              <option key={t.value} value={t.value}>
                                {t.label}
                              </option>
                            ))}
                          </select>
                        </FormControl>
                        <FormMessage className="wk-error" />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="officialNumber"
                    render={({ field, fieldState }) => (
                      <FormItem className="space-y-1.5">
                        <FormLabel className={wkLabelCls}>
                          Official number{' '}
                          <span
                            className="font-normal normal-case"
                            style={{ color: 'var(--wk-text-muted)' }}
                          >
                            (optional)
                          </span>
                        </FormLabel>
                        <FormControl>
                          <input
                            placeholder="e.g. IMO 1234567"
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
              ) : null}
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
