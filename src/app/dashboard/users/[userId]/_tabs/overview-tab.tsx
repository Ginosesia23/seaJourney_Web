'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { format, parseISO, formatDistanceToNow } from 'date-fns';
import { CreditCard, FlaskConical, IdCard, MapPin, Phone, UserCircle2 } from 'lucide-react';

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
import { formatSubscriptionTierLabel } from '@/lib/subscription-tier-labels';

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
    <div className="grid gap-3 lg:grid-cols-3">
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
      <Panel className="lg:col-span-3">
        <PanelHeader
          icon={FlaskConical}
          title="Testing account"
          description="Mark QA, demo, or internal accounts so analytics ignore them."
        />
        <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="is-testing-toggle" className="text-xs font-medium">
              Exclude from analytics
            </Label>
            <p className="text-[11px] text-muted-foreground">
              {isTesting
                ? 'Currently excluded from analytics totals.'
                : 'Off — included in analytics.'}
            </p>
          </div>
          <Switch
            id="is-testing-toggle"
            checked={isTesting}
            disabled={isSavingTesting || (isSelf && !isTesting)}
            onCheckedChange={(checked) => void setTestingFlag(checked)}
          />
        </div>
      </Panel>

      {/* Activity summary */}
      <Panel className="lg:col-span-2">
        <PanelHeader
          title="Activity"
          description="Latest state, login, and account dates."
        />
        <div className="grid gap-4 px-4 py-3 sm:grid-cols-2">
          <Field label="Latest state">
            {isLoading ? (
              <Skeleton className="h-5 w-32" />
            ) : latestState ? (
              <div className="flex flex-col gap-1">
                <StatePill stateKey={latestState.state} />
                <span className="text-[11px] text-muted-foreground">
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
              <span className="font-mono text-sm tabular-nums text-foreground">
                {stateLogCount ?? 0}
              </span>
            )}
          </Field>

          <Field label="Last sign in">
            {lastSignIn ? (
              <div className="flex flex-col">
                <span className="text-sm text-foreground">{lastSignIn}</span>
                {lastSignInRel && (
                  <span className="text-[11px] text-muted-foreground">
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
              <span className="text-sm text-foreground">{created}</span>
            ) : (
              <Muted>—</Muted>
            )}
          </Field>

          <Field label="Active vessel">
            {vesselName ? (
              <div className="flex flex-col">
                <span className="text-sm text-foreground">{vesselName}</span>
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
              <span className="text-sm capitalize text-foreground">
                {target.position as string}
              </span>
            ) : (
              <Muted>—</Muted>
            )}
          </Field>
        </div>
      </Panel>

      {/* Subscription */}
      <Panel>
        <PanelHeader icon={CreditCard} title="Subscription" />
        <div className="space-y-3 px-4 py-3">
          <Field label="Tier">
            <span className="text-sm text-foreground">
              {target.subscription_tier
                ? formatSubscriptionTierLabel(target.subscription_tier)
                : '—'}
            </span>
          </Field>
          <Field label="Status">
            <span
              className={cn(
                'inline-flex items-center gap-1.5 text-sm capitalize',
                target.subscription_status === 'active' && 'text-emerald-600',
                target.subscription_status === 'past-due' && 'text-amber-600',
                target.subscription_status === 'inactive' && 'text-destructive',
              )}
            >
              {target.subscription_status ? (
                <>
                  <span
                    className={cn(
                      'h-1.5 w-1.5 rounded-full',
                      target.subscription_status === 'active' &&
                        'bg-emerald-500',
                      target.subscription_status === 'past-due' &&
                        'bg-amber-500',
                      target.subscription_status === 'inactive' &&
                        'bg-destructive',
                    )}
                  />
                  {target.subscription_status}
                </>
              ) : (
                '—'
              )}
            </span>
          </Field>
          <Field label="Stripe customer">
            <code className="break-all font-mono text-[11px] text-muted-foreground">
              {target.stripe_customer_id || '—'}
            </code>
          </Field>
          <Field label="Stripe subscription">
            <code className="break-all font-mono text-[11px] text-muted-foreground">
              {target.stripe_subscription_id || '—'}
            </code>
          </Field>
          {target.current_period_end && (
            <Field label="Current period end">
              <span className="text-sm text-foreground">
                {formatDate(target.current_period_end as string)}
              </span>
            </Field>
          )}
          {target.cancel_at_period_end && (
            <Field label="Cancel at period end">
              <span className="text-sm text-amber-600">Yes</span>
            </Field>
          )}
          <Field label="Ads enabled">
            <span className="text-sm text-foreground">
              {target.ads === true
                ? 'Yes'
                : target.ads === false
                  ? 'No'
                  : '—'}
            </span>
          </Field>
        </div>
      </Panel>

      {/* Identity */}
      <Panel>
        <PanelHeader icon={UserCircle2} title="Identity" />
        <div className="space-y-3 px-4 py-3">
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
        </div>
      </Panel>

      {/* Documents */}
      <Panel>
        <PanelHeader icon={IdCard} title="Documents" />
        <div className="space-y-3 px-4 py-3">
          <Field label="Discharge book number">
            <Plain v={target.discharge_book_number} />
          </Field>
          <Field label="Signature on file">
            <span className="text-sm text-foreground">
              {target.signature ? 'Yes' : 'No'}
            </span>
          </Field>
          <Field label="Username">
            <Plain v={target.username} />
          </Field>
          <Field label="Account ID">
            <code className="break-all font-mono text-[11px] text-muted-foreground">
              {target.id}
            </code>
          </Field>
        </div>
      </Panel>

      {/* Contact */}
      <Panel>
        <PanelHeader icon={Phone} title="Contact" />
        <div className="space-y-3 px-4 py-3">
          <Field label="Email">
            <Plain v={target.email} />
          </Field>
          <Field label="Telephone">
            <Plain v={target.telephone} />
          </Field>
          <Field label="Mobile">
            <Plain v={target.mobile} />
          </Field>
        </div>
      </Panel>

      {/* Address */}
      <Panel className="lg:col-span-2">
        <PanelHeader icon={MapPin} title="Address" />
        <div className="px-4 py-3">
          {fullAddress ? (
            <p className="text-sm text-foreground">{fullAddress}</p>
          ) : (
            <Muted>No address on file.</Muted>
          )}
        </div>
      </Panel>
    </div>
  );
}

function Panel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-md border border-border bg-background',
        className,
      )}
    >
      {children}
    </div>
  );
}

function PanelHeader({
  icon: Icon,
  title,
  description,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
}) {
  return (
    <div className="border-b border-border bg-muted/40 px-4 py-2.5">
      <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
        {Icon ? <Icon className="h-3.5 w-3.5 text-muted-foreground" /> : null}
        {title}
      </div>
      {description ? (
        <p className="mt-0.5 text-[11px] text-muted-foreground">{description}</p>
      ) : null}
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
  return <span className="text-sm text-foreground">{String(v)}</span>;
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
