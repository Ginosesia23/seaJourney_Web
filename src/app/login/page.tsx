
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
import { useAuth } from '@/firebase';
import { signInWithEmailAndPassword, signInAnonymously, AuthError, User } from 'firebase/auth';
import { Loader2 } from 'lucide-react';
import LogoOnboarding from '@/components/logo-onboarding';
import { useRevenueCat } from '@/components/providers/revenue-cat-provider';
import Purchases from '@revenuecat/purchases-js';


const loginSchema = z.object({
  email: z.string().email({ message: 'Please enter a valid email address.' }),
  password: z.string().min(1, { message: 'Password is required.' }),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [isAnonymousLoading, setIsAnonymousLoading] = useState(false);
  const auth = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const { isReady: isRevenueCatReady } = useRevenueCat();

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });
  
  const checkSubscriptionAndRedirect = async (user: User) => {
      try {
        const purchases = new Purchases(process.env.NEXT_PUBLIC_REVENUECAT_PUBLIC_API_KEY!, user.uid);
        const customerInfo = await purchases.getCustomerInfo();
        const hasActiveSubscription = customerInfo?.activeSubscriptions?.length > 0;

        if (hasActiveSubscription) {
            router.push('/dashboard');
        } else {
            router.push('/coming-soon');
        }
      } catch (error) {
        console.error("Failed to check subscription status:", error);
        // Default to dashboard on error, layout will handle redirect if needed
        router.push('/dashboard');
      }
  };

  const handleLogin = async (data: LoginFormValues) => {
    if (!auth) return;
    setIsLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, data.email, data.password);
      await checkSubscriptionAndRedirect(userCredential.user);
    } catch (error) {
      const authError = error as AuthError;
      console.error('Login failed:', authError);
      let errorMessage = 'An unknown error occurred.';
      if (authError.code === 'auth/user-not-found' || authError.code === 'auth/wrong-password' || authError.code === 'auth/invalid-credential') {
        errorMessage = 'Invalid email or password. Please try again.';
      }
      toast({
        title: 'Login Failed',
        description: errorMessage,
        variant: 'destructive',
      });
      setIsLoading(false);
    }
  };

  const handleAnonymousLogin = async () => {
    if (!auth) return;
    setIsAnonymousLoading(true);
    try {
      const userCredential = await signInAnonymously(auth);
      await checkSubscriptionAndRedirect(userCredential.user);
    } catch (error) {
      const authError = error as AuthError;
      console.error('Anonymous login failed:', authError);
      toast({
        title: 'Login Failed',
        description: 'Could not sign in anonymously. Please try again later.',
        variant: 'destructive',
      });
      setIsAnonymousLoading(false);
    }
  };

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
                <Button type="submit" className="w-full rounded-lg" disabled={isLoading || !isRevenueCatReady} variant="default">
                  {(isLoading || !isRevenueCatReady) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Sign In
                </Button>
              </form>
            </Form>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-header px-2 text-muted-foreground">Or continue with</span>
              </div>
            </div>

            <Button variant="outline" className="w-full rounded-lg" onClick={handleAnonymousLogin} disabled={isAnonymousLoading || !isRevenueCatReady}>
              {(isAnonymousLoading || !isRevenueCatReady) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sign In Anonymously
            </Button>
            
            <p className="mt-6 text-center text-sm text-muted-foreground">
              Don't have an account?{' '}
              <Link href="/signup" className="font-medium text-primary hover:underline">
                Sign up
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
