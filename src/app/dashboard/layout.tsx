'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useUser, useSupabase } from '@/supabase';
import { useDoc } from '@/supabase/database';
import { hasActiveSubscription as checkActiveSubscription } from '@/supabase/database/subscription-helpers';
import { useFeatureFlags } from '@/hooks/use-feature-flags';
import { Loader2 } from 'lucide-react';
import { AppSidebar } from '@/components/app-sidebar';
import { SiteHeader } from '@/components/site-header';
import {
  SidebarInset,
  SidebarProvider,
} from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';
import { useTheme } from 'next-themes';
import type { UserProfile } from '@/lib/types';


function DashboardContent({ children }: { children: React.ReactNode }) {
  const { user, isUserLoading } = useUser();
  const { supabase } = useSupabase();
  const router = useRouter();
  const pathname = usePathname();
  const { theme } = useTheme();
  const redirectingRef = useRef(false);
  const expiredCompRef = useRef(false);
  const {
    isRouteEnabled,
    isLoading: isFlagsLoading,
    isAdmin,
  } = useFeatureFlags();

  const {
    data: userProfile,
    isLoading: isProfileLoading,
  } = useDoc<UserProfile>('users', user?.id);


  // Check subscription status using helper function
  // This ensures we're reading from the correct Supabase field (subscription_status)
  const hasActiveSubscription = checkActiveSubscription(userProfile);
  const isLoading = isUserLoading || isProfileLoading;

  useEffect(() => {
    if (!user || !userProfile || expiredCompRef.current) return;
    const stripeId = (userProfile as { stripe_subscription_id?: string | null })
      .stripe_subscription_id;
    const periodEnd = (userProfile as { current_period_end?: string | null })
      .current_period_end;
    if (stripeId || !periodEnd) return;
    if (new Date(periodEnd).getTime() > Date.now()) return;
    expiredCompRef.current = true;
    void (async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      await fetch('/api/users/expire-comp-grant', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    })();
  }, [user, userProfile, supabase]);
  
  // Debug: Log the actual data structure to verify we're reading correctly
useEffect(() => {
    if (userProfile && user) {
      const rawStatus = (userProfile as any).subscription_status;
      const camelStatus = (userProfile as any).subscriptionStatus;
      console.log('[DASHBOARD] Subscription Check:', {
        userId: user.id,
        allKeys: Object.keys(userProfile),
        raw_subscription_status: rawStatus,
        camelCase_subscriptionStatus: camelStatus,
        hasActiveSubscription,
        pathname,
      });
    }
  }, [userProfile, user, hasActiveSubscription, pathname]);

  // Access control
  useEffect(() => {
    // Prevent multiple redirects
    if (redirectingRef.current) return;
    
    if (isLoading) return;

    if (!user) {
      router.push('/login');
      return;
    }

    // Only redirect to offers if:
    // 1. User doesn't have active subscription (check both field names to be sure)
    // 2. We're actually in the dashboard routes (not on offers page)
    // 3. We're not already on /offers
    // 4. We have the user profile data loaded (to avoid false negatives)
    if (
      userProfile && // Make sure we have profile data
      !hasActiveSubscription && 
      pathname.startsWith('/dashboard') &&
      pathname !== '/offers'
    ) {
      console.log('[DASHBOARD] Redirecting to offers - subscription not active', {
        raw_subscription_status: (userProfile as any).subscription_status,
        hasActiveSubscription,
        pathname,
      });
      redirectingRef.current = true;
      router.replace('/offers');
      return;
    }
    
    // If subscription is active, allow access to dashboard
    if (hasActiveSubscription) {
      redirectingRef.current = false; // Reset redirect flag if subscription is active
    }

    // Vessel managers can now see the dashboard summary (no redirect)
    // They can navigate to crew page if needed
  }, [user, isLoading, hasActiveSubscription, pathname, userProfile, router]);

  // Platform feature flags: hide disabled product routes for non-admins.
  // Sidebar already omits the links; this covers typed/bookmarked URLs.
  useEffect(() => {
    if (isLoading || isFlagsLoading || isAdmin) return;
    if (!user || !hasActiveSubscription) return;
    if (pathname === '/dashboard') return;
    if (!isRouteEnabled(pathname)) {
      router.replace('/dashboard');
    }
  }, [
    isLoading,
    isFlagsLoading,
    isAdmin,
    user,
    hasActiveSubscription,
    pathname,
    isRouteEnabled,
    router,
  ]);

  const isMapPage =
    pathname === '/dashboard/world-map' || pathname === '/dashboard/passages-map';

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

  // Avoid flashing a disabled feature page before redirect.
  if (
    !isAdmin &&
    !isFlagsLoading &&
    pathname !== '/dashboard' &&
    !isRouteEnabled(pathname)
  ) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "16.5rem",
          "--header-height": "4rem",
        } as React.CSSProperties
      }
    >
      <AppSidebar variant="inset" userProfile={userProfile} />
      <SidebarInset className="flex flex-col h-svh overflow-hidden">
        <SiteHeader className="shrink-0" userProfile={userProfile} />
        <div
          className={cn(
            'flex-1 flex flex-col min-h-0 overflow-hidden',
            isMapPage ? 'bg-[#070e1a]' : 'bg-content-background',
          )}
        >
          <div className={cn(
            'flex-1 overflow-y-auto overscroll-contain',
            !isMapPage && 'px-8 py-4',
            isMapPage && 'h-full'
          )}>
            {children}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <DashboardContent>{children}</DashboardContent>;
}