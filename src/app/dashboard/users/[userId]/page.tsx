'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

import { useSupabase, useUser } from '@/supabase';
import { useDoc } from '@/supabase/database';
import type { UserProfile } from '@/lib/types';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  ArrowLeft,
  Calendar as CalendarIcon,
  ClipboardList,
  FileSignature,
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
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full rounded-2xl" />
      </div>
    );
  }
  if (!isAdmin) return null;

  if (isLoadingTarget) {
    return (
      <div className="flex flex-col gap-6">
        <BackLink />
        <Card className="rounded-2xl">
          <CardContent className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loadError || !target) {
    return (
      <div className="flex flex-col gap-6">
        <BackLink />
        <Card className="rounded-2xl border-destructive/30">
          <CardHeader>
            <CardTitle>User not found</CardTitle>
            <CardDescription>
              {loadError || 'No account exists for this id.'}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const fullName =
    `${target.first_name ?? ''} ${target.last_name ?? ''}`.trim() ||
    target.username ||
    target.email ||
    '—';
  const initials = (fullName.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('') || '?').toUpperCase();

  return (
    <div className="flex flex-col gap-6">
      <BackLink />

      {/* Header card */}
      <Card className="rounded-2xl border shadow-sm">
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:gap-5">
          <Avatar className="h-16 w-16 border">
            {target.profile_picture ? (
              <AvatarImage src={target.profile_picture} alt={fullName} />
            ) : null}
            <AvatarFallback className="text-base font-medium">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold leading-tight tracking-tight">
                {fullName}
              </h1>
              <RoleChip role={target.role || 'crew'} />
              {target.subscription_tier && (
                <Badge variant="outline" className="capitalize">
                  {target.subscription_tier} · {target.subscription_status ?? '—'}
                </Badge>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              {target.username && <span>@{target.username}</span>}
              {target.email && (
                <span className="inline-flex items-center gap-1">
                  <Mail className="h-3.5 w-3.5" />
                  {target.email}
                </span>
              )}
              {target.position && <span>{target.position}</span>}
              {vesselName && (
                <span className="inline-flex items-center gap-1">
                  <Ship className="h-3.5 w-3.5" />
                  {vesselName}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 self-start sm:self-center">
            {(target.role === 'crew' || target.role === 'captain') && (
              <Button asChild variant="outline" size="sm">
                <Link href="/dashboard/crew-subscriptions">
                  Manage subscription
                </Link>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 rounded-xl bg-muted/40 p-1">
          <TabTrigger value="overview" icon={ShieldCheck}>Overview</TabTrigger>
          <TabTrigger value="calendar" icon={CalendarIcon}>Calendar</TabTrigger>
          <TabTrigger value="assignments" icon={Ship}>Assignments</TabTrigger>
          <TabTrigger value="watches" icon={Navigation}>Watches</TabTrigger>
          <TabTrigger value="passages" icon={ClipboardList}>Passages</TabTrigger>
          <TabTrigger value="testimonials" icon={FileSignature}>Testimonials</TabTrigger>
          <TabTrigger value="seatime" icon={CalendarIcon}>Sea time</TabTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <OverviewTab
            target={target}
            vesselName={vesselName}
            vesselSource={vesselSource}
            currentUserId={user?.id}
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
    <div>
      <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
        <Link href="/dashboard/users">
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to user lookup
        </Link>
      </Button>
    </div>
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
      className="gap-1.5 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm"
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </TabsTrigger>
  );
}

function RoleChip({ role }: { role: string }) {
  const variant: 'default' | 'secondary' | 'destructive' | 'outline' =
    role === 'admin'
      ? 'destructive'
      : role === 'vessel'
        ? 'default'
        : role === 'captain'
          ? 'default'
          : 'secondary';
  return (
    <Badge variant={variant} className="capitalize">
      {role}
    </Badge>
  );
}
