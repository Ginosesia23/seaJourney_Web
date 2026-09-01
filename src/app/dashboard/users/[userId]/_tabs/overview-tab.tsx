'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { format, parseISO, formatDistanceToNow } from 'date-fns';
import { CreditCard, FlaskConical, IdCard, MapPin, Phone, UserCircle2 } from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { StatePill } from '@/components/state-pill';
import type { DailyStatus } from '@/lib/types';
import { useSupabase } from '@/supabase';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { AuthStatusCard } from './auth-status-card';
import { AdminAccountTypeCard } from '@/components/admin/admin-account-type-card';

type Props = {
  target: Record<string, any>;
  vesselName: string | null;
  currentUserId?: string | null;
  /**
   * Where the displayed `vesselName` came from:
   *   - `'assignment'` → resolved from the latest active row in
   *     `vessel_assignments` (source of truth)
   *   - `'profile'`    → only `users.active_vessel_id` was set; no current
   *     assignment row exists, so this may be stale
   *   - `null`         → no active vessel found anywhere
   */
  vesselSource?: 'assignment' | 'profile' | null;
  /** Called after admin mutates a field on the target profile (e.g. is_testing). */
  onTargetPatch?: (patch: Record<string, unknown>) => void;
};

type LatestState = {
  state: DailyStatus;
  date: string;
  changedAt: string | null;
};

export function OverviewTab({
  target,
  vesselName,
  vesselSource,
  currentUserId,
  onTargetPatch,
}: Props) {
  const { supabase } = useSupabase();
  const [latestState, setLatestState] = useState<LatestState | null>(null);
  const [stateLogCount, setStateLogCount] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingTesting, setIsSavingTesting] = useState(false);

  const isTesting = target.is_testing === true;
  const isSelf = Boolean(currentUserId && currentUserId === target.id);

  const setTestingFlag = useCallback(
    async (next: boolean) => {
      if (isSelf && next) {
        toast({
          variant: 'destructive',
          title: 'Not allowed',
          description: 'You cannot mark your own admin account as testing.',
        });
        return;
      }
      setIsSavingTesting(true);
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const res = await fetch('/api/admin/users/testing-flag', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...(session?.access_token
              ? { Authorization: `Bearer ${session.access_token}` }
              : {}),
          },
          body: JSON.stringify({ userId: target.id, isTesting: next }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast({
            variant: 'destructive',
            title: 'Could not save',
            description:
              typeof json.error === 'string' ? json.error : res.statusText,
          });
          return;
        }
        onTargetPatch?.({ is_testing: next });
        toast({
          title: next ? 'Marked as testing' : 'Removed testing flag',
          description: next
            ? 'This account is excluded from platform analytics.'
            : 'This account will count in platform analytics again.',
        });
      } catch (e) {
        console.error('[overview] testing flag', e);
        toast({
          variant: 'destructive',
          title: 'Could not save',
          description: 'Unexpected error updating testing flag.',
        });
      } finally {
        setIsSavingTesting(false);
      }
    },
    [isSelf, onTargetPatch, supabase, target.id],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      const { data: latest } = await supabase
        .from('daily_state_logs')
        .select('state, date, updated_at, created_at')
        .eq('user_id', target.id)
        .order('date', { ascending: false })
        .order('updated_at', { ascending: false, nullsFirst: false })
        .limit(1);
      const { count } = await supabase
        .from('daily_state_logs')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', target.id);
      if (cancelled) return;
      if (latest && latest.length > 0) {
        const row = latest[0];
        setLatestState({
          state: row.state as DailyStatus,
          date: row.date as string,
          changedAt:
            (row.updated_at as string) || (row.created_at as string) || null,
        });
      } else {
        setLatestState(null);
      }
      setStateLogCount(count ?? 0);
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, target.id]);

  const created = target.created_at
    ? formatDate(target.created_at as string)
    : null;
  const lastSignIn = target.last_sign_in_at
    ? formatDateTime(target.last_sign_in_at as string)
    : null;
  const lastSignInRel = target.last_sign_in_at
    ? safeRelative(target.last_sign_in_at as string)
    : null;

  const fullAddress = useMemo(() => {
    const parts = [
      target.address_line_1,
      target.address_line_2,
      target.address_city,
      target.address_postcode,
      target.address_country,
    ]
      .filter((p) => typeof p === 'string' && p.trim().length > 0)
      .map((p) => (p as string).trim());
    return parts.length > 0 ? parts.join(', ') : null;
  }, [target]);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* Auth status — shown first so unverified users are obvious */}
      <div className="lg:col-span-3">
        <AuthStatusCard
          userId={target.id}
          targetRole={typeof target.role === 'string' ? target.role : 'crew'}
          isSelf={isSelf}
        />
      </div>

      <AdminAccountTypeCard
        target={{
          id: target.id,
          role: target.role,
          subscription_tier: target.subscription_tier,
          subscription_status: target.subscription_status,
          stripe_subscription_id: target.stripe_subscription_id,
          active_vessel_id: target.active_vessel_id,
        }}
        isSelf={isSelf}
        onUpdated={onTargetPatch}
      />

      {/* Analytics exclusion */}
      <Card className="rounded-2xl border-dashed lg:col-span-3">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <FlaskConical className="h-4 w-4" />
            Testing account
          </CardTitle>
          <CardDescription>
            Mark QA, demo, or internal accounts so platform and crew analytics
            ignore them and you can see real user usage.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <Label htmlFor="is-testing-toggle" className="text-sm font-medium">
                Exclude from analytics
              </Label>
              <p className="text-xs text-muted-foreground">
                {isTesting
                  ? 'This account is currently excluded from analytics totals.'
                  : 'Off — this account is included in analytics.'}
              </p>
            </div>
            <Switch
              id="is-testing-toggle"
              checked={isTesting}
              disabled={isSavingTesting || (isSelf && !isTesting)}
              onCheckedChange={(checked) => void setTestingFlag(checked)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Activity summary */}
      <Card className="rounded-2xl lg:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Activity</CardTitle>
          <CardDescription>
            Latest known state, login, and account dates.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Latest state">
            {isLoading ? (
              <Skeleton className="h-5 w-32" />
            ) : latestState ? (
              <div className="flex flex-col gap-1">
                <StatePill stateKey={latestState.state} />
                <span className="text-xs text-muted-foreground">
                  {formatDate(latestState.date)}
                  {latestState.changedAt &&
                    ` · updated ${safeRelative(latestState.changedAt) ?? ''}`}
                </span>
              </div>
            ) : (
              <Muted>No state logs yet</Muted>
            )}
          </Field>

          <Field label="State logs on file">
            {isLoading ? (
              <Skeleton className="h-5 w-16" />
            ) : (
              <span className="font-medium">{stateLogCount ?? 0}</span>
            )}
          </Field>

          <Field label="Last sign in">
            {lastSignIn ? (
              <div className="flex flex-col">
                <span className="font-medium">{lastSignIn}</span>
                {lastSignInRel && (
                  <span className="text-xs text-muted-foreground">
                    {lastSignInRel}
                  </span>
                )}
              </div>
            ) : (
              <Muted>Never logged in</Muted>
            )}
          </Field>

          <Field label="Account created">
            {created ? (
              <span className="font-medium">{created}</span>
            ) : (
              <Muted>—</Muted>
            )}
          </Field>

          <Field label="Active vessel">
            {vesselName ? (
              <div className="flex flex-col">
                <span className="font-medium">{vesselName}</span>
                {vesselSource === 'profile' && (
                  <span className="text-[11px] text-amber-600">
                    From profile (no active assignment row)
                  </span>
                )}
              </div>
            ) : (
              <Muted>—</Muted>
            )}
          </Field>

          <Field label="Position">
            {target.position ? (
              <span className="font-medium capitalize">
                {target.position as string}
              </span>
            ) : (
              <Muted>—</Muted>
            )}
          </Field>
        </CardContent>
      </Card>

      {/* Subscription */}
      <Card className="rounded-2xl">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="h-4 w-4" />
            Subscription
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Field label="Tier">
            <span className="font-medium capitalize">
              {target.subscription_tier || '—'}
            </span>
          </Field>
          <Field label="Status">
            <span
              className={cn(
                'font-medium capitalize',
                target.subscription_status === 'active' && 'text-green-600',
                target.subscription_status === 'past-due' && 'text-amber-600',
                target.subscription_status === 'inactive' && 'text-destructive',
              )}
            >
              {target.subscription_status || '—'}
            </span>
          </Field>
          <Field label="Stripe customer">
            <code className="break-all text-[11px] text-muted-foreground">
              {target.stripe_customer_id || '—'}
            </code>
          </Field>
          <Field label="Stripe subscription">
            <code className="break-all text-[11px] text-muted-foreground">
              {target.stripe_subscription_id || '—'}
            </code>
          </Field>
          {target.current_period_end && (
            <Field label="Current period end">
              <span className="text-sm">
                {formatDate(target.current_period_end as string)}
              </span>
            </Field>
          )}
          {target.cancel_at_period_end && (
            <Field label="Cancel at period end">
              <span className="text-sm font-medium text-amber-600">Yes</span>
            </Field>
          )}
          <Field label="Ads enabled">
            <span className="font-medium">
              {target.ads === true
                ? 'Yes'
                : target.ads === false
                  ? 'No'
                  : '—'}
            </span>
          </Field>
        </CardContent>
      </Card>

      {/* Identity */}
      <Card className="rounded-2xl">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <UserCircle2 className="h-4 w-4" />
            Identity
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Field label="First name">
            <Plain v={target.first_name} />
          </Field>
          <Field label="Last name">
            <Plain v={target.last_name} />
          </Field>
          <Field label="Title">
            <Plain v={target.title} />
          </Field>
          <Field label="Date of birth">
            <Plain
              v={
                target.date_of_birth
                  ? formatDate(target.date_of_birth as string)
                  : null
              }
            />
          </Field>
          <Field label="Place of birth">
            <Plain v={target.place_of_birth} />
          </Field>
          <Field label="Nationality">
            <Plain v={target.nationality} />
          </Field>
        </CardContent>
      </Card>

      {/* Documents */}
      <Card className="rounded-2xl">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <IdCard className="h-4 w-4" />
            Documents
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Field label="Discharge book number">
            <Plain v={target.discharge_book_number} />
          </Field>
          <Field label="Signature on file">
            <span className="font-medium">
              {target.signature ? 'Yes' : 'No'}
            </span>
          </Field>
          <Field label="Username">
            <Plain v={target.username} />
          </Field>
          <Field label="Account ID">
            <code className="break-all text-[11px] text-muted-foreground">
              {target.id}
            </code>
          </Field>
        </CardContent>
      </Card>

      {/* Contact */}
      <Card className="rounded-2xl">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Phone className="h-4 w-4" />
            Contact
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Field label="Email">
            <Plain v={target.email} />
          </Field>
          <Field label="Telephone">
            <Plain v={target.telephone} />
          </Field>
          <Field label="Mobile">
            <Plain v={target.mobile} />
          </Field>
        </CardContent>
      </Card>

      {/* Address */}
      <Card className="rounded-2xl lg:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <MapPin className="h-4 w-4" />
            Address
          </CardTitle>
        </CardHeader>
        <CardContent>
          {fullAddress ? (
            <p className="text-sm">{fullAddress}</p>
          ) : (
            <Muted>No address on file.</Muted>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <div className="text-sm">{children}</div>
    </div>
  );
}

function Plain({ v }: { v: any }) {
  if (v == null || v === '') return <Muted>—</Muted>;
  return <span className="font-medium">{String(v)}</span>;
}

function Muted({ children }: { children: React.ReactNode }) {
  return <span className="text-muted-foreground">{children}</span>;
}

function formatDate(iso: string): string {
  try {
    return format(parseISO(iso), 'd MMM yyyy');
  } catch {
    return iso;
  }
}

function formatDateTime(iso: string): string {
  try {
    return format(parseISO(iso), 'd MMM yyyy, HH:mm');
  } catch {
    return iso;
  }
}

function safeRelative(iso: string): string | null {
  try {
    return formatDistanceToNow(parseISO(iso), { addSuffix: true });
  } catch {
    return null;
  }
}
