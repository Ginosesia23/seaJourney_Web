'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  FileCheck,
  FileSignature,
  FolderOpen,
  Loader2,
  Award,
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

export type CareerDocumentsTab = 'testimonials' | 'proof' | 'archive';

const TAB_META: Record<
  CareerDocumentsTab,
  { label: string; short: string; description: string; icon: typeof FileSignature }
> = {
  testimonials: {
    label: 'Testimonials',
    short: 'Request & manage',
    description: 'Request captain sign-off, track status, and download MCA / AMSA / SeaJourney PDFs.',
    icon: FileSignature,
  },
  proof: {
    label: 'Proof of service',
    short: 'Certificates',
    description: 'Download proof of service entries saved to your profile — one file or combined.',
    icon: FileCheck,
  },
  archive: {
    label: 'From vessels',
    short: 'Issued to you',
    description: 'Documents vessels generated for you, with search, filters, and verification codes.',
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
      subscriptionTier: (p.subscription_tier as string) || (p.subscriptionTier as string) || 'free',
      linkedAccountFeatures: (p.linked_account_features as Record<string, boolean>) || undefined,
    } as UserProfile & { linkedAccountFeatures?: Record<string, boolean> };
  }, [userProfileRaw]);

  const isLinked = Boolean(profile && isVesselLinkedAccount(profile));
  const isCrewLimited = Boolean(profile && isCrewLimitedAccount(profile));
  const isPaid = Boolean(profile && hasPaidDashboardAccess(profile));

  const canTestimonials =
    !isCrewLimited &&
    isEnabled('testimonials') &&
    (!isLinked || isVesselLinkedFeatureGranted(profile, 'testimonials'));

  const canProof =
    !isCrewLimited &&
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
        <Skeleton className="h-36 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (availableTabs.length === 0) {
    return (
      <div className="overflow-hidden rounded-xl border bg-card px-5 py-12 text-center shadow-sm">
        <FolderOpen className="mx-auto h-10 w-10 text-muted-foreground opacity-50" />
        <h1 className="mt-4 text-lg font-semibold">No career documents available</h1>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Your plan or account permissions don&apos;t include career document tools yet.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">
              <FileSignature className="h-3.5 w-3.5" />
              Career
            </div>
            <h1 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">
              Career documents
            </h1>
            <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
              Testimonials, proof of service, and documents vessels have issued for you — in one place.
            </p>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            {canTestimonials ? (
              <span className="inline-flex items-center gap-1.5">
                <Award className="h-3 w-3" /> Request &amp; track
              </span>
            ) : null}
            {canProof ? (
              <span className="inline-flex items-center gap-1.5">
                <FileCheck className="h-3 w-3" /> Proof downloads
              </span>
            ) : null}
            {canArchive ? (
              <span className="inline-flex items-center gap-1.5">
                <FolderOpen className="h-3 w-3" /> Vessel archive
              </span>
            ) : null}
          </div>
        </div>

        <div className="border-t bg-muted/30 px-3 py-2 sm:px-4">
          <Tabs value={tab} onValueChange={handleTabChange}>
            <TabsList
              className={cn(
                'grid h-auto w-full gap-1 rounded-xl bg-transparent p-0',
                availableTabs.length === 1 && 'grid-cols-1',
                availableTabs.length === 2 && 'grid-cols-2',
                availableTabs.length >= 3 && 'grid-cols-3',
              )}
            >
              {availableTabs.map((id) => {
                const meta = TAB_META[id];
                const Icon = meta.icon;
                return (
                  <TabsTrigger
                    key={id}
                    value={id}
                    className={cn(
                      'flex flex-col items-start gap-0.5 rounded-lg border border-transparent px-3 py-2.5 text-left data-[state=active]:border-border data-[state=active]:bg-background data-[state=active]:shadow-sm sm:px-4',
                    )}
                  >
                    <span className="flex items-center gap-1.5 text-sm font-semibold">
                      <Icon className="h-3.5 w-3.5" />
                      {meta.label}
                    </span>
                    <span className="hidden text-[11px] font-normal text-muted-foreground sm:block">
                      {meta.short}
                    </span>
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Tabs>
        </div>
      </div>

      <div className="rounded-xl border bg-card px-4 py-3 sm:px-5">
        <p className="text-xs text-muted-foreground">{TAB_META[tab].description}</p>
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
        <div className="flex min-h-[320px] items-center justify-center text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      }
    >
      <CareerDocumentsHubInner />
    </Suspense>
  );
}
