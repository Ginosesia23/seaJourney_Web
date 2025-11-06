'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/firebase';
import { Loader2 } from 'lucide-react';
import DashboardHeader from '@/components/layout/dashboard-header';
import DashboardSidebar from '@/components/layout/dashboard-sidebar';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isUserLoading } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.push('/login');
    }
  }, [user, isUserLoading, router]);

  if (isUserLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="theme-dashboard flex min-h-screen w-full flex-col">
      <DashboardHeader />
      <div className="grid min-h-[calc(100vh-4rem)] flex-1 lg:grid-cols-[240px_1fr]">
        <DashboardSidebar />
        <main className="flex flex-1 flex-col gap-4 bg-background p-4 md:gap-8 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
