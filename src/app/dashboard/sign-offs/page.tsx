'use client';

/**
 * Sign-Offs dashboard page — for linked captain accounts.
 *
 * Linked captains (created on a Vessel Pro/Fleet plan via /dashboard/vessel-roles)
 * receive testimonials in-app rather than by email. This page lists every
 * testimonial routed to them where a sign-off token is present and the
 * status is still pending_captain. Clicking "Review & sign" opens the
 * existing token-based UI at /testimonials/signoff?token=XXX — the same
 * page external email-captains use, so the review/approve/comment UX is
 * consistent everywhere.
 *
 * Linked captains may also still reach those same testimonials via the
 * regular Inbox; this page is a focused queue tailored to the sign-off
 * workflow.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format, differenceInDays, parseISO } from 'date-fns';
import {
  CheckCircle2,
  ChevronRight,
  Clock,
  FileSignature,
  Loader2,
  Ship,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

import { useUser, useSupabase } from '@/supabase';
import { useDoc } from '@/supabase/database';
import { hasActiveSubscription } from '@/supabase/database/subscription-helpers';
import type { Testimonial, UserProfile } from '@/lib/types';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

type SignoffRow = Testimonial & {
  /** Resolved crew member display name (from users table). */
  crew_name?: string | null;
  crew_position?: string | null;
  /** Resolved vessel display name (from vessels table). */
  vessel_name?: string | null;
};

function DaysLeftPill({ expiresAt }: { expiresAt: string | null }) {
  if (!expiresAt) return null;
  const days = differenceInDays(parseISO(expiresAt), new Date());
  if (days <= 0) {
    return (
      <Badge variant="destructive" className="font-normal">
        Expired
      </Badge>
    );
  }
  if (days <= 2) {
    return (
      <Badge className="bg-amber-500/15 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300 font-normal">
        <Clock className="mr-1 h-3 w-3" />
        Expires in {days}d
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="font-normal">
      <Clock className="mr-1 h-3 w-3" />
      {days}d left
    </Badge>
  );
}

export default function SignOffsPage() {
  const { user } = useUser();
  const { supabase } = useSupabase();
  const router = useRouter();

  const { data: userProfileRaw, isLoading: profileLoading } = useDoc<UserProfile>('users', user?.id);

  const [pending, setPending] = useState<SignoffRow[]>([]);
  const [recent, setRecent] = useState<SignoffRow[]>([]);
  const [loading, setLoading] = useState(true);

  // This page is for linked captain accounts — vessel_linked tier + role=captain.
  const isLinkedCaptain = useMemo(() => {
    if (!userProfileRaw) return false;
    const tier = ((userProfileRaw as any).subscription_tier || userProfileRaw.subscriptionTier || '').toString().toLowerCase();
    const role = (userProfileRaw as any).role || userProfileRaw.role || '';
    return tier === 'vessel_linked' && role === 'captain' && hasActiveSubscription(userProfileRaw);
  }, [userProfileRaw]);

  useEffect(() => {
    if (profileLoading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (!isLinkedCaptain) {
      // Route non-linked-captain users to the regular inbox.
      router.replace('/dashboard/inbox');
    }
  }, [profileLoading, isLinkedCaptain, user, router]);

  const loadSignoffs = useCallback(async () => {
    if (!user?.id || !supabase || !isLinkedCaptain) return;
    setLoading(true);
    try {
      // Pending: status=pending_captain, captain_user_id=me, signoff_token present.
      const { data: pendingRows, error: pendingErr } = await supabase
        .from('testimonials')
        .select(
          'id, user_id, vessel_id, start_date, end_date, total_days, at_sea_days, standby_days, yard_days, leave_days, status, captain_user_id, captain_email, captain_name, signoff_token, signoff_token_expires_at, signoff_target_email, signoff_used_at, notes, testimonial_code, created_at'
        )
        .eq('captain_user_id', user.id)
        .eq('status', 'pending_captain')
        .not('signoff_token', 'is', null)
        .order('created_at', { ascending: false });

      if (pendingErr) {
        console.error('[SIGN-OFFS] Failed to load pending:', pendingErr);
      }

      // Recent: status=approved (last 25), captain_user_id=me, signoff_token present (i.e. signed via this flow).
      const { data: recentRows, error: recentErr } = await supabase
        .from('testimonials')
        .select(
          'id, user_id, vessel_id, start_date, end_date, total_days, at_sea_days, standby_days, yard_days, leave_days, status, captain_user_id, captain_email, captain_name, signoff_token, signoff_token_expires_at, signoff_target_email, signoff_used_at, notes, testimonial_code, created_at'
        )
        .eq('captain_user_id', user.id)
        .in('status', ['approved', 'rejected'])
        .not('signoff_token', 'is', null)
        .order('created_at', { ascending: false })
        .limit(25);

      if (recentErr) {
        console.error('[SIGN-OFFS] Failed to load recent:', recentErr);
      }

      const allRows = [...(pendingRows || []), ...(recentRows || [])];
      const crewIds = Array.from(new Set(allRows.map((r: any) => r.user_id).filter(Boolean)));
      const vesselIds = Array.from(new Set(allRows.map((r: any) => r.vessel_id).filter(Boolean)));

      const [crewLookup, vesselLookup] = await Promise.all([
        crewIds.length
          ? supabase.from('users').select('id, first_name, last_name, position').in('id', crewIds)
          : Promise.resolve({ data: [] as any[] }),
        vesselIds.length
          ? supabase.from('vessels').select('id, name').in('id', vesselIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const crewById = new Map<string, { name: string | null; position: string | null }>();
      for (const c of (crewLookup as any).data || []) {
        const fullName = [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || null;
        crewById.set(c.id, { name: fullName, position: c.position || null });
      }
      const vesselById = new Map<string, string>();
      for (const v of (vesselLookup as any).data || []) {
        if (v?.id && v?.name) vesselById.set(v.id, v.name);
      }

      const decorate = (row: any): SignoffRow => ({
        ...(row as Testimonial),
        crew_name: crewById.get(row.user_id)?.name || null,
        crew_position: crewById.get(row.user_id)?.position || null,
        vessel_name: vesselById.get(row.vessel_id) || null,
      });

      setPending((pendingRows || []).map(decorate));
      setRecent((recentRows || []).map(decorate));
    } finally {
      setLoading(false);
    }
  }, [user?.id, supabase, isLinkedCaptain]);

  useEffect(() => {
    void loadSignoffs();
  }, [loadSignoffs]);

  if (profileLoading || !user) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isLinkedCaptain) {
    return null;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Sign-Offs</h1>
        <p className="text-muted-foreground">
          Testimonials sent to you in-app by your vessel for review, comments, and sign-off.
        </p>
      </div>

      {/* Pending queue */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileSignature className="h-5 w-5" />
                Pending sign-offs
              </CardTitle>
              <CardDescription>
                Review the sea-time figures, add comments, sign, and approve or reject.
              </CardDescription>
            </div>
            <Badge variant="secondary" className="text-sm">
              {loading ? '…' : pending.length}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : pending.length === 0 ? (
            <div className="rounded-xl border border-dashed bg-muted/30 p-8 text-center">
              <CheckCircle2 className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-3 text-sm font-medium text-foreground">You&apos;re all caught up</p>
              <p className="text-xs text-muted-foreground">
                Nothing waiting for sign-off right now.
              </p>
            </div>
          ) : (
            <ul className="grid gap-3">
              {pending.map((t) => (
                <SignoffPendingCard key={t.id} row={t} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Recent / history */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4" />
            Recent sign-offs
          </CardTitle>
          <CardDescription>Testimonials you&apos;ve already signed (last 25).</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-14 w-full" />
          ) : recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">No completed sign-offs yet.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {recent.map((t) => (
                <li key={t.id} className="flex items-center gap-3 px-3 py-2.5">
                  <span
                    className={
                      'flex h-7 w-7 flex-none items-center justify-center rounded-full ' +
                      (t.status === 'approved'
                        ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300'
                        : 'bg-rose-500/15 text-rose-600 dark:text-rose-300')
                    }
                  >
                    {t.status === 'approved' ? (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 rotate-45" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-foreground">
                      {t.crew_name || 'Crew member'}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {t.vessel_name || 'Vessel'} ·{' '}
                      {format(parseISO(t.start_date), 'd MMM yyyy')} – {format(parseISO(t.end_date), 'd MMM yyyy')}
                    </div>
                  </div>
                  <Badge
                    variant={t.status === 'approved' ? 'secondary' : 'destructive'}
                    className="font-normal capitalize"
                  >
                    {t.status === 'approved' ? 'Approved' : 'Rejected'}
                  </Badge>
                  {t.signoff_token && (
                    <Link
                      href={`/testimonials/signoff?token=${encodeURIComponent(t.signoff_token)}`}
                      className="text-xs text-primary hover:underline"
                    >
                      View
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SignoffPendingCard({ row }: { row: SignoffRow }) {
  const expiresAt = row.signoff_token_expires_at || null;
  const signoffHref = row.signoff_token
    ? `/testimonials/signoff?token=${encodeURIComponent(row.signoff_token)}${row.signoff_target_email ? `&email=${encodeURIComponent(row.signoff_target_email)}` : ''}`
    : null;
  const crewName = row.crew_name || 'Crew member';
  const vesselName = row.vessel_name || 'Vessel';
  return (
    <li className="rounded-xl border bg-background/60 p-3 transition-colors hover:border-primary/40 hover:bg-primary/5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-primary/15 text-primary">
          <Ship className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="truncate text-sm font-semibold text-foreground">{crewName}</span>
            {row.crew_position && (
              <span className="truncate text-xs text-muted-foreground">{row.crew_position}</span>
            )}
          </div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">
            {vesselName} · {format(parseISO(row.start_date), 'd MMM yyyy')} – {format(parseISO(row.end_date), 'd MMM yyyy')}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-primary" />
              <span className="font-semibold text-foreground">{row.total_days}</span> days total
            </span>
            <span>{row.at_sea_days} at sea</span>
            <span>{row.standby_days} standby</span>
            <span>{row.yard_days} yard</span>
            <span>{row.leave_days} leave</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <DaysLeftPill expiresAt={expiresAt} />
          {signoffHref ? (
            <Button asChild size="sm" className="rounded-lg">
              <Link href={signoffHref}>
                Review &amp; sign <ChevronRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          ) : (
            <Button size="sm" variant="outline" disabled className="rounded-lg">
              No token
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}
