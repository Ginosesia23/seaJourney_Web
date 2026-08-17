'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  TicketPercent,
  Copy,
  RefreshCw,
  Users,
} from 'lucide-react';
import { useUser, useSupabase } from '@/supabase';
import { useDoc } from '@/supabase/database';
import type { UserProfile } from '@/lib/types';
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

type RewardTier = 'premium' | 'standard' | 'professional';

type PartnerCode = {
  id: string;
  companyName: string;
  code: string;
  rewardTier: RewardTier;
  rewardDays: number;
  maxRedemptions: number | null;
  redemptionCount: number;
  expiresAt: string | null;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
};

type Redemption = {
  id: string;
  userId: string;
  email: string | null;
  name: string;
  rewardTier: string;
  periodEnd: string;
  appliedAt: string;
};

type CodeForm = {
  companyName: string;
  code: string;
  rewardTier: RewardTier;
  rewardDays: string;
  maxRedemptions: string;
  expiresAt: string;
  notes: string;
  isActive: boolean;
};

const EMPTY_FORM: CodeForm = {
  companyName: '',
  code: '',
  rewardTier: 'premium',
  rewardDays: '30',
  maxRedemptions: '',
  expiresAt: '',
  notes: '',
  isActive: true,
};

const TIER_LABELS: Record<RewardTier, string> = {
  premium: 'Premium',
  standard: 'Standard',
  professional: 'Professional',
};

function toForm(c: PartnerCode): CodeForm {
  return {
    companyName: c.companyName,
    code: c.code,
    rewardTier: c.rewardTier,
    rewardDays: String(c.rewardDays),
    maxRedemptions: c.maxRedemptions != null ? String(c.maxRedemptions) : '',
    expiresAt: c.expiresAt ? c.expiresAt.slice(0, 10) : '',
    notes: c.notes || '',
    isActive: c.isActive,
  };
}

export default function PartnerCodesPage() {
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

  const [codes, setCodes] = useState<PartnerCode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CodeForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [redemptionsFor, setRedemptionsFor] = useState<PartnerCode | null>(null);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [loadingRedemptions, setLoadingRedemptions] = useState(false);

  const getToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }, [supabase]);

  const loadCodes = useCallback(async () => {
    const token = await getToken();
    if (!token) throw new Error('Not signed in');
    const res = await fetch('/api/admin/partner-promo-codes', {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to load codes');
    setCodes((json.codes || []) as PartnerCode[]);
  }, [getToken]);

  const loadAll = useCallback(async () => {
    setIsLoading(true);
    try {
      await loadCodes();
    } catch (err) {
      toast({
        title: 'Could not load partner codes',
        description: err instanceof Error ? err.message : 'Try again',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [loadCodes, toast]);

  useEffect(() => {
    if (isLoadingProfile || !profileRaw) return;
    if (!isAdmin) {
      router.replace('/dashboard');
      return;
    }
    void loadAll();
  }, [isAdmin, isLoadingProfile, profileRaw, loadAll, router]);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (c: PartnerCode) => {
    setEditingId(c.id);
    setForm(toForm(c));
    setDialogOpen(true);
  };

  const signupUrl = (code: string) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${origin}/signup?code=${encodeURIComponent(code)}`;
  };

  const copyLink = async (code: string) => {
    try {
      await navigator.clipboard.writeText(signupUrl(code));
      toast({ title: 'Signup link copied', description: signupUrl(code) });
    } catch {
      toast({ title: 'Could not copy', variant: 'destructive' });
    }
  };

  const saveCode = async () => {
    const days = Number(form.rewardDays);
    if (!form.companyName.trim() || !form.code.trim()) {
      toast({ title: 'Company name and code are required', variant: 'destructive' });
      return;
    }
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      toast({ title: 'Reward days must be 1–365', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const token = await getToken();
      if (!token) throw new Error('Not signed in');
      const payload = {
        companyName: form.companyName.trim(),
        code: form.code.trim().toUpperCase(),
        rewardTier: form.rewardTier,
        rewardDays: days,
        maxRedemptions: form.maxRedemptions ? Number(form.maxRedemptions) : null,
        expiresAt: form.expiresAt || null,
        notes: form.notes.trim() || null,
        isActive: form.isActive,
        ...(editingId ? { id: editingId } : {}),
      };
      const res = await fetch('/api/admin/partner-promo-codes', {
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
        title: editingId ? 'Code updated' : 'Code created',
        description: payload.code,
      });
      setDialogOpen(false);
      await loadCodes();
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

  const toggleActive = async (c: PartnerCode) => {
    try {
      const token = await getToken();
      if (!token) throw new Error('Not signed in');
      const res = await fetch('/api/admin/partner-promo-codes', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: c.id, isActive: !c.isActive }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Update failed');
      await loadCodes();
    } catch (err) {
      toast({
        title: 'Could not update',
        description: err instanceof Error ? err.message : 'Try again',
        variant: 'destructive',
      });
    }
  };

  const deleteCode = async (c: PartnerCode) => {
    if (!window.confirm(`Delete code “${c.code}” for ${c.companyName}?`)) return;
    setDeletingId(c.id);
    try {
      const token = await getToken();
      if (!token) throw new Error('Not signed in');
      const res = await fetch(
        `/api/admin/partner-promo-codes?id=${encodeURIComponent(c.id)}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Delete failed');
      toast({ title: 'Code deleted', description: c.code });
      await loadCodes();
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

  const openRedemptions = async (c: PartnerCode) => {
    setRedemptionsFor(c);
    setLoadingRedemptions(true);
    try {
      const token = await getToken();
      if (!token) throw new Error('Not signed in');
      const res = await fetch(
        `/api/admin/partner-promo-codes?id=${encodeURIComponent(c.id)}`,
        { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load');
      setRedemptions((json.redemptions || []) as Redemption[]);
    } catch (err) {
      toast({
        title: 'Could not load signups',
        description: err instanceof Error ? err.message : 'Try again',
        variant: 'destructive',
      });
      setRedemptions([]);
    } finally {
      setLoadingRedemptions(false);
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

  const totalRedemptions = codes.reduce((sum, c) => sum + c.redemptionCount, 0);
  const activeCodes = codes.filter((c) => c.isActive).length;

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <TicketPercent className="h-6 w-6" />
            Partner codes
          </h1>
          <p className="text-muted-foreground mt-1">
            Give training companies a signup code. Students get a free month of Premium
            (or another plan) — no card required.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void loadAll()} disabled={isLoading}>
            <RefreshCw className={cn('h-4 w-4 mr-1.5', isLoading && 'animate-spin')} />
            Refresh
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1.5" />
            New code
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Active codes</CardDescription>
                <CardTitle className="text-2xl">{activeCodes}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total signups via codes</CardDescription>
                <CardTitle className="text-2xl">{totalRedemptions}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Share link</CardDescription>
                <CardTitle className="text-sm font-normal text-muted-foreground">
                  /signup?code=THEIRCODE
                </CardTitle>
              </CardHeader>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Codes</CardTitle>
              <CardDescription>
                Copy the signup link for a company. Each student can use one partner code.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {codes.length === 0 ? (
                <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                  No codes yet. Create one for a school or training company.
                </div>
              ) : (
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Company</TableHead>
                        <TableHead>Code</TableHead>
                        <TableHead>Reward</TableHead>
                        <TableHead>Signups</TableHead>
                        <TableHead>Active</TableHead>
                        <TableHead className="w-[140px]" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {codes.map((c) => {
                        const exhausted =
                          c.maxRedemptions != null &&
                          c.redemptionCount >= c.maxRedemptions;
                        const expired =
                          !!c.expiresAt && new Date(c.expiresAt).getTime() <= Date.now();
                        return (
                          <TableRow
                            key={c.id}
                            className={cn((!c.isActive || expired) && 'opacity-50')}
                          >
                            <TableCell>
                              <div className="font-medium">{c.companyName}</div>
                              {c.notes && (
                                <div className="text-xs text-muted-foreground line-clamp-1">
                                  {c.notes}
                                </div>
                              )}
                              {c.expiresAt && (
                                <div className="text-xs text-muted-foreground">
                                  Expires {format(new Date(c.expiresAt), 'd MMM yyyy')}
                                </div>
                              )}
                            </TableCell>
                            <TableCell>
                              <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                                {c.code}
                              </code>
                            </TableCell>
                            <TableCell>
                              {c.rewardDays}d {TIER_LABELS[c.rewardTier] || c.rewardTier}
                            </TableCell>
                            <TableCell>
                              <button
                                type="button"
                                className="text-sm tabular-nums underline-offset-2 hover:underline"
                                onClick={() => void openRedemptions(c)}
                              >
                                {c.redemptionCount}
                                {c.maxRedemptions != null ? ` / ${c.maxRedemptions}` : ''}
                                {exhausted ? ' (full)' : ''}
                              </button>
                            </TableCell>
                            <TableCell>
                              <Switch
                                checked={c.isActive}
                                onCheckedChange={() => void toggleActive(c)}
                                aria-label={`Toggle ${c.code}`}
                              />
                            </TableCell>
                            <TableCell>
                              <div className="flex justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => void copyLink(c.code)}
                                  title="Copy signup link"
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => void openRedemptions(c)}
                                  title="View signups"
                                >
                                  <Users className="h-3.5 w-3.5" />
                                </Button>
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
                                  onClick={() => void deleteCode(c)}
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
            <DialogTitle>{editingId ? 'Edit partner code' : 'New partner code'}</DialogTitle>
            <DialogDescription>
              Students enter this at signup, or open /signup?code=YOURCODE
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="pc-company">Company / school</Label>
              <Input
                id="pc-company"
                placeholder="UKSA"
                value={form.companyName}
                onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pc-code">Code</Label>
              <Input
                id="pc-code"
                placeholder="UKSA2026"
                value={form.code}
                onChange={(e) =>
                  setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Reward plan</Label>
                <Select
                  value={form.rewardTier}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, rewardTier: v as RewardTier }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(TIER_LABELS) as RewardTier[]).map((key) => (
                      <SelectItem key={key} value={key}>
                        {TIER_LABELS[key]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="pc-days">Free days</Label>
                <Input
                  id="pc-days"
                  type="number"
                  min="1"
                  max="365"
                  value={form.rewardDays}
                  onChange={(e) => setForm((f) => ({ ...f, rewardDays: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="pc-max">Max signups (optional)</Label>
                <Input
                  id="pc-max"
                  type="number"
                  min="1"
                  placeholder="Unlimited"
                  value={form.maxRedemptions}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, maxRedemptions: e.target.value }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="pc-exp">Code expires</Label>
                <Input
                  id="pc-exp"
                  type="date"
                  value={form.expiresAt}
                  onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pc-notes">Notes</Label>
              <Textarea
                id="pc-notes"
                rows={2}
                placeholder="Contact at the school, campaign name…"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <div>
                <Label htmlFor="pc-active">Active</Label>
                <p className="text-xs text-muted-foreground">
                  Inactive codes are rejected at signup
                </p>
              </div>
              <Switch
                id="pc-active"
                checked={form.isActive}
                onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void saveCode()} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {editingId ? 'Save' : 'Create code'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!redemptionsFor}
        onOpenChange={(open) => {
          if (!open) setRedemptionsFor(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Signups · {redemptionsFor?.code}
            </DialogTitle>
            <DialogDescription>
              {redemptionsFor?.companyName}
            </DialogDescription>
          </DialogHeader>
          {loadingRedemptions ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : redemptions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No signups yet.</p>
          ) : (
            <div className="max-h-80 overflow-y-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Applied</TableHead>
                    <TableHead>Until</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {redemptions.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className="font-medium">{r.name || '—'}</div>
                        <div className="text-xs text-muted-foreground">{r.email}</div>
                      </TableCell>
                      <TableCell className="text-xs">
                        {format(new Date(r.appliedAt), 'd MMM yyyy')}
                      </TableCell>
                      <TableCell className="text-xs">
                        {format(new Date(r.periodEnd), 'd MMM yyyy')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
