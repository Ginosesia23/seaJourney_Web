
'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';
import DashboardHeader from '@/components/layout/dashboard-header';
import DashboardSidebar from '@/components/layout/dashboard-sidebar';
import { cn } from '@/lib/utils';
import { useTheme } from 'next-themes';
import type { UserProfile } from '@/lib/types';


function DashboardContent({ children }: { children: React.ReactNode }) {
  const { user, isUserLoading } = useUser();
  const router = useRouter();
  const pathname = usePathname();
  const { theme } = useTheme();
  const firestore = useFirestore();

  const userProfileRef = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return doc(firestore, 'users', user.uid);
  }, [firestore, user?.uid]);

  const { data: userProfile, isLoading: isProfileLoading } =
    useDoc<UserProfile>(userProfileRef);


  const hasActiveSubscription = userProfile?.subscriptionStatus === 'active';

  useEffect(() => {
    if (isUserLoading || isProfileLoading) {
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
    isUserLoading,
    isProfileLoading,
    hasActiveSubscription,
    pathname,
    userProfile,
    router,
  ]);

  const isMapPage = pathname === '/dashboard/world-map';
  const isLoading = isUserLoading || isProfileLoading;

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
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
