
'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';
import DashboardHeader from '@/components/layout/dashboard-header';
import DashboardSidebar from '@/components/layout/dashboard-sidebar';
import { cn } from '@/lib/utils';
import { ThemeProvider, useTheme } from 'next-themes';
import { useRevenueCat } from '@/components/providers/revenue-cat-provider';

interface UserProfile {
  subscriptionTier: 'free' | 'premium' | 'premium-plus' | 'professional';
  role: 'crew' | 'vessel' | 'admin';
}

function DashboardLayoutContent({ children }: { children: React.ReactNode }) {
  const { user, isUserLoading } = useUser();
  const router = useRouter();
  const pathname = usePathname();
  const { theme } = useTheme();
  const firestore = useFirestore();
  const { customerInfo } = useRevenueCat();


  const userProfileRef = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return doc(firestore, 'users', user.uid, 'profile', user.uid);
  }, [firestore, user?.uid]);

  const { data: userProfile, isLoading: isProfileLoading } = useDoc<UserProfile>(userProfileRef);

  useEffect(() => {
    if (isUserLoading || isProfileLoading) return;

    if (!user) {
      router.push('/login');
      return;
    }

    const hasActiveSubscription = customerInfo?.activeSubscriptions?.length ?? 0 > 0;

    if (userProfile && userProfile.subscriptionTier === 'free' && !hasActiveSubscription) {
        router.push('/coming-soon');
        return;
    }

  }, [user, isUserLoading, userProfile, isProfileLoading, router, customerInfo]);

  const isMapPage = pathname === '/dashboard/world-map';
  const isLoading = isUserLoading || isProfileLoading;

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  const hasActiveSubscription = customerInfo?.activeSubscriptions?.length ?? 0 > 0;
  if (!user || (userProfile?.subscriptionTier === 'free' && !hasActiveSubscription)) {
    return null;
  }

  return (
    <div className={cn("theme-dashboard", theme === "dark" ? "dark" : "")}>
      <DashboardHeader userProfile={userProfile}/>
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


export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <DashboardLayoutContent>{children}</DashboardLayoutContent>
    </ThemeProvider>
  );
}
