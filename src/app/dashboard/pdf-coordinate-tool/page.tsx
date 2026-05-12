'use client';

import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

import { PdfCoordinatePicker } from '@/components/admin/pdf-coordinate-picker';
import { useUser } from '@/supabase';
import { useDoc } from '@/supabase/database';
import type { UserProfile } from '@/lib/types';

export default function PdfCoordinateToolPage() {
  const { user } = useUser();
  const router = useRouter();
  const { data: userProfileRaw, isLoading: isLoadingProfile } = useDoc<UserProfile>('users', user?.id);

  const userProfile = useMemo(() => {
    if (!userProfileRaw) return null;
    const role = (userProfileRaw as { role?: string }).role || userProfileRaw.role || 'crew';
    return { ...userProfileRaw, role } as UserProfile;
  }, [userProfileRaw]);

  const isAdmin = userProfile?.role === 'admin';

  useEffect(() => {
    if (!user?.id) return;
    if (!isLoadingProfile && userProfile && !isAdmin) {
      router.push('/dashboard');
    }
  }, [user?.id, isAdmin, isLoadingProfile, userProfile, router]);

  if (!user?.id || isLoadingProfile || !userProfile) {
    return (
      <div className="flex min-h-[40vh] w-full items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span>Loading…</span>
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <PdfCoordinatePicker
      defaultDocumentUrl="/forms/AMSA_Form_771.pdf"
      title="PDF coordinate picker"
      description="Upload any PDF template (or keep the default AMSA 771). Click where text should anchor — the clipboard receives { x, top } in PDF points (top measured from the top of the page, matching pdf-lib overlays in pdf-generator). Use this preview (PDF.js), not the browser’s PDF plugin."
    />
  );
}
