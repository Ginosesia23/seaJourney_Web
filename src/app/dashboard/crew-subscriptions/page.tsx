'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useUser, useSupabase } from '@/supabase';
import { useDoc } from '@/supabase/database';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  CreditCard,
  Loader2,
  Search,
  ChevronsUpDown,
  Calendar,
  AlertTriangle,
  Users,
} from 'lucide-react';
import type { UserProfile } from '@/lib/types';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

interface CrewPrice {
  id: string;
  tier: string;
  nickname: string | null;
  amount: number | null;
  currency: string;
  interval: string | null;
  intervalCount: number;
  productName: string | null;
}

interface CrewSubRow {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  role: string;
  subscriptionTier: string;
  subscriptionStatus: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean | null;
  pendingSubscriptionTier: string | null;
  pendingChangeEffectiveAt: string | null;
}

// Tiers an admin may manually assign via this page. Note: 'vessel_linked' is
// intentionally NOT here — those rows are only created by the vessel-roles
// invite flow and shouldn't be hand-assigned. They will still RENDER (e.g.
// in the table and the summary) using formatTierName.
const MANUAL_TIERS = [
  { value: 'free', label: 'Free' },
  { value: 'crew_limited', label: 'Crew limited' },
  { value: 'standard', label: 'Standard' },
  { value: 'premium', label: 'Premium' },
] as const;

const MANUAL_STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'past-due', label: 'Past due' },
] as const;

/** Display order for plan summary; unknown tiers append after. */
const SUMMARY_TIER_ORDER = [
  'free',
  'crew_limited',
  'vessel_linked',
  'standard',
  'premium',
] as const;

function formatTierName(tier: string) {
  if (!tier || tier === 'free') return 'Free';
  if (tier === 'crew_limited') return 'Crew Limited';
  if (tier === 'vessel_linked') return 'Vessel Linked';
  const cleaned = tier.replace(/^(sj_|sea_journey_)/i, '').trim();
  return cleaned
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function formatBillingDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return format(new Date(iso), 'dd MMM yyyy');
  } catch {
    return '—';
  }
}

function statusBadgeClass(status: string): string {
  const s = (status || '').toLowerCase().replace(/_/g, '-');
  if (s === 'active') {
    return 'bg-emerald-500/10 text-emerald-800 border-emerald-500/25 dark:text-emerald-300';
  }
  if (s === 'past-due') {
    return 'bg-amber-500/10 text-amber-900 border-amber-500/25 dark:text-amber-200';
  }
  return 'font-normal text-muted-foreground';
}

export default function CrewSubscriptionsPage() {
  const { user } = useUser();
  const { supabase } = useSupabase();
  const router = useRouter();
  const { toast } = useToast();
  const [rows, setRows] = useState<CrewSubRow[]>([]);
  const [prices, setPrices] = useState<CrewPrice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPricesLoading, setIsPricesLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [stripeDialogRow, setStripeDialogRow] = useState<CrewSubRow | null>(null);
  const [manualDialogRow, setManualDialogRow] = useState<CrewSubRow | null>(null);
  const [manualTier, setManualTier] = useState<string>('free');
  const [manualStatus, setManualStatus] = useState<string>('inactive');

  const { data: userProfileRaw, isLoading: isLoadingProfile } = useDoc<UserProfile>('users', user?.id);

  const userProfile = useMemo(() => {
    if (!userProfileRaw) return null;
    const role = (userProfileRaw as any).role || userProfileRaw.role || 'crew';
    return { ...userProfileRaw, role } as UserProfile;
  }, [userProfileRaw]);

  const isAdmin = userProfile?.role === 'admin';

  useEffect(() => {
    if (!isLoadingProfile && userProfile && !isAdmin) {
      router.push('/dashboard');
    }
  }, [isAdmin, isLoadingProfile, userProfile, router]);

  const authFetch = useCallback(
    async (url: string, init: RequestInit) => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not signed in');
      }
      return fetch(url, {
        ...init,
        headers: {
          ...init.headers,
          Authorization: `Bearer ${session.access_token}`,
        },
      });
    },
    [supabase],
  );

  const fetchCrew = useCallback(async () => {
    if (!isAdmin) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('users')
        .select(
          'id, email, first_name, last_name, username, role, subscription_tier, subscription_status, stripe_customer_id, stripe_subscription_id, current_period_end, cancel_at_period_end, pending_subscription_tier, pending_change_effective_at',
        )
        .in('role', ['crew', 'captain'])
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[CREW SUBSCRIPTIONS]', error);
        toast({
          variant: 'destructive',
          title: 'Could not load crew',
          description: error.message,
        });
        setRows([]);
        return;
      }

      setRows(
        (data || []).map((u: any) => ({
          id: u.id,
          firstName: u.first_name || '',
          lastName: u.last_name || '',
          username: u.username || '',
          email: u.email || '',
          role: u.role || 'crew',
          subscriptionTier: (u.subscription_tier || 'free').toLowerCase(),
          subscriptionStatus: (u.subscription_status || 'inactive')
            .toLowerCase()
            .replace(/_/g, '-'),
          stripeCustomerId: u.stripe_customer_id || null,
          stripeSubscriptionId: u.stripe_subscription_id || null,
          currentPeriodEnd: u.current_period_end || null,
          cancelAtPeriodEnd: u.cancel_at_period_end ?? null,
          pendingSubscriptionTier: u.pending_subscription_tier || null,
          pendingChangeEffectiveAt: u.pending_change_effective_at || null,
        })),
      );
    } finally {
      setIsLoading(false);
    }
  }, [isAdmin, supabase, toast]);

  const fetchPrices = useCallback(async () => {
    if (!isAdmin) return;
    setIsPricesLoading(true);
    try {
      const res = await authFetch('/api/admin/crew-subscription-prices', { method: 'GET' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error('[CREW SUBSCRIPTIONS] prices', json);
        setPrices([]);
        return;
      }
      setPrices(Array.isArray(json.prices) ? json.prices : []);
    } catch (e) {
      console.error('[CREW SUBSCRIPTIONS] prices', e);
      setPrices([]);
    } finally {
      setIsPricesLoading(false);
    }
  }, [authFetch, isAdmin]);

  useEffect(() => {
    if (!isAdmin || !user?.id) {
      setIsLoading(false);
      return;
    }
    void fetchCrew();
    void fetchPrices();
  }, [isAdmin, user?.id, fetchCrew, fetchPrices]);

  const filteredRows = useMemo(() => {
    if (!searchTerm.trim()) return rows;
    const q = searchTerm.toLowerCase();
    return rows.filter(
      (r) =>
        r.firstName.toLowerCase().includes(q) ||
        r.lastName.toLowerCase().includes(q) ||
        r.username.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q),
    );
  }, [rows, searchTerm]);

  const planSummary = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) {
      const t = (r.subscriptionTier || 'free').toLowerCase();
      counts.set(t, (counts.get(t) || 0) + 1);
    }
    const ordered: { tier: string; count: number }[] = [];
    const seen = new Set<string>();
    for (const t of SUMMARY_TIER_ORDER) {
      const c = counts.get(t) ?? 0;
      ordered.push({ tier: t, count: c });
      seen.add(t);
    }
    const extras = [...counts.keys()]
      .filter((k) => !seen.has(k))
      .sort();
    for (const t of extras) {
      ordered.push({ tier: t, count: counts.get(t) || 0 });
    }
    return { ordered, total: rows.length };
  }, [rows]);

  const openManualDialog = (r: CrewSubRow) => {
    const tier = (r.subscriptionTier || 'free').toLowerCase();
    setManualTier(
      MANUAL_TIERS.some((m) => m.value === tier) ? tier : 'free',
    );
    const st = (r.subscriptionStatus || 'inactive').replace(/_/g, '-');
    setManualStatus(MANUAL_STATUSES.some((s) => s.value === st) ? st : 'inactive');
    setManualDialogRow(r);
  };

  const applyStripePlan = async (row: CrewSubRow, priceId: string) => {
    if (!row.stripeSubscriptionId) {
      toast({
        variant: 'destructive',
        title: 'No Stripe subscription',
        description: 'Use manual tier for this member or they can subscribe in the app.',
      });
      return;
    }
    setSavingUserId(row.id);
    try {
      const res = await authFetch('/api/admin/users/crew-subscription', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: row.id,
          action: 'stripe_plan',
          priceId,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          variant: 'destructive',
          title: 'Plan change failed',
          description: typeof json.error === 'string' ? json.error : res.statusText,
        });
        return;
      }
      if (json.mode === 'upgrade_applied' && json.invoice?.hosted_invoice_url) {
        toast({
          title: 'Upgrade applied',
          description: 'Open the invoice if payment is required.',
        });
      } else if (json.mode === 'downgrade_scheduled') {
        toast({
          title: 'Downgrade scheduled',
          description: 'Takes effect on the next billing date.',
        });
      } else {
        toast({ title: 'Saved', description: json.message || 'Subscription updated.' });
      }
      setStripeDialogRow(null);
      await fetchCrew();
    } catch (e) {
      console.error(e);
      toast({
        variant: 'destructive',
        title: 'Request failed',
        description: e instanceof Error ? e.message : 'Unknown error',
      });
    } finally {
      setSavingUserId(null);
    }
  };

  const applyManual = async () => {
    if (!manualDialogRow) return;
    setSavingUserId(manualDialogRow.id);
    try {
      const res = await authFetch('/api/admin/users/crew-subscription', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: manualDialogRow.id,
          action: 'manual',
          subscriptionTier: manualTier,
          subscriptionStatus: manualStatus,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          variant: 'destructive',
          title: 'Update failed',
          description: typeof json.error === 'string' ? json.error : res.statusText,
        });
        return;
      }
      if (json.warning) {
        toast({ title: 'Saved', description: json.warning });
      } else {
        toast({ title: 'Saved', description: 'Tier and status updated in the database.' });
      }
      setManualDialogRow(null);
      await fetchCrew();
    } catch (e) {
      console.error(e);
      toast({
        variant: 'destructive',
        title: 'Request failed',
        description: e instanceof Error ? e.message : 'Unknown error',
      });
    } finally {
      setSavingUserId(null);
    }
  };

  const priceLabel = (p: CrewPrice) => {
    const name = formatTierName(p.tier);
    const money =
      p.amount != null ? `${p.currency} ${p.amount.toFixed(2)}` : '';
    const intv =
      p.interval === 'month'
        ? p.intervalCount && p.intervalCount > 1
          ? ` / ${p.intervalCount} mo`
          : '/mo'
        : p.interval === 'year'
          ? '/yr'
          : '';
    return [name, money ? `${money}${intv}` : ''].filter(Boolean).join(' · ');
  };

  if (isLoadingProfile) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <CreditCard className="h-8 w-8 text-primary" />
          Crew subscriptions
        </h1>
        <p className="text-muted-foreground max-w-3xl">
          Crew and captain accounts: plan tier, billing status, next renewal from{' '}
          <code className="text-xs bg-muted px-1 rounded">current_period_end</code> (synced from Stripe).
          Use <strong>Stripe plan</strong> when they have a subscription ID; use <strong>Manual</strong> only
          for comps or fixes (may diverge from Stripe if they still have an active subscription).
        </p>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Plan summary
        </h2>
        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            <Card className="rounded-xl border bg-muted/30">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardDescription className="text-xs font-medium">Total</CardDescription>
                <CardTitle className="text-2xl tabular-nums flex items-center gap-2">
                  <Users className="h-5 w-5 text-muted-foreground shrink-0" />
                  {planSummary.total}
                </CardTitle>
              </CardHeader>
            </Card>
            {planSummary.ordered.map(({ tier, count }) => (
              <Card key={tier} className="rounded-xl border">
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardDescription className="text-xs font-medium line-clamp-2 leading-tight">
                    {formatTierName(tier)}
                  </CardDescription>
                  <CardTitle className="text-2xl tabular-nums">{count}</CardTitle>
                </CardHeader>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Card className="rounded-xl border">
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>
            {rows.length} crew/captain accounts. Green status = active billing state in the app.
          </CardDescription>
          <div className="relative max-w-md pt-2">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search name, username, email…"
              className="pl-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading…
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="whitespace-nowrap">Next payment</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead className="w-[72px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                        No rows match your search.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRows.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">
                          {[r.firstName, r.lastName].filter(Boolean).join(' ') || r.username || '—'}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">
                          {r.email || '—'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {r.role}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="font-normal">
                            {formatTierName(r.subscriptionTier)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={statusBadgeClass(r.subscriptionStatus)}>
                            {r.subscriptionStatus}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            {formatBillingDate(r.currentPeriodEnd)}
                          </div>
                          {r.cancelAtPeriodEnd ? (
                            <span className="text-xs text-amber-700 dark:text-amber-300 block mt-0.5">
                              Cancels end of period
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-sm max-w-[220px]">
                          {r.pendingSubscriptionTier && r.pendingChangeEffectiveAt ? (
                            <span className="text-muted-foreground">
                              → {formatTierName(r.pendingSubscriptionTier)} on{' '}
                              {formatBillingDate(r.pendingChangeEffectiveAt)}
                            </span>
                          ) : r.stripeSubscriptionId ? (
                            <span className="text-xs text-muted-foreground font-mono truncate block">
                              sub…{r.stripeSubscriptionId.slice(-8)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">No Stripe sub</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="h-8 w-8 shrink-0"
                                disabled={savingUserId === r.id}
                                aria-label="Change subscription"
                              >
                                {savingUserId === r.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <ChevronsUpDown className="h-4 w-4" />
                                )}
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => setStripeDialogRow(r)}
                                disabled={!r.stripeSubscriptionId}
                              >
                                Change Stripe plan…
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openManualDialog(r)}>
                                Set tier manually…
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!stripeDialogRow} onOpenChange={(o) => !o && setStripeDialogRow(null)}>
        <DialogContent className="max-w-md max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Change Stripe plan</DialogTitle>
            <DialogDescription>
              {stripeDialogRow
                ? `${[stripeDialogRow.firstName, stripeDialogRow.lastName].filter(Boolean).join(' ') || stripeDialogRow.email}`
                : ''}
              {stripeDialogRow && !stripeDialogRow.stripeSubscriptionId ? (
                <span className="flex items-center gap-2 mt-2 text-destructive text-sm">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  No subscription on file — use manual tier instead.
                </span>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 space-y-2 pr-1">
            {isPricesLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : prices.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No Stripe prices loaded. Check STRIPE_SUBSCRIPTION_PRODUCT_ID and API logs.
              </p>
            ) : (
              prices.map((p) => (
                <Button
                  key={p.id}
                  type="button"
                  variant="outline"
                  className="w-full justify-start h-auto py-3 px-3 text-left font-normal"
                  disabled={!stripeDialogRow?.stripeSubscriptionId || savingUserId === stripeDialogRow?.id}
                  onClick={() => stripeDialogRow && void applyStripePlan(stripeDialogRow, p.id)}
                >
                  <span className="text-sm">{priceLabel(p)}</span>
                </Button>
              ))
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setStripeDialogRow(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!manualDialogRow} onOpenChange={(o) => !o && setManualDialogRow(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manual tier &amp; status</DialogTitle>
            <DialogDescription>
              Writes directly to the database. Stripe will still charge the old plan unless you change or
              cancel it in Stripe.
            </DialogDescription>
            {manualDialogRow &&
            !MANUAL_TIERS.some(
              (m) => m.value === (manualDialogRow.subscriptionTier || '').toLowerCase(),
            ) ? (
              <p className="text-sm text-amber-700 dark:text-amber-300 pt-2">
                Current tier in database:{' '}
                <strong>{formatTierName(manualDialogRow.subscriptionTier)}</strong> (legacy). Choose a
                tier below and save to align with plans you offer.
              </p>
            ) : null}
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <p className="text-sm font-medium">Tier</p>
              <Select value={manualTier} onValueChange={setManualTier}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MANUAL_TIERS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Status</p>
              <Select value={manualStatus} onValueChange={setManualStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MANUAL_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setManualDialogRow(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void applyManual()}
              disabled={savingUserId === manualDialogRow?.id}
            >
              {savingUserId === manualDialogRow?.id ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving…
                </>
              ) : (
                'Save'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
