
'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { useAuth, errorEmitter, FirestorePermissionError, useUser } from '@/firebase';
import { createUserWithEmailAndPassword, updateProfile, AuthError } from 'firebase/auth';
import { Loader2 } from 'lucide-react';
import { doc, setDoc } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import LogoOnboarding from '@/components/logo-onboarding';
import { useRevenueCat } from '@/components/providers/revenue-cat-provider';

const signupSchema = z.object({
  username: z.string().min(3, { message: 'Username must be at least 3 characters long.' }),
  email: z.string().email({ message: 'Please enter a valid email.' }),
  password: z.string().min(8, { message: 'Password must be at least 8 characters long.' }),
});

type SignupFormValues = z.infer<typeof signupSchema>;

export default function SignupPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingUser, setIsCheckingUser] = useState(true);

  const auth = useAuth();
  const firestore = useFirestore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { user, isUserLoading } = useUser();
  const { customerInfo, isReady: isRevenueCatReady } = useRevenueCat();

  const form = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { username: '', email: '', password: '' },
  });

  useEffect(() => {
    // Wait until both Firebase auth and RevenueCat are ready
    if (isUserLoading || !isRevenueCatReady) {
      return;
    }

    if (user) {
      // User is logged in, decide where to redirect
      const hasActiveSubscription = customerInfo?.activeSubscriptions?.length > 0;
      if (hasActiveSubscription) {
        router.push('/dashboard');
      } else {
        router.push('/offers');
      }
    } else {
      // User is not logged in, show the signup page
      setIsCheckingUser(false);
    }
  }, [user, isUserLoading, customerInfo, isRevenueCatReady, router]);

  const handleSignup = async (data: SignupFormValues) => {
    if (!auth || !firestore) return;
    setIsLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, data.email, data.password);
      const user = userCredential.user;

      // Update Firebase Auth profile
      await updateProfile(user, { displayName: data.username });

      // Create user profile in Firestore
      const userProfileRef = doc(firestore, 'users', user.uid, 'profile', user.uid);
      const profileData = {
        id: user.uid,
        email: user.email,
        username: data.username,
        firstName: '',
        lastName: '',
        registrationDate: new Date().toISOString(),
        role: 'crew', // Assign default role
        subscriptionTier: 'free',
        subscriptionStatus: 'inactive',
      };
      
      await setDoc(userProfileRef, profileData);

      const redirectUrl = searchParams.get('redirect') || '/offers';
      router.push(redirectUrl);

    } catch (error) {
      const authError = error as AuthError;
      console.error('Signup failed:', authError);
      
      if (authError.code === 'auth/email-already-in-use') {
        toast({
          title: 'Signup Failed',
          description: 'This email is already in use. Please try another one or log in.',
          variant: 'destructive',
        });
      } else if (authError.code) {
        const userProfileRef = doc(firestore, 'users', 'dummy-uid-for-error', 'profile', 'dummy-uid-for-error');
        const permissionError = new FirestorePermissionError({
            path: userProfileRef.path,
            operation: 'create',
            requestResourceData: { email: data.email, username: data.username, role: 'crew' }
          });
        errorEmitter.emit('permission-error', permissionError);
      }
       else {
        toast({
          title: 'Signup Failed',
          description: 'An unknown error occurred during sign-up.',
          variant: 'destructive',
        });
      }
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
            <CardTitle className="font-headline text-2xl">Create an Account</CardTitle>
            <CardDescription>Join SeaJourney and start tracking your sea time.</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSignup)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Username</FormLabel>
                      <FormControl>
                        <Input placeholder="yourusername" {...field} className="rounded-lg" />
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
                        <Input type="email" placeholder="you@example.com" {...field} className="rounded-lg" />
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
                <Button type="submit" className="w-full rounded-lg" disabled={isLoading}>
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Sign Up
                </Button>
              </form>
            </Form>
            <p className="mt-6 text-center text-sm text-muted-foreground">
              Already have an account?{' '}
              <Link href="/login" className="font-medium text-primary hover:underline">
                Sign in
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
