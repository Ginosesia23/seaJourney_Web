'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';
import DashboardHeader from '@/components/layout/dashboard-header';
import DashboardSidebar from '@/components/layout/dashboard-sidebar';
import { cn } from '@/lib/utils';
import { useTheme } from 'next-themes';
import type { UserProfile } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';


function DashboardContent({ children }: { children: React.ReactNode }) {
  const { user, isUserLoading } = useUser();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { theme } = useTheme();
  const firestore = useFirestore();
  const { toast } = useToast();

  const sessionId = searchParams.get('session_id');
  const [isVerifying, setIsVerifying] = useState<boolean>(!!sessionId);
  
  // Read from /users/{uid}/profile/{uid}
  const userProfileRef = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return doc(firestore, 'users', user.uid, 'profile', user.uid);
  }, [firestore, user?.uid]);

  const {
    data: userProfile,
    isLoading: isProfileLoading,
    forceRefetch,
  } = useDoc<UserProfile>(userProfileRef);

  // 🔄 Stripe checkout verification using the API route
// inside DashboardContent


// ...
useEffect(() => {
  const run = async () => {
    if (!sessionId) {
      setIsVerifying(false);
      return;
    }

    // We need Firestore and the logged-in user to update their profile
    if (!firestore || !user?.uid) {
      console.warn('[CLIENT] Missing firestore or user, skipping subscription update');
      setIsVerifying(false);
      return;
    }

    try {
      setIsVerifying(true);
      console.log('[CLIENT] Starting checkout verification for session ID:', sessionId);

      const res = await fetch('/api/stripe/verify-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });

      const result = await res.json();
      console.log('[CLIENT] verify-checkout-session result:', result);


// ...

      if (result.success) {
        const tier = result.tier ?? 'premium';

        try {
          const profileRef = doc(firestore, 'users', user.uid, 'profile', user.uid);
          console.log(
            '[CLIENT] Writing subscription to Firestore at:',
            profileRef.path,
            {
              subscriptionStatus: 'active',
              subscriptionTier: tier,
            },
          );

          await setDoc(
            profileRef,
            {
              subscriptionStatus: 'active',
              subscriptionTier: tier,
            },
            { merge: true },
          );

          console.log('[CLIENT] Firestore subscription update COMPLETE');

          toast({
            title: 'Purchase Successful!',
            description: 'Your subscription has been activated.',
          });

          forceRefetch?.();
          router.replace('/dashboard', { scroll: false });
        } catch (firestoreError: any) {
          console.error('[CLIENT] Firestore write FAILED:', firestoreError);
          toast({
            title: 'Subscription saved in Stripe, but Firestore update failed',
            description: firestoreError?.message || 'Check Firestore rules and path.',
            variant: 'destructive',
          });
        }
      }
      else {
        toast({
          title: 'Verification Failed',
          description:
            result.errorMessage ||
            'There was an issue verifying your payment. Please contact support.',
          variant: 'destructive',
        });
        router.replace('/offers', { scroll: false });
      }
    } catch (err: any) {
      console.error('[CLIENT] Error calling verify-checkout-session API:', err);
      toast({
        title: 'Verification Failed',
        description: 'Unexpected error while verifying your payment. Please try again.',
        variant: 'destructive',
      });
      router.replace('/offers', { scroll: false });
    } finally {
      setIsVerifying(false);
    }
  };

  run();
}, [sessionId, firestore, user?.uid, toast, forceRefetch, router]);


  const hasActiveSubscription = userProfile?.subscriptionStatus === 'active';
  const isLoading = isUserLoading || isProfileLoading || isVerifying;

  // Access control
  useEffect(() => {
    if (isLoading) return;

    if (!user) {
      router.push('/login');
      return;
    }

    if (!hasActiveSubscription && pathname !== '/offers') {
      router.push('/offers');
      return;
    }

    if (
      userProfile &&
      (userProfile.role === 'vessel' || userProfile.role === 'admin') &&
      (pathname === '/dashboard' || pathname === '/')
    ) {
      router.push('/dashboard/crew');
    }
  }, [user, isLoading, hasActiveSubscription, pathname, userProfile, router]);

  const isMapPage = pathname === '/dashboard/world-map';

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        {isVerifying && <p className="ml-4">Verifying your purchase...</p>}
      </div>
    );
  }

  if (!user || (!hasActiveSubscription && pathname !== '/offers')) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className={cn('theme-dashboard flex h-screen w-full flex-col', theme === 'dark' ? 'dark' : '')}>
      <DashboardHeader userProfile={userProfile} />
      <div className="flex flex-1 overflow-hidden">
        <DashboardSidebar userProfile={userProfile} />
        <main
          className={cn(
            'flex-1 overflow-y-auto',
            !isMapPage && 'gap-4 bg-background p-4 md:gap-8 md:p-8',
          )}
        >
          {children}
        </main>
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <DashboardContent>{children}</DashboardContent>;
}
