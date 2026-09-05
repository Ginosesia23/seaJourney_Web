'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

import { useSupabase, useUser } from '@/supabase';
import { useDoc } from '@/supabase/database';
import type { UserProfile } from '@/lib/types';
import { formatSubscriptionTierLabel } from '@/lib/subscription-tier-labels';
import { cn } from '@/lib/utils';

import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  ArrowLeft,
  Calendar as CalendarIcon,
  ClipboardList,
  FileSignature,
  FlaskConical,
  Loader2,
  Mail,
  Navigation,
  Ship,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';

import { OverviewTab } from './_tabs/overview-tab';
import { CalendarTab } from './_tabs/calendar-tab';
import { AssignmentsTab } from './_tabs/assignments-tab';
import { WatchesTab } from './_tabs/watches-tab';
import { PassagesTab } from './_tabs/passages-tab';
import { TestimonialsTab } from './_tabs/testimonials-tab';
import { SeaTimeTab } from './_tabs/sea-time-tab';

type TargetProfileRow = Record<string, any> & {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  role: string | null;
  profile_picture: string | null;
  position: string | null;
  active_vessel_id: string | null;
  last_sign_in_at: string | null;
  created_at: string | null;
  subscription_tier: string | null;
  subscription_status: string | null;
};

export default function AdminUserDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useUser();
  const { supabase } = useSupabase();

  const userId =
    typeof params?.userId === 'string'
      ? params.userId
      : Array.isArray(params?.userId)
        ? (params!.userId as string[])[0]
        : '';

  const { data: actorProfileRaw, isLoading: isLoadingActor } =
    useDoc<UserProfile>('users', user?.id);
  const actor = useMemo(() => {
    if (!actorProfileRaw) return null;
    const role =
      (actorProfileRaw as any).role || actorProfileRaw.role || 'crew';
    return { ...actorProfileRaw, role } as UserProfile;
  }, [actorProfileRaw]);
  const isAdmin = actor?.role === 'admin';

  useEffect(() => {
    if (!isLoadingActor && actor && !isAdmin) {
      router.push('/dashboard');
    }
  }, [isAdmin, isLoadingActor, actor, router]);

  const [target, setTarget] = useState<TargetProfileRow | null>(null);
  const [vesselName, setVesselName] = useState<string | null>(null);
  const [vesselSource, setVesselSource] = useState<
    'assignment' | 'profile' | null
  >(null);
  const [isLoadingTarget, setIsLoadingTarget] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin || !userId) return;
    let cancelled = false;
    (async () => {
      setIsLoadingTarget(true);
      setLoadError(null);
      try {
        const { data, error } = await supabase
          .from('users')
          .select('*')
          .eq('id', userId)
          .single();

        if (error || !data) {
          if (!cancelled) {
            setTarget(null);
            setLoadError(error?.message || 'User not found');
          }
          return;
        }
        if (cancelled) return;
        setTarget(data as TargetProfileRow);

        // Resolve "active vessel" from vessel_assignments first (source of truth
        // — `users.active_vessel_id` is often null/stale even when the crew is
        // currently assigned). Fall back to the profile column if no active
        // assignment is found.
        const today = new Date().toISOString().slice(0, 10);
        const { data: activeAssignments } = await supabase
          .from('vessel_assignments')
          .select('vessel_id, start_date, end_date')
          .eq('user_id', userId)
          .or(`end_date.is.null,end_date.gte.${today}`)
          .order('start_date', { ascending: false })
          .limit(1);

        const activeVesselIdFromAssignment =
          (activeAssignments?.[0]?.vessel_id as string | undefined) ?? null;
        const resolvedVesselId =
          activeVesselIdFromAssignment ?? (data.active_vessel_id as string | null);
        const source: 'assignment' | 'profile' | null =
          activeVesselIdFromAssignment
            ? 'assignment'
            : data.active_vessel_id
              ? 'profile'
              : null;

        if (resolvedVesselId) {
          const { data: vessel } = await supabase
            .from('vessels')
            .select('name')
            .eq('id', resolvedVesselId)
            .maybeSingle();
          if (!cancelled) {
            setVesselName((vessel?.name as string) ?? null);
            setVesselSource(source);
          }
        } else if (!cancelled) {
          setVesselName(null);
          setVesselSource(null);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(
            err instanceof Error ? err.message : 'Failed to load user',
          );
        }
      } finally {
        if (!cancelled) setIsLoadingTarget(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, supabase, userId]);

  if (isLoadingActor) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-24 w-full rounded-md" />
      </div>
    );
  }
  if (!isAdmin) return null;

  if (isLoadingTarget) {
    return (
      <div className="flex flex-col gap-6">
        <BackLink />
        <div className="flex items-center justify-center rounded-md border border-border bg-muted/40 py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (loadError || !target) {
    return (
      <div className="flex flex-col gap-6">
        <BackLink />
        <div className="rounded-md border border-destructive/30 bg-background px-4 py-6">
          <p className="text-sm font-medium text-foreground">User not found</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {loadError || 'No account exists for this id.'}
          </p>
        </div>
      </div>
    );
  }

  const fullName =
    `${target.first_name ?? ''} ${target.last_name ?? ''}`.trim() ||
    target.username ||
    target.email ||
    '—';
  const initials = (
    fullName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0])
      .join('') || '?'
  ).toUpperCase();
  const role = (target.role || 'crew').toLowerCase();
  const subStatus = (target.subscription_status || '').toLowerCase();

  return (
    <div className="flex flex-col gap-6">
      {/* Page header — Supabase Studio style */}
      <div className="flex flex-col gap-4 border-b border-border pb-5">
        <BackLink />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <Avatar className="h-11 w-11 rounded-md border border-border">
              {target.profile_picture ? (
                <AvatarImage src={target.profile_picture} alt={fullName} />
              ) : null}
              <AvatarFallback className="rounded-md text-sm font-medium">
                {initials}
              </AvatarFallback>
            </Avatar>

            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>Platform</span>
                <span className="text-border">/</span>
                <Link
                  href="/dashboard/users"
                  className="hover:text-foreground"
                >
                  Users
                </Link>
                <span className="text-border">/</span>
                <span className="truncate text-foreground">{fullName}</span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-medium tracking-tight text-foreground">
                  {fullName}
                </h1>
                <RoleChip role={role} />
                {target.is_testing === true ? (
                  <span className="inline-flex items-center gap-0.5 rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-800 dark:text-amber-300">
                    <FlaskConical className="h-2.5 w-2.5" />
                    Testing
                  </span>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {target.username ? (
                  <span className="font-mono">@{target.username}</span>
                ) : null}
                {target.email ? (
                  <span className="inline-flex items-center gap-1">
                    <Mail className="h-3 w-3" />
                    <span className="truncate">{target.email}</span>
                  </span>
                ) : null}
                {target.position ? (
                  <span className="capitalize">{target.position}</span>
                ) : null}
                {vesselName ? (
                  <span className="inline-flex items-center gap-1">
                    <Ship className="h-3 w-3" />
                    {vesselName}
                    {vesselSource === 'profile' ? (
                      <span className="text-amber-600">(profile)</span>
                    ) : null}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {target.subscription_tier ? (
              <div className="hidden items-center gap-3 rounded-md border border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground sm:flex">
                <span className="text-foreground">
                  {formatSubscriptionTierLabel(target.subscription_tier)}
                </span>
                <span className="h-3 w-px bg-border" />
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 capitalize',
                    subStatus === 'active' && 'text-emerald-600',
                    subStatus === 'past-due' && 'text-amber-600',
                    (subStatus === 'inactive' || subStatus === 'canceled') &&
                      'text-destructive',
                  )}
                >
                  <span
                    className={cn(
                      'h-1.5 w-1.5 rounded-full',
                      subStatus === 'active' && 'bg-emerald-500',
                      subStatus === 'past-due' && 'bg-amber-500',
                      (subStatus === 'inactive' || subStatus === 'canceled') &&
                        'bg-destructive',
                      !['active', 'past-due', 'inactive', 'canceled'].includes(
                        subStatus,
                      ) && 'bg-muted-foreground/50',
                    )}
                  />
                  {target.subscription_status?.replace(/_/g, ' ') ?? '—'}
                </span>
              </div>
            ) : null}

            {(role === 'crew' || role === 'captain' || role === 'vessel') && (
              <Button
                asChild
                variant="outline"
                size="sm"
                className="h-8 rounded-md border-border text-xs"
              >
                <Link
                  href={
                    role === 'vessel'
                      ? '/dashboard/vessel-subscriptions'
                      : '/dashboard/crew-subscriptions'
                  }
                >
                  Manage subscription
                </Link>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 rounded-md border border-border bg-muted/40 p-0.5">
          <TabTrigger value="overview" icon={ShieldCheck}>
            Overview
          </TabTrigger>
          <TabTrigger value="calendar" icon={CalendarIcon}>
            Calendar
          </TabTrigger>
          <TabTrigger value="assignments" icon={Ship}>
            Assignments
          </TabTrigger>
          <TabTrigger value="watches" icon={Navigation}>
            Watches
          </TabTrigger>
          <TabTrigger value="passages" icon={ClipboardList}>
            Passages
          </TabTrigger>
          <TabTrigger value="testimonials" icon={FileSignature}>
            Testimonials
          </TabTrigger>
          <TabTrigger value="seatime" icon={CalendarIcon}>
            Sea time
          </TabTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <OverviewTab
            target={target}
            vesselName={vesselName}
            vesselSource={vesselSource}
            currentUserId={user?.id}
            onTargetPatch={(patch) =>
              setTarget((prev) => (prev ? { ...prev, ...patch } : prev))
            }
          />
        </TabsContent>
        <TabsContent value="calendar" className="mt-4">
          <CalendarTab userId={target.id} />
        </TabsContent>
        <TabsContent value="assignments" className="mt-4">
          <AssignmentsTab userId={target.id} />
        </TabsContent>
        <TabsContent value="watches" className="mt-4">
          <WatchesTab userId={target.id} crewDisplayName={fullName} />
        </TabsContent>
        <TabsContent value="passages" className="mt-4">
          <PassagesTab userId={target.id} />
        </TabsContent>
        <TabsContent value="testimonials" className="mt-4">
          <TestimonialsTab userId={target.id} />
        </TabsContent>
        <TabsContent value="seatime" className="mt-4">
          <SeaTimeTab userId={target.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function BackLink() {
  return (
    <Button
      asChild
      variant="ghost"
      size="sm"
      className="-ml-2 h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
    >
      <Link href="/dashboard/users">
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to user lookup
      </Link>
    </Button>
  );
}

function TabTrigger({
  value,
  icon: Icon,
  children,
}: {
  value: string;
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <TabsTrigger
      value={value}
      className="h-7 gap-1.5 rounded-[5px] px-2.5 text-xs text-muted-foreground shadow-none data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </TabsTrigger>
  );
}

function RoleChip({ role }: { role: string }) {
  return (
    <span
      className={cn(
        'rounded border px-1.5 py-0.5 text-[10px] capitalize',
        role === 'admin' &&
          'border-destructive/40 bg-destructive/10 text-destructive',
        role === 'vessel' &&
          'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
        role === 'captain' &&
          'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-400',
        role !== 'admin' &&
          role !== 'vessel' &&
          role !== 'captain' &&
          'border-border bg-muted/60 text-muted-foreground',
      )}
    >
      {role}
    </span>
  );
}
