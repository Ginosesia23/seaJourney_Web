'use client';

import { Suspense, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
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
import { useSupabase, useUser } from '@/supabase';
import { Loader2 } from 'lucide-react';
import LogoOnboarding from '@/components/logo-onboarding';

const signupSchema = z.object({
  username: z
    .string()
    .min(3, { message: 'Username must be at least 3 characters long.' }),
  email: z.string().email({ message: 'Please enter a valid email.' }),
  password: z
    .string()
    .min(8, { message: 'Password must be at least 8 characters long.' }),
});

type SignupFormValues = z.infer<typeof signupSchema>;

// Inner component that actually uses hooks like useSearchParams
function SignupPageInner() {
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingUser, setIsCheckingUser] = useState(true);

  const { supabase } = useSupabase();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { user, isUserLoading } = useUser();

  // Optional redirect + plan (e.g. /signup?redirect=/offers&plan=premium)
  const redirectParam = searchParams.get('redirect');
  const planParam = searchParams.get('plan');

  const form = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { username: '', email: '', password: '' },
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
      // Local password check (zod also enforces)
      if (data.password.length < 8) {
        toast({
          title: 'Weak Password',
          description: 'Password must be at least 8 characters long.',
          variant: 'destructive',
        });
        setIsLoading(false);
        return;
      }

      // Create auth user
      const { data: authData, error: authError } =
        await supabase.auth.signUp({
          email: data.email,
          password: data.password,
          options: {
            data: {
              username: data.username,
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

      // Create / upsert user profile
      const { error: profileError } = await supabase
        .from('users')
        .upsert(
          {
            id: authData.user.id,
            email: data.email,
            username: data.username,
            first_name: '',
            last_name: '',
            registration_date: new Date().toISOString(),
            role: 'crew',
            subscription_tier: 'free',
            subscription_status: 'inactive',
          },
          {
            onConflict: 'id',
          },
        );

      if (profileError) {
        console.error('Profile creation error:', profileError);
        toast({
          title: 'Account Created',
          description:
            'Your account was created, but there was an issue with your profile. Please contact support if you experience any issues.',
          variant: 'default',
        });
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
          title: 'Account Created!',
          description:
            'Welcome to SeaJourney! Your account has been successfully created.',
        });

        // Decide where to send them next
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
      <div className="relative w-full max-w-md p-1 border border-primary/20 rounded-xl bg-black/20 backdrop-blur-sm">
        <div className="absolute -top-px -left-px h-4 w-4 border-t-2 border-l-2 border-accent rounded-tl-xl"></div>
        <div className="absolute -top-px -right-px h-4 w-4 border-t-2 border-r-2 border-accent rounded-tr-xl"></div>
        <div className="absolute -bottom-px -left-px h-4 w-4 border-b-2 border-l-2 border-accent rounded-bl-xl"></div>
        <div className="absolute -bottom-px -right-px h-4 w-4 border-b-2 border-r-2 border-accent rounded-br-xl"></div>

        <Card className="w-full border-none bg-transparent text-card-foreground shadow-none rounded-xl">
          <CardHeader className="text-center">
            <CardTitle className="font-headline text-2xl">
              Create an Account
            </CardTitle>
            <CardDescription>
              Join SeaJourney and start tracking your sea time.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(handleSignup)}
                className="space-y-4"
              >
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Username</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="yourusername"
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
                <Button
                  type="submit"
                  className="w-full rounded-lg"
                  disabled={isLoading}
                >
                  {isLoading && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Sign Up
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
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Default export: wrap the inner component in Suspense so useSearchParams is safe
export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <div className="dark animated-gradient-background flex min-h-screen flex-col items-center justify-center">
          <Loader2 className="h-12 w-12 animate-spin text-white" />
        </div>
      }
    >
      <SignupPageInner />
    </Suspense>
  );
}
