
'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { useSupabase, useUser } from '@/supabase';
import { Loader2 } from 'lucide-react';
import LogoOnboarding from '@/components/logo-onboarding';
import { getUserProfile, updateUserProfile } from '@/supabase/database/queries';
import type { UserProfile } from '@/lib/types';

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
        if (userProfile.role === 'vessel' || userProfile.role === 'admin') {
          router.push('/dashboard/crew');
        } else {
        if (userProfile.subscriptionStatus === 'active') {
                router.push('/dashboard');
            } else {
                router.push('/offers');
        }
      }
    } catch (error) {
      console.error("Failed to fetch user profile for redirection:", error);
      router.push('/dashboard'); // Fallback redirect
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
        // Handle specific error cases
        if (error.message.includes('Invalid login credentials')) {
          toast({
            title: 'Login Failed',
            description: 'Invalid email or password. Please check your credentials and try again.',
            variant: 'destructive',
          });
        } else if (error.message.includes('Email not confirmed')) {
          toast({
            title: 'Email Not Verified',
            description: 'Please check your email and verify your account before signing in.',
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
            description: error.message || 'An error occurred during login. Please try again.',
            variant: 'destructive',
          });
        }
        return;
      }

      // Success - user is now authenticated
      // Ensure user profile exists in users table (fallback if trigger/callback didn't create it)
      if (authData.user) {
        try {
          // Check if user profile exists
          const userProfile = await getUserProfile(supabase, authData.user.id);
          console.log('[LOGIN] User profile found:', userProfile);
        } catch (profileError: any) {
          // Profile doesn't exist - create it
          console.log('[LOGIN] User profile not found, creating it...');
          try {
            await updateUserProfile(supabase, authData.user.id, {
              email: authData.user.email || '',
              username: authData.user.user_metadata?.username || `user_${authData.user.id.slice(0, 8)}`,
              subscriptionTier: 'free',
              subscriptionStatus: 'inactive',
            });
            console.log('[LOGIN] User profile created successfully');
          } catch (createError: any) {
            console.error('[LOGIN] Error creating user profile:', createError);
            // Don't block login if profile creation fails, but log it
            toast({
              title: 'Login Successful',
              description: 'Logged in successfully, but there was an issue with your profile. Please contact support if you experience any issues.',
              variant: 'default',
            });
            return; // Return early so useEffect handles redirect
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
        description: error.message || 'An unexpected error occurred. Please try again.',
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
            <CardTitle className="font-headline text-2xl">Welcome Back</CardTitle>
            <CardDescription>Sign in to access your dashboard.</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleLogin)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input placeholder="you@example.com" {...field} className="rounded-lg" />
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
                        <Input type="password" placeholder="••••••••" {...field} className="rounded-lg" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full rounded-lg" disabled={isLoading} variant="default">
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Sign In
                </Button>
              </form>
            </Form>

            <div className="mt-6 space-y-2">
              <p className="text-center text-sm text-muted-foreground">
              Don't have an account?{' '}
              <Link href="/signup" className="font-medium text-primary hover:underline">
                Sign up
              </Link>
            </p>
              <p className="text-center text-sm">
                <Link href="/forgot-password" className="text-muted-foreground hover:text-primary hover:underline">
                  Forgot your password?
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
