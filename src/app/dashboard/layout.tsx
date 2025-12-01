'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useUser } from '@/supabase';
import { useDoc } from '@/supabase/database';
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

  const {
    data: userProfile,
    isLoading: isProfileLoading,
  } = useDoc<UserProfile>('users', user?.id);


  const hasActiveSubscription = userProfile?.subscriptionStatus === 'active';
  const isLoading = isUserLoading || isProfileLoading;

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
