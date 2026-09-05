'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/supabase';
import { useDoc } from '@/supabase/database';
import { Skeleton } from '@/components/ui/skeleton';
import type { UserProfile } from '@/lib/types';
import { VesselDocumentsArchive } from '@/components/career-documents/vessel-documents-archive';

export default function VesselDocumentsPage() {
  const { user } = useUser();
  const router = useRouter();
  const { data: userProfileRaw, isLoading } = useDoc<UserProfile>(
    'users',
    user?.id,
  );
  const role = ((userProfileRaw as any)?.role as string) || 'crew';

  useEffect(() => {
    if (isLoading || !userProfileRaw) return;
    if (role === 'crew' || role === 'captain') {
      router.replace('/dashboard/career-documents?tab=archive');
    }
  }, [isLoading, userProfileRaw, role, router]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-20 rounded-md" />
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-md" />
      </div>
    );
  }

  if (role === 'crew' || role === 'captain') {
    return null;
  }

  return <VesselDocumentsArchive />;
}
