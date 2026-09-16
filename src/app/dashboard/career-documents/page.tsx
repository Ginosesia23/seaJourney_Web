'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  FileCheck,
  FileSignature,
  FolderOpen,
  Loader2,
} from 'lucide-react';

import { useUser } from '@/supabase';
import { useDoc } from '@/supabase/database';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { UserProfile } from '@/lib/types';
import {
  hasPaidDashboardAccess,
  isCrewLimitedAccount,
  isVesselLinkedAccount,
} from '@/supabase/database/subscription-helpers';
import { isVesselLinkedFeatureGranted } from '@/lib/vessel-linked-features';
import { useFeatureFlags } from '@/hooks/use-feature-flags';
import { TestimonialsWorkspace } from '@/components/career-documents/testimonials-workspace';
import { ProofOfServicePanel } from '@/components/career-documents/proof-of-service-panel';
import { VesselDocumentsArchive } from '@/components/career-documents/vessel-documents-archive';
import {
  CareerDocumentsPageHeader,
} from '@/components/dashboard/career-documents-page-ui';

export type CareerDocumentsTab = 'testimonials' | 'proof' | 'archive';

const TAB_META: Record<
  CareerDocumentsTab,
  { label: string; short: string; description: string; icon: typeof FileSignature }
> = {
  testimonials: {
    label: 'Testimonials',
    short: 'Request & manage',
    description:
      'Request captain sign-off, track status, and download MCA / AMSA / SeaJourney PDFs.',
    icon: FileSignature,
  },
  proof: {
    label: 'Proof of service',
    short: 'Certificates',
    description:
      'Download proof of service entries saved to your profile — one file or combined.',
    icon: FileCheck,
  },
  archive: {
    label: 'From vessels',
    short: 'Issued to you',
    description:
      'Documents vessels generated for you, with search, filters, and verification codes.',
    icon: FolderOpen,
  },
};

function CareerDocumentsHubInner() {
  const { user } = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isEnabled } = useFeatureFlags();
  const { data: userProfileRaw, isLoading } = useDoc<UserProfile>('users', user?.id);
  const profile = useMemo(() => {
    if (!userProfileRaw) return null;
    const p = userProfileRaw as unknown as Record<string, unknown>;
    return {
      ...userProfileRaw,
      role: (p.role as string) || userProfileRaw.role || 'crew',
      subscriptionTier:
        (p.subscription_tier as string) || (p.subscriptionTier as string) || 'free',
      linkedAccountFeatures:
        (p.linked_account_features as Record<string, boolean>) || undefined,
    } as UserProfile & { linkedAccountFeatures?: Record<string, boolean> };
  }, [userProfileRaw]);

  const isLinked = Boolean(profile && isVesselLinkedAccount(profile));
  const isCrewLimited = Boolean(profile && isCrewLimitedAccount(profile));
  const isPaid = Boolean(profile && hasPaidDashboardAccess(profile));

  const canTestimonials =
    isEnabled('testimonials') &&
    (!isLinked || isVesselLinkedFeatureGranted(profile, 'testimonials'));

  const canProof =
    isEnabled('proof_of_service') &&
    (!isLinked || isVesselLinkedFeatureGranted(profile, 'proof_of_service'));

  const canArchive = isPaid || isCrewLimited || isLinked;

  const availableTabs = useMemo(() => {
    const tabs: CareerDocumentsTab[] = [];
    if (canTestimonials) tabs.push('testimonials');
    if (canProof) tabs.push('proof');
    if (canArchive) tabs.push('archive');
    return tabs;
  }, [canTestimonials, canProof, canArchive]);

  const tabFromUrl = (searchParams?.get('tab') as CareerDocumentsTab | null) || null;
  const [tab, setTab] = useState<CareerDocumentsTab>('testimonials');

  useEffect(() => {
    if (availableTabs.length === 0) return;
    const next =
      tabFromUrl && availableTabs.includes(tabFromUrl) ? tabFromUrl : availableTabs[0];
    setTab(next);
  }, [tabFromUrl, availableTabs]);

  useEffect(() => {
    if (isLoading || !profile) return;
    const role = profile.role;
    if (role === 'vessel' || role === 'admin') {
      router.replace('/dashboard/vessel-documents');
    }
  }, [isLoading, profile, router]);

  const handleTabChange = (value: string) => {
    const next = value as CareerDocumentsTab;
    setTab(next);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', next);
    window.history.replaceState({}, '', url.toString());
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="space-y-2 border-b border-border pb-5">
          <Skeleton className="h-3 w-40 rounded-md" />
          <Skeleton className="h-7 w-56 rounded-md" />
          <Skeleton className="h-4 w-96 max-w-full rounded-md" />
        </div>
        <Skeleton className="h-8 w-72 rounded-md" />
        <Skeleton className="h-64 w-full rounded-md" />
      </div>
    );
  }

  if (availableTabs.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <CareerDocumentsPageHeader
          title="Career documents"
          description="Testimonials, proof of service, and documents vessels have issued for you."
        />
        <div className="overflow-hidden rounded-md border border-border bg-background">
          <div className="border-b border-border bg-muted/40 px-4 py-2.5">
            <p className="text-xs font-medium text-foreground">
              No career documents available
            </p>
          </div>
          <div className="flex flex-col items-center justify-center px-4 py-14 text-center">
            <FolderOpen className="h-5 w-5 text-muted-foreground" />
            <p className="mt-3 max-w-md text-xs text-muted-foreground">
              Your plan or account permissions don&apos;t include career document tools yet.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <CareerDocumentsPageHeader
        title="Career documents"
        description="Testimonials, proof of service, and documents vessels have issued for you — in one place."
      />

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1 rounded-md border border-border bg-muted/40 p-0.5 w-fit">
          <Tabs value={tab} onValueChange={handleTabChange}>
            <TabsList className="h-auto bg-transparent p-0">
              {availableTabs.map((id) => {
                const meta = TAB_META[id];
                const Icon = meta.icon;
                return (
                  <TabsTrigger
                    key={id}
                    value={id}
                    className={cn(
                      'inline-flex h-7 items-center gap-1.5 rounded-[5px] px-2.5 text-xs data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm',
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {meta.label}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Tabs>
        </div>
        <p className="text-[11px] text-muted-foreground">{TAB_META[tab].description}</p>
      </div>

      <Tabs value={tab} onValueChange={handleTabChange}>
        {canTestimonials ? (
          <TabsContent value="testimonials" className="mt-0 focus-visible:outline-none">
            <TestimonialsWorkspace embedded />
          </TabsContent>
        ) : null}
        {canProof ? (
          <TabsContent value="proof" className="mt-0 focus-visible:outline-none">
            <ProofOfServicePanel embedded />
          </TabsContent>
        ) : null}
        {canArchive ? (
          <TabsContent value="archive" className="mt-0 focus-visible:outline-none">
            <VesselDocumentsArchive embedded forcePersonal />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}

export default function CareerDocumentsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[220px] items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading career documents…
        </div>
      }
    >
      <CareerDocumentsHubInner />
    </Suspense>
  );
}
