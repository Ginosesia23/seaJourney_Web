
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
import { useRevenueCat } from '@/components/providers/revenue-cat-provider';

interface UserProfile {
  subscriptionTier: 'free' | 'premium' | 'premium-plus' | 'professional';
  role: 'crew' | 'vessel' | 'admin';
}

function DashboardContent({ children }: { children: React.ReactNode }) {
  const { user, isUserLoading } = useUser();
  const router = useRouter();
  const pathname = usePathname();
  const { theme } = useTheme();
  const firestore = useFirestore();
  const { customerInfo, isReady: isRevenueCatReady, offerings } = useRevenueCat();

  const userProfileRef = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return doc(firestore, 'users', user.uid, 'profile', user.uid);
  }, [firestore, user?.uid]);

  const { data: userProfile, isLoading: isProfileLoading } = useDoc<UserProfile>(userProfileRef);

  useEffect(() => {
    if (isUserLoading || !isRevenueCatReady || isProfileLoading) {
      return;
    }

    if (!user) {
      router.push('/login');
      return;
    }
    
    // Get a list of all entitlement identifiers from all available packages
    const allEntitlementIds = offerings ? Object.values(offerings.all).flatMap(o => 
        o.availablePackages.map(p => p.product.identifier)
    ) : [];

    // Check if the user has any active entitlement that we offer
    const hasActiveOfferedEntitlement = allEntitlementIds.some(id => 
        customerInfo?.entitlements.active[id]
    );

    if (!hasActiveOfferedEntitlement && pathname !== '/offers') {
        router.push('/offers');
        return;
    }
    
    if (userProfile && (userProfile.role === 'vessel' || userProfile.role === 'admin') && pathname === '/dashboard') {
        router.push('/dashboard/crew');
    }


  }, [user, isUserLoading, customerInfo, isRevenueCatReady, offerings, router, pathname, userProfile, isProfileLoading]);

  const isMapPage = pathname === '/dashboard/world-map';
  const isLoading = isUserLoading || !isRevenueCatReady || isProfileLoading;
  
  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }
  
  const allEntitlementIds = offerings ? Object.values(offerings.all).flatMap(o => o.availablePackages.map(p => p.product.identifier)) : [];
  const hasActiveOfferedEntitlement = allEntitlementIds.some(id => customerInfo?.entitlements.active[id]);

  if (!user || (!hasActiveOfferedEntitlement && pathname !== '/offers')) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className={cn("theme-dashboard", theme === "dark" ? "dark" : "")}>
      <DashboardHeader userProfile={userProfile} />
      <div
        className={cn(
          "grid min-h-[calc(100vh-4rem)] flex-1 transition-[grid-template-columns] duration-300 ease-in-out",
          isMapPage ? "lg:grid-cols-[80px_1fr]" : "lg:grid-cols-[240px_1fr]"
        )}
      >
        <DashboardSidebar isCollapsed={isMapPage} userProfile={userProfile} />
        <main className={cn(
            "flex flex-1 flex-col", 
            !isMapPage && "gap-4 bg-background p-4 md:gap-8 md:p-8"
        )}>
          {children}
        </main>
      </div>
    </div>
  );
}


export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  // RevenueCatProvider is now in the root layout, so it's not needed here.
  return <DashboardContent>{children}</DashboardContent>;
}
