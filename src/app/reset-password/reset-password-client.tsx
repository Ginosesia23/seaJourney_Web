// app/reset-password/reset-password-client.tsx
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
    const checkSession = async () => {
      // 1) See if Supabase already has an active recovery session
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session) {
        setIsValidSession(true);
        return;
      }

      // 2) Otherwise, try to verify the hash token from the URL
      const hashParams = window.location.hash; // e.g. #access_token=...&type=recovery
      if (hashParams) {
        const tokenHash = hashParams.split('access_token=')[1]?.split('&')[0];

        if (!tokenHash) {
          setIsValidSession(false);
          toast({
            title: 'Invalid Link',
            description:
              'This password reset link is invalid or has expired. Please request a new one.',
            variant: 'destructive',
          });
          return;
        }

        const { data, error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: 'recovery',
        });

        if (error || !data.session) {
          setIsValidSession(false);
          toast({
            title: 'Invalid Link',
            description:
              'This password reset link is invalid or has expired. Please request a new one.',
            variant: 'destructive',
          });
        } else {
          setIsValidSession(true);
        }
      } else {
        setIsValidSession(false);
      }
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
