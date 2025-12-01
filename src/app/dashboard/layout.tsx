'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';
import DashboardHeader from '@/components/layout/dashboard-header';
import DashboardSidebar from '@/components/layout/dashboard-sidebar';
import { cn } from '@/lib/utils';
import { useTheme } from 'next-themes';
import type { UserProfile } from '@/lib/types';
import { verifyCheckoutSession } from '@/app/actions';
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

  // 🔐 Read profile from: users/{uid}/profile/{uid}
  const userProfileRef = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return doc(firestore, 'users', user.uid, 'profile', user.uid);
  }, [firestore, user?.uid]);

  const {
    data: userProfile,
    isLoading: isProfileLoading,
    forceRefetch,
  } = useDoc<UserProfile>(userProfileRef);

  // 🔄 Handle Stripe checkout verification when session_id is present
  useEffect(() => {
    if (!sessionId) {
      setIsVerifying(false);
      return;
    }

    setIsVerifying(true);
    console.log('[CLIENT] Starting checkout verification for session ID:', sessionId);

    verifyCheckoutSession(sessionId)
      .then(result => {
        console.log('[CLIENT] verifyCheckoutSession result:', result);

        if (result.success) {
          toast({
            title: 'Purchase Successful!',
            description: 'Your subscription has been activated.',
          });

          // Refetch profile so subscriptionStatus / subscriptionTier update
          forceRefetch?.();

          // Clean the URL (remove ?session_id=...)
          router.replace('/dashboard', { scroll: false });
        } else {
          toast({
            title: 'Verification Failed',
            description:
              result.errorMessage ||
              'There was an issue verifying your payment. Please contact support.',
            variant: 'destructive',
          });

          router.replace('/offers', { scroll: false });
        }
      })
      .catch(err => {
        console.error('[CLIENT] Error in verifyCheckoutSession:', err);
        toast({
          title: 'Verification Failed',
          description: 'Unexpected error while verifying your payment. Please try again.',
          variant: 'destructive',
        });
        router.replace('/offers', { scroll: false });
      })
      .finally(() => {
        setIsVerifying(false);
      });
  }, [sessionId, toast, forceRefetch, router]);

  const hasActiveSubscription = userProfile?.subscriptionStatus === 'active';
  const isLoading = isUserLoading || isProfileLoading || isVerifying;

  // 🔐 Access control + redirects
  useEffect(() => {
    if (isLoading) return;

    // Not logged in → go to login
    if (!user) {
      router.push('/login');
      return;
    }

    // If no active sub and not currently on /offers, send to /offers
    if (!hasActiveSubscription && pathname !== '/offers') {
      router.push('/offers');
      return;
    }

    // Redirect vessel/admin roles to crew dashboard root
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

  // Safety gate in render as well (in case redirect hasn't happened yet)
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
