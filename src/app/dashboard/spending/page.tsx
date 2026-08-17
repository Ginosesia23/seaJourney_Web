'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  Wallet,
  TrendingUp,
  TrendingDown,
  RefreshCw,
} from 'lucide-react';
import { useUser, useSupabase } from '@/supabase';
import { useDoc } from '@/supabase/database';
import type { UserProfile } from '@/lib/types';
import { getSubscriptionTierPricingMap } from '@/app/actions';
import { lookupTierPriceGbp } from '@/lib/subscription-tier-pricing';
import { countsTowardPaidMrr } from '@/supabase/database/subscription-helpers';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { cn } from '@/lib/utils';

type Cadence = 'monthly' | 'yearly' | 'one_time';
type Category = 'database' | 'hosting' | 'domain' | 'tools' | 'marketing' | 'other';

type OperatingCost = {
  id: string;
  name: string;
  category: Category;
  amountGbp: number;
  cadence: Cadence;
  billingDay: number | null;
  startDate: string | null;
  endDate: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type CostForm = {
  name: string;
  category: Category;
  amountGbp: string;
  cadence: Cadence;
  billingDay: string;
  startDate: string;
  endDate: string;
  notes: string;
  isActive: boolean;
};

const EMPTY_FORM: CostForm = {
  name: '',
  category: 'other',
  amountGbp: '',
  cadence: 'monthly',
  billingDay: '',
  startDate: '',
  endDate: '',
  notes: '',
  isActive: true,
};

const CATEGORY_LABELS: Record<Category, string> = {
  database: 'Database',
  hosting: 'Hosting',
  domain: 'Domain',
  tools: 'Tools',
  marketing: 'Marketing',
  other: 'Other',
};

const CADENCE_LABELS: Record<Cadence, string> = {
  monthly: 'Monthly',
  yearly: 'Yearly',
  one_time: 'One-time',
};

function gbp(n: number) {
  return `£${n.toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function monthlyEquivalent(amount: number, cadence: Cadence): number {
  if (cadence === 'yearly') return amount / 12;
  if (cadence === 'monthly') return amount;
  return 0;
}

function costToForm(c: OperatingCost): CostForm {
  return {
    name: c.name,
    category: c.category,
    amountGbp: String(c.amountGbp),
    cadence: c.cadence,
    billingDay: c.billingDay != null ? String(c.billingDay) : '',
    startDate: c.startDate || '',
    endDate: c.endDate || '',
    notes: c.notes || '',
    isActive: c.isActive,
  };
}

export default function SpendingPage() {
  const { user } = useUser();
  const { supabase } = useSupabase();
  const router = useRouter();
  const { toast } = useToast();

  const { data: profileRaw, isLoading: isLoadingProfile } = useDoc<UserProfile>(
    'users',
    user?.id,
  );

  const isAdmin = useMemo(() => {
    const role = (
      (profileRaw as { role?: string } | null)?.role ||
      (profileRaw as UserProfile | null)?.role ||
      ''
    )
      .toString()
      .toLowerCase()
      .trim();
    return role === 'admin';
  }, [profileRaw]);

  const [costs, setCosts] = useState<OperatingCost[]>([]);
  const [monthlyRevenue, setMonthlyRevenue] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CostForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const getToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }, [supabase]);

  const loadRevenue = useCallback(async () => {
    const [crewRes, vesselRes, tierPricing] = await Promise.all([
      supabase
        .from('users')
        .select('subscription_status, subscription_tier, role, stripe_subscription_id, current_period_end')
        .neq('role', 'vessel'),
      supabase
        .from('users')
        .select('subscription_status, subscription_tier, role, stripe_subscription_id, current_period_end')
        .eq('role', 'vessel'),
      getSubscriptionTierPricingMap(),
    ]);

    let mrr = 0;
    for (const row of [...(crewRes.data || []), ...(vesselRes.data || [])]) {
      if (!countsTowardPaidMrr(row)) continue;
      const tier = String(row.subscription_tier || '');
      const price = lookupTierPriceGbp(tierPricing, tier);
      if (price > 0) mrr += price;
    }
    setMonthlyRevenue(Math.round(mrr * 100) / 100);
  }, [supabase]);

  const loadCosts = useCallback(async () => {
    const token = await getToken();
    if (!token) throw new Error('Not signed in');
    const res = await fetch('/api/admin/operating-costs', {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to load costs');
    setCosts((json.costs || []) as OperatingCost[]);
  }, [getToken]);

  const loadAll = useCallback(async () => {
    setIsLoading(true);
    try {
      await Promise.all([loadCosts(), loadRevenue()]);
    } catch (err) {
      toast({
        title: 'Could not load spending',
        description: err instanceof Error ? err.message : 'Try again',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [loadCosts, loadRevenue, toast]);

  useEffect(() => {
    if (isLoadingProfile || !profileRaw) return;
    if (!isAdmin) {
      router.replace('/dashboard');
      return;
    }
    void loadAll();
  }, [isAdmin, isLoadingProfile, profileRaw, loadAll, router]);

  const activeCosts = useMemo(() => costs.filter((c) => c.isActive), [costs]);
  const monthlySpend = useMemo(
    () =>
      Math.round(
        activeCosts.reduce(
          (sum, c) => sum + monthlyEquivalent(c.amountGbp, c.cadence),
          0,
        ) * 100,
      ) / 100,
    [activeCosts],
  );
  const monthlyNet = Math.round((monthlyRevenue - monthlySpend) * 100) / 100;
  const annualRevenue = Math.round(monthlyRevenue * 12 * 100) / 100;
  const annualSpend = Math.round(monthlySpend * 12 * 100) / 100;
  const annualNet = Math.round((annualRevenue - annualSpend) * 100) / 100;

  const spendByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of activeCosts) {
      const m = monthlyEquivalent(c.amountGbp, c.cadence);
      if (m <= 0) continue;
      map[c.category] = (map[c.category] || 0) + m;
    }
    return Object.entries(map)
      .map(([category, amount]) => ({
        category: category as Category,
        amount: Math.round(amount * 100) / 100,
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [activeCosts]);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (c: OperatingCost) => {
    setEditingId(c.id);
    setForm(costToForm(c));
    setDialogOpen(true);
  };

  const saveCost = async () => {
    const amount = Number(form.amountGbp);
    if (!form.name.trim()) {
      toast({ title: 'Name is required', variant: 'destructive' });
      return;
    }
    if (!Number.isFinite(amount) || amount < 0) {
      toast({ title: 'Enter a valid amount', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const token = await getToken();
      if (!token) throw new Error('Not signed in');

      const payload = {
        name: form.name.trim(),
        category: form.category,
        amountGbp: amount,
        cadence: form.cadence,
        billingDay: form.billingDay ? Number(form.billingDay) : null,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
        notes: form.notes.trim() || null,
        isActive: form.isActive,
        ...(editingId ? { id: editingId } : {}),
      };

      const res = await fetch('/api/admin/operating-costs', {
        method: editingId ? 'PATCH' : 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Save failed');

      toast({
        title: editingId ? 'Cost updated' : 'Cost added',
        description: form.name.trim(),
      });
      setDialogOpen(false);
      await loadCosts();
    } catch (err) {
      toast({
        title: 'Could not save',
        description: err instanceof Error ? err.message : 'Try again',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (c: OperatingCost) => {
    try {
      const token = await getToken();
      if (!token) throw new Error('Not signed in');
      const res = await fetch('/api/admin/operating-costs', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: c.id, isActive: !c.isActive }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Update failed');
      await loadCosts();
    } catch (err) {
      toast({
        title: 'Could not update',
        description: err instanceof Error ? err.message : 'Try again',
        variant: 'destructive',
      });
    }
  };

  const deleteCost = async (c: OperatingCost) => {
    if (!window.confirm(`Delete “${c.name}”? This cannot be undone.`)) return;
    setDeletingId(c.id);
    try {
      const token = await getToken();
      if (!token) throw new Error('Not signed in');
      const res = await fetch(
        `/api/admin/operating-costs?id=${encodeURIComponent(c.id)}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Delete failed');
      toast({ title: 'Cost deleted', description: c.name });
      await loadCosts();
    } catch (err) {
      toast({
        title: 'Could not delete',
        description: err instanceof Error ? err.message : 'Try again',
        variant: 'destructive',
      });
    } finally {
      setDeletingId(null);
    }
  };

  if (isLoadingProfile || (!profileRaw && user)) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Wallet className="h-6 w-6" />
            Spending &amp; profit
          </h1>
          <p className="text-muted-foreground mt-1">
            Track monthly operating costs against subscription revenue
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void loadAll()} disabled={isLoading}>
            <RefreshCw className={cn('h-4 w-4 mr-1.5', isLoading && 'animate-spin')} />
            Refresh
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1.5" />
            Add cost
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Monthly revenue (MRR)</CardDescription>
                <CardTitle className="text-2xl text-emerald-600 dark:text-emerald-400">
                  {gbp(monthlyRevenue)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  Active subscriptions · {gbp(annualRevenue)} / yr
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Monthly spend</CardDescription>
                <CardTitle className="text-2xl text-amber-600 dark:text-amber-400">
                  {gbp(monthlySpend)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  {activeCosts.length} active cost
                  {activeCosts.length === 1 ? '' : 's'} · {gbp(annualSpend)} / yr
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Monthly net</CardDescription>
                <CardTitle
                  className={cn(
                    'text-2xl flex items-center gap-2',
                    monthlyNet >= 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-red-600 dark:text-red-400',
                  )}
                >
                  {monthlyNet >= 0 ? (
                    <TrendingUp className="h-5 w-5" />
                  ) : (
                    <TrendingDown className="h-5 w-5" />
                  )}
                  {gbp(monthlyNet)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  Revenue − recurring spend
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Annual net (projected)</CardDescription>
                <CardTitle
                  className={cn(
                    'text-2xl',
                    annualNet >= 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-red-600 dark:text-red-400',
                  )}
                >
                  {gbp(annualNet)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  {gbp(annualRevenue)} − {gbp(annualSpend)}
                </p>
              </CardContent>
            </Card>
          </div>

          {spendByCategory.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Spend by category</CardTitle>
                <CardDescription>Monthly equivalent of active recurring costs</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {spendByCategory.map(({ category, amount }) => {
                  const pct = monthlySpend > 0 ? (amount / monthlySpend) * 100 : 0;
                  return (
                    <div key={category} className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <span>{CATEGORY_LABELS[category]}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {gbp(amount)} · {pct.toFixed(0)}%
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-amber-500/80"
                          style={{ width: `${Math.min(100, pct)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-base">Operating costs</CardTitle>
                <CardDescription>
                  Recurring payments (Supabase, hosting, domains, tools…). Yearly amounts are
                  divided by 12 for monthly net.
                </CardDescription>
              </div>
              <Button size="sm" variant="secondary" onClick={openCreate}>
                <Plus className="h-4 w-4 mr-1.5" />
                Add
              </Button>
            </CardHeader>
            <CardContent>
              {costs.length === 0 ? (
                <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                  No costs yet. Add things like Supabase, domain, Vercel, email, etc.
                </div>
              ) : (
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Cadence</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Monthly eq.</TableHead>
                        <TableHead>Active</TableHead>
                        <TableHead className="w-[100px]" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {costs.map((c) => {
                        const monthlyEq = monthlyEquivalent(c.amountGbp, c.cadence);
                        return (
                          <TableRow
                            key={c.id}
                            className={cn(!c.isActive && 'opacity-50')}
                          >
                            <TableCell>
                              <div className="font-medium">{c.name}</div>
                              {c.notes && (
                                <div className="text-xs text-muted-foreground line-clamp-1">
                                  {c.notes}
                                </div>
                              )}
                              {c.billingDay != null && (
                                <div className="text-xs text-muted-foreground">
                                  Bills day {c.billingDay}
                                </div>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary">
                                {CATEGORY_LABELS[c.category] || c.category}
                              </Badge>
                            </TableCell>
                            <TableCell>{CADENCE_LABELS[c.cadence]}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {gbp(c.amountGbp)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-muted-foreground">
                              {c.cadence === 'one_time' ? '—' : gbp(monthlyEq)}
                            </TableCell>
                            <TableCell>
                              <Switch
                                checked={c.isActive}
                                onCheckedChange={() => void toggleActive(c)}
                                aria-label={`Toggle ${c.name}`}
                              />
                            </TableCell>
                            <TableCell>
                              <div className="flex justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => openEdit(c)}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive"
                                  disabled={deletingId === c.id}
                                  onClick={() => void deleteCost(c)}
                                >
                                  {deletingId === c.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-3.5 w-3.5" />
                                  )}
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit cost' : 'Add operating cost'}</DialogTitle>
            <DialogDescription>
              Monthly and yearly costs feed the net profit calculation. One-time costs are
              tracked but excluded from monthly spend.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="cost-name">Name</Label>
              <Input
                id="cost-name"
                placeholder="Supabase Pro"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Category</Label>
                <Select
                  value={form.category}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, category: v as Category }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(CATEGORY_LABELS) as Category[]).map((key) => (
                      <SelectItem key={key} value={key}>
                        {CATEGORY_LABELS[key]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Cadence</Label>
                <Select
                  value={form.cadence}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, cadence: v as Cadence }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(CADENCE_LABELS) as Cadence[]).map((key) => (
                      <SelectItem key={key} value={key}>
                        {CADENCE_LABELS[key]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="cost-amount">Amount (GBP)</Label>
                <Input
                  id="cost-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="25.00"
                  value={form.amountGbp}
                  onChange={(e) => setForm((f) => ({ ...f, amountGbp: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="cost-day">Billing day (optional)</Label>
                <Input
                  id="cost-day"
                  type="number"
                  min="1"
                  max="28"
                  placeholder="1–28"
                  value={form.billingDay}
                  onChange={(e) => setForm((f) => ({ ...f, billingDay: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="cost-start">Start date</Label>
                <Input
                  id="cost-start"
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="cost-end">End date</Label>
                <Input
                  id="cost-end"
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="cost-notes">Notes</Label>
              <Textarea
                id="cost-notes"
                rows={2}
                placeholder="Invoice email, plan name…"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>

            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <div>
                <Label htmlFor="cost-active">Active</Label>
                <p className="text-xs text-muted-foreground">
                  Inactive costs stay listed but don’t count toward spend
                </p>
              </div>
              <Switch
                id="cost-active"
                checked={form.isActive}
                onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void saveCost()} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {editingId ? 'Save' : 'Add cost'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
