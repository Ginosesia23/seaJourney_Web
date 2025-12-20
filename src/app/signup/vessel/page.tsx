'use client';

import { Suspense, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
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
import { SearchableSelect } from '@/components/ui/searchable-select';
import { useToast } from '@/hooks/use-toast';
import { useSupabase, useUser } from '@/supabase';
import { Loader2, Ship } from 'lucide-react';
import LogoOnboarding from '@/components/logo-onboarding';
import { vesselTypes, vesselTypeValues } from '@/lib/vessel-types';

const vesselSignupSchema = z.object({
  vesselId: z.string().optional(), // If vessel exists, use this ID
  vesselName: z
    .string()
    .min(2, { message: 'Vessel name must be at least 2 characters long.' }),
  vesselType: z.enum(vesselTypeValues).optional(),
  officialNumber: z.string().optional(),
  email: z.string().email({ message: 'Please enter a valid email.' }),
  password: z
    .string()
    .min(8, { message: 'Password must be at least 8 characters long.' }),
}).refine((data) => {
  // If vesselId is not provided, vesselType is required
  if (!data.vesselId && !data.vesselType) {
    return false;
  }
  return true;
}, {
  message: 'Please select an existing vessel or provide vessel type to create a new one.',
  path: ['vesselType'],
});

type VesselSignupFormValues = z.infer<typeof vesselSignupSchema>;

interface VesselOption {
  id: string;
  name: string;
  type: string;
  officialNumber?: string;
}

// Inner component that actually uses hooks
function VesselSignupPageInner() {
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingUser, setIsCheckingUser] = useState(true);
  const [searchingVessels, setSearchingVessels] = useState(false);
  const [vesselOptions, setVesselOptions] = useState<VesselOption[]>([]);
  const [selectedVessel, setSelectedVessel] = useState<VesselOption | null>(null);

  const { supabase } = useSupabase();
  const router = useRouter();
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
    },
  });

  const vesselName = form.watch('vesselName');
  const vesselId = form.watch('vesselId');

  // Search for vessels when user types
  useEffect(() => {
    const searchVessels = async () => {
      if (!vesselName || vesselName.length < 2) {
        setVesselOptions([]);
        setSelectedVessel(null);
        form.setValue('vesselId', undefined);
        return;
      }

      // If a vessel is already selected and the name matches, don't search
      if (selectedVessel && selectedVessel.name.toLowerCase() === vesselName.toLowerCase()) {
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

    const timeoutId = setTimeout(searchVessels, 300); // Debounce
    return () => clearTimeout(timeoutId);
  }, [vesselName, selectedVessel, form]);

  const handleSelectExistingVessel = async (vessel: VesselOption) => {
    // Check if vessel already has a manager
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
            description: `This vessel is already being managed by another account. Please select a different vessel or create a new one.`,
            variant: 'destructive',
          });
          return; // Don't select the vessel
        }
      }
    } catch (error) {
      console.error('Error checking vessel manager:', error);
      // Continue anyway - we'll check again during signup
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
    // Keep the vesselName as typed
  };

  useEffect(() => {
    if (!isUserLoading) {
      if (user) {
        router.push('/dashboard');
      } else {
        setIsCheckingUser(false);
      }
    }
  }, [user, isUserLoading, router]);

  const handleSignup = async (data: VesselSignupFormValues) => {
    setIsLoading(true);
    try {
      // Local password check
      if (data.password.length < 8) {
        toast({
          title: 'Weak Password',
          description: 'Password must be at least 8 characters long.',
          variant: 'destructive',
        });
        setIsLoading(false);
        return;
      }

      // Step 1: Create auth user
      const { data: authData, error: authError } =
        await supabase.auth.signUp({
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

      // Step 2: Get or create vessel
      let vesselId: string;
      
      if (data.vesselId) {
        // Use existing vessel - first check if it already has a manager
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
              description: `This vessel is already being managed by another account. Please select a different vessel or create a new one.`,
              variant: 'destructive',
            });
            setIsLoading(false);
            return;
          }
        } else {
          // If check failed, still try to proceed but log the error
          console.error('Failed to check vessel manager status');
        }

        vesselId = data.vesselId;
        
        // Update is_official to true since vessel role user is taking control
        try {
          const updateResponse = await fetch('/api/vessels/update-official', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              vesselId: vesselId,
              isOfficial: true,
            }),
          });
          
          if (!updateResponse.ok) {
            const updateError = await updateResponse.json();
            console.error('[VESSEL SIGNUP] Error updating is_official:', updateError);
          } else {
            console.log('[VESSEL SIGNUP] Successfully updated is_official to true for vessel:', vesselId);
          }
        } catch (updateError) {
          console.error('[VESSEL SIGNUP] Error updating is_official:', updateError);
        }
      } else {
        // Create new vessel
        if (!data.vesselType) {
          toast({
            title: 'Vessel Type Required',
            description: 'Please select a vessel type or choose an existing vessel.',
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
            isOfficial: true, // Vessel role user creating/taking control
          }),
        });

        if (!vesselResponse.ok) {
          const vesselError = await vesselResponse.json();
          console.error('[VESSEL SIGNUP] Vessel creation error:', vesselError);
          toast({
            title: 'Vessel Creation Failed',
            description: vesselError.error || 'Failed to create vessel. Please try again.',
            variant: 'destructive',
          });
          setIsLoading(false);
          return;
        }

        const vesselData = await vesselResponse.json();
        vesselId = vesselData.vessel.id;
        
        // If vessel already existed, check if it has a manager
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
                description: `This vessel already exists and is being managed by another account. Please select it from the search results instead.`,
                variant: 'destructive',
              });
              setIsLoading(false);
              return;
            }
          }
        }
      }

      // Verify vessel doesn't already have a manager (double-check)
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
            description: `This vessel is already being managed by another account. Please try a different vessel.`,
            variant: 'destructive',
          });
          setIsLoading(false);
          return;
        }
      }

      // Step 3: Create user profile with role='vessel' and link to vessel
      try {
        const profileResponse = await fetch('/api/users/create-profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: authData.user.id,
            email: data.email,
            role: 'vessel', // Set role to 'vessel'
            activeVesselId: vesselId, // Link user to the vessel
          }),
        });

        const profileResult = await profileResponse.json();
        
        if (!profileResponse.ok) {
          console.error('[VESSEL SIGNUP] Profile creation API error:', profileResult);
          // Still continue - profile might be created by trigger
        } else {
          console.log('[VESSEL SIGNUP] User profile created successfully:', profileResult);
        }

        // Update active_vessel_id if not set by the API
        if (!profileResult.activeVesselId) {
          const { error: updateError } = await supabase
            .from('users')
            .update({ active_vessel_id: vesselId })
            .eq('id', authData.user.id);

          if (updateError) {
            console.error('[VESSEL SIGNUP] Error updating active_vessel_id:', updateError);
          }
        }
      } catch (profileError: any) {
        console.error('[VESSEL SIGNUP] Error calling profile creation API:', profileError);
        // Try to update active_vessel_id directly as fallback
        try {
          const { error: updateError } = await supabase
            .from('users')
            .update({ active_vessel_id: vesselId, role: 'vessel' })
            .eq('id', authData.user.id);
          
          if (updateError) {
            console.error('[VESSEL SIGNUP] Error updating user profile:', updateError);
          }
        } catch (updateError) {
          console.error('[VESSEL SIGNUP] Fallback update failed:', updateError);
        }
      }

      // Email confirmation flow
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
        router.push('/dashboard');
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
      <div className="dark animated-gradient-background flex min-h-screen flex-col items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-white" />
      </div>
    );
  }

  return (
    <div className="dark animated-gradient-background flex min-h-screen flex-col items-center justify-center px-4">
      <div className="mb-8">
        <LogoOnboarding />
      </div>
      <div className="relative w-full max-w-2xl p-1 border border-primary/20 rounded-xl bg-black/20 backdrop-blur-sm">
        <div className="absolute -top-px -left-px h-4 w-4 border-t-2 border-l-2 border-accent rounded-tl-xl"></div>
        <div className="absolute -top-px -right-px h-4 w-4 border-t-2 border-r-2 border-accent rounded-tr-xl"></div>
        <div className="absolute -bottom-px -left-px h-4 w-4 border-b-2 border-l-2 border-accent rounded-bl-xl"></div>
        <div className="absolute -bottom-px -right-px h-4 w-4 border-b-2 border-r-2 border-accent rounded-br-xl"></div>

        <Card className="w-full border-none bg-transparent text-card-foreground shadow-none rounded-xl">
          <CardHeader className="text-center">
            <div className="flex items-center justify-center mb-2">
              <Ship className="h-8 w-8 text-primary" />
            </div>
            <CardTitle className="font-headline text-2xl">
              Register Your Vessel
            </CardTitle>
            <CardDescription>
              Create a vessel account to track your vessel's sea time.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(handleSignup)}
                className="space-y-4"
              >
                {/* Vessel Information */}
                <div className="space-y-4 pb-4 border-b border-border/50">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    Vessel Information
                  </h3>
                  
                  <FormField
                    control={form.control}
                    name="vesselName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Vessel Name</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input
                              placeholder="Type vessel name to search or create new..."
                              {...field}
                              className="rounded-lg pr-10"
                            />
                            {searchingVessels && (
                              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                            )}
                          </div>
                        </FormControl>
                        <FormMessage />
                        
                        {/* Vessel search results */}
                        {!selectedVessel && vesselName && vesselName.length >= 2 && vesselOptions.length > 0 && (
                          <div className="mt-2 border rounded-lg bg-background shadow-lg z-10 max-h-60 overflow-y-auto">
                            <div className="p-2 border-b bg-muted/50">
                              <p className="text-xs font-medium text-muted-foreground">Existing Vessels - Click to Select</p>
                            </div>
                            {vesselOptions.map((vessel) => (
                              <button
                                key={vessel.id}
                                type="button"
                                onClick={() => handleSelectExistingVessel(vessel)}
                                className="w-full text-left px-4 py-3 hover:bg-accent hover:text-accent-foreground transition-colors border-b last:border-b-0"
                              >
                                <div className="font-medium">{vessel.name}</div>
                                <div className="text-sm text-muted-foreground">
                                  {vesselTypes.find(t => t.value === vessel.type)?.label || vessel.type}
                                  {vessel.officialNumber && ` · ${vessel.officialNumber}`}
                                </div>
                              </button>
                            ))}
                            <button
                              type="button"
                              onClick={handleCreateNewVessel}
                              className="w-full text-left px-4 py-3 hover:bg-accent hover:text-accent-foreground transition-colors border-t bg-muted/30"
                            >
                              <div className="font-medium text-primary">+ Create new vessel: "{vesselName}"</div>
                            </button>
                          </div>
                        )}
                        
                        {/* Show selected vessel */}
                        {selectedVessel && (
                          <div className="mt-2 p-3 border rounded-lg bg-muted/50">
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="font-medium">{selectedVessel.name}</div>
                                <div className="text-sm text-muted-foreground">
                                  {vesselTypes.find(t => t.value === selectedVessel.type)?.label || selectedVessel.type}
                                  {selectedVessel.officialNumber && ` · ${selectedVessel.officialNumber}`}
                                </div>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={handleCreateNewVessel}
                                className="text-xs"
                              >
                                Change
                              </Button>
                            </div>
                          </div>
                        )}
                      </FormItem>
                    )}
                  />
                  
                  {/* Only show vessel type if creating new vessel */}
                  {!selectedVessel && (
                    <FormField
                      control={form.control}
                      name="vesselType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Vessel Type</FormLabel>
                          <FormControl>
                            <SearchableSelect
                              options={vesselTypes}
                              value={field.value}
                              onValueChange={field.onChange}
                              placeholder="Select vessel type"
                              searchPlaceholder="Search vessel types..."
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                  
                  {/* Only show official number if creating new vessel */}
                  {!selectedVessel && (
                    <FormField
                      control={form.control}
                      name="officialNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Official Number (Optional)</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="e.g., IMO 1234567"
                              {...field}
                              className="rounded-lg"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>

                {/* Account Information */}
                <div className="space-y-4 pt-4">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    Account Information
                  </h3>
                  
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input
                            type="email"
                            placeholder="you@example.com"
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
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
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
                </div>
                
                <Button
                  type="submit"
                  className="w-full rounded-lg"
                  disabled={isLoading}
                >
                  {isLoading && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Register Vessel
                </Button>
              </form>
            </Form>
            <p className="mt-6 text-center text-sm text-muted-foreground">
              Already have an account?{' '}
              <Link
                href="/login"
                className="font-medium text-primary hover:underline"
              >
                Sign in
              </Link>
              {' · '}
              <Link
                href="/signup"
                className="font-medium text-primary hover:underline"
              >
                Crew signup
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Default export: wrap the inner component in Suspense
export default function VesselSignupPage() {
  return (
    <Suspense
      fallback={
        <div className="dark animated-gradient-background flex min-h-screen flex-col items-center justify-center">
          <Loader2 className="h-12 w-12 animate-spin text-white" />
        </div>
      }
    >
      <VesselSignupPageInner />
    </Suspense>
  );
}

