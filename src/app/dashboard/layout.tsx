
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
  const [isVerifying, setIsVerifying] = useState(false);

  const userProfileRef = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return doc(firestore, 'users', user.uid);
  }, [firestore, user?.uid]);

  const { data: userProfile, isLoading: isProfileLoading, forceRefetch } = useDoc<UserProfile>(userProfileRef);

  useEffect(() => {
    const sessionId = searchParams.get('session_id');
    if (sessionId && !isVerifying) {
      setIsVerifying(true);
      verifyCheckoutSession(sessionId)
        .then(result => {
          if (result.success) {
            toast({
              title: 'Purchase Successful!',
              description: 'Your subscription has been activated.',
            });
            // Force a refetch of the user profile to get the new subscription status
            forceRefetch();
            // Clean the URL
            router.replace('/dashboard', { scroll: false });
          } else {
             toast({
              title: 'Verification Failed',
              description: 'There was an issue verifying your payment. Please contact support.',
              variant: 'destructive'
            });
          }
        })
        .finally(() => {
          setIsVerifying(false);
        });
    }
  }, [searchParams, isVerifying, toast, forceRefetch, router]);

  const hasActiveSubscription = userProfile?.subscriptionStatus === 'active';
  const isLoading = isUserLoading || isProfileLoading || isVerifying;
  
  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (!user) {
      router.push('/login');
      return;
    }
    
    // If user has no active entitlements, force them to /offers (except when already there)
    if (!hasActiveSubscription && pathname !== '/offers') {
      router.push('/offers');
      return;
    }

    // Redirect vessel/admin to crew dashboard root
    if (
      userProfile &&
      (userProfile.role === 'vessel' || userProfile.role === 'admin') &&
      pathname === '/dashboard'
    ) {
      router.push('/dashboard/crew');
    }
  }, [
    user,
    isLoading,
    hasActiveSubscription,
    pathname,
    userProfile,
    router,
  ]);

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
            !isMapPage && 'gap-4 bg-background p-4 md:gap-8 md:p-8'
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
