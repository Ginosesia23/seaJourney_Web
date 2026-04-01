'use client';

import { useState, useEffect, useMemo } from 'react';
import { useUser, useSupabase } from '@/supabase';
import { useDoc } from '@/supabase/database';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
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
import { Button } from '@/components/ui/button';
import { Megaphone, Loader2, Search, Users, Ban, CircleDollarSign, ChevronsUpDown, Check } from 'lucide-react';
import type { UserProfile } from '@/lib/types';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';

type AdsFilter = 'all' | 'ad_free' | 'ads_on' | 'unset';

interface UserAdsRow {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  role: string;
  ads: boolean | null;
}

function normalizeAds(value: unknown): boolean | null {
  if (value === true || value === false) return value;
  if (value === 'true' || value === 't') return true;
  if (value === 'false' || value === 'f') return false;
  return null;
}

function adsStatusBadgeClass(ads: boolean | null): string {
  if (ads === false) {
    return 'bg-emerald-500/10 text-emerald-800 border-emerald-500/25 dark:text-emerald-300';
  }
  if (ads === true) {
    return 'bg-amber-500/10 text-amber-900 border-amber-500/25 dark:text-amber-200';
  }
  return 'font-normal text-muted-foreground';
}

function adsStatusLabel(ads: boolean | null): string {
  if (ads === false) return 'No-Ads';
  if (ads === true) return 'Ads-Showing';
  return 'Not Set';
}

export default function AdRevenueTrackingPage() {
  const { user } = useUser();
  const { supabase } = useSupabase();
  const router = useRouter();
  const { toast } = useToast();
  const [rows, setRows] = useState<UserAdsRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [adsFilter, setAdsFilter] = useState<AdsFilter>('all');
  const [savingUserId, setSavingUserId] = useState<string | null>(null);

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

  useEffect(() => {
    if (!isAdmin || !user?.id) {
      setIsLoading(false);
      return;
    }

    const fetchRows = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('users')
          .select('id, first_name, last_name, username, email, role, ads')
          .neq('role', 'admin')
          .order('created_at', { ascending: false });

        if (error) {
          console.error('[AD REVENUE TRACKING] Error fetching users:', error);
          setRows([]);
          return;
        }

        const mapped: UserAdsRow[] = (data || []).map((u: any) => ({
          id: u.id,
          firstName: u.first_name || '',
          lastName: u.last_name || '',
          username: u.username || '',
          email: u.email || '',
          role: u.role || 'crew',
          ads: normalizeAds(u.ads),
        }));
        setRows(mapped);
      } catch (e) {
        console.error('[AD REVENUE TRACKING]', e);
        setRows([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchRows();
  }, [isAdmin, user?.id, supabase]);

  const updateUserAds = async (
    targetUserId: string,
    ads: boolean | null,
    previousAds?: boolean | null
  ) => {
    if (previousAds !== undefined && previousAds === ads) {
      return;
    }
    setSavingUserId(targetUserId);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast({
          variant: 'destructive',
          title: 'Not signed in',
          description: 'Refresh the page and try again.',
        });
        return;
      }

      const res = await fetch('/api/admin/users/ads-flag', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ userId: targetUserId, ads }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          variant: 'destructive',
          title: 'Could not save',
          description: typeof json.error === 'string' ? json.error : res.statusText,
        });
        return;
      }

      setRows((prev) =>
        prev.map((r) => (r.id === targetUserId ? { ...r, ads } : r))
      );
      toast({ title: 'Saved', description: 'Ads flag updated.' });
    } catch (e) {
      console.error('[AD REVENUE TRACKING] update', e);
      toast({
        variant: 'destructive',
        title: 'Could not save',
        description: 'Network or server error.',
      });
    } finally {
      setSavingUserId(null);
    }
  };

  const stats = useMemo(() => {
    let adFree = 0;
    let adsOn = 0;
    let unset = 0;
    for (const r of rows) {
      if (r.ads === false) adFree += 1;
      else if (r.ads === true) adsOn += 1;
      else unset += 1;
    }
    return { adFree, adsOn, unset, total: rows.length };
  }, [rows]);

  const filteredRows = useMemo(() => {
    let list = rows;
    if (adsFilter === 'ad_free') list = list.filter((r) => r.ads === false);
    else if (adsFilter === 'ads_on') list = list.filter((r) => r.ads === true);
    else if (adsFilter === 'unset') list = list.filter((r) => r.ads === null);

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter(
        (r) =>
          r.firstName.toLowerCase().includes(q) ||
          r.lastName.toLowerCase().includes(q) ||
          r.username.toLowerCase().includes(q) ||
          r.email.toLowerCase().includes(q)
      );
    }
    return list;
  }, [rows, adsFilter, searchTerm]);

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
          <Megaphone className="h-8 w-8 text-primary" />
          Ads tracking
        </h1>
        <p className="text-muted-foreground max-w-2xl">
          Uses the <code className="text-xs bg-muted px-1 py-0.5 rounded">users.ads</code> flag:{' '}
          <strong>No-Ads</strong> when <code className="text-xs bg-muted px-1 rounded">false</code>,{' '}
          <strong>Ads-Showing</strong> when <code className="text-xs bg-muted px-1 rounded">true</code>.
          Status is shown as a colored badge; use the chevron button beside it to change and save.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="rounded-xl border">
          <CardHeader className="pb-2">
            <CardDescription>Total accounts</CardDescription>
            <CardTitle className="text-2xl flex items-center gap-2">
              <Users className="h-5 w-5 text-muted-foreground" />
              {isLoading ? '—' : stats.total}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="rounded-xl border border-emerald-500/20 bg-emerald-500/5">
          <CardHeader className="pb-2">
            <CardDescription>No-Ads</CardDescription>
            <CardTitle className="text-2xl flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
              <CircleDollarSign className="h-5 w-5" />
              {isLoading ? '—' : stats.adFree}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="rounded-xl border border-amber-500/20 bg-amber-500/5">
          <CardHeader className="pb-2">
            <CardDescription>Ads-Showing</CardDescription>
            <CardTitle className="text-2xl flex items-center gap-2 text-amber-900 dark:text-amber-200">
              <Megaphone className="h-5 w-5" />
              {isLoading ? '—' : stats.adsOn}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="rounded-xl border">
          <CardHeader className="pb-2">
            <CardDescription>Not Set</CardDescription>
            <CardTitle className="text-2xl flex items-center gap-2">
              <Ban className="h-5 w-5 text-muted-foreground" />
              {isLoading ? '—' : stats.unset}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card className="rounded-xl border">
        <CardHeader>
          <CardTitle>Accounts</CardTitle>
          <CardDescription>
            All non-admin users. Green = No-Ads, amber = Ads-Showing, muted = Not Set. Use the button next to each badge to update.
          </CardDescription>
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search name, username, email…"
                className="pl-9"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Select value={adsFilter} onValueChange={(v) => setAdsFilter(v as AdsFilter)}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Filter by ads" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="ad_free">No-Ads</SelectItem>
                <SelectItem value="ads_on">Ads-Showing</SelectItem>
                <SelectItem value="unset">Not Set</SelectItem>
              </SelectContent>
            </Select>
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
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="min-w-[200px]">Ads flag</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                        No rows match your filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRows.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">
                          {[r.firstName, r.lastName].filter(Boolean).join(' ') || r.username || '—'}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{r.email || '—'}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {r.role}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className={adsStatusBadgeClass(r.ads)}
                            >
                              {adsStatusLabel(r.ads)}
                            </Badge>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  className="h-8 w-8 shrink-0"
                                  disabled={savingUserId === r.id}
                                  aria-label="Change ads flag"
                                >
                                  {savingUserId === r.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <ChevronsUpDown className="h-4 w-4" />
                                  )}
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-56">
                                <DropdownMenuItem
                                  onClick={() => void updateUserAds(r.id, false, r.ads)}
                                  className="flex justify-between gap-2"
                                >
                                  <span>No-Ads</span>
                                  {r.ads === false ? (
                                    <Check className="h-4 w-4 shrink-0 opacity-70" />
                                  ) : null}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => void updateUserAds(r.id, true, r.ads)}
                                  className="flex justify-between gap-2"
                                >
                                  <span>Ads-Showing</span>
                                  {r.ads === true ? (
                                    <Check className="h-4 w-4 shrink-0 opacity-70" />
                                  ) : null}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => void updateUserAds(r.id, null, r.ads)}
                                  className="flex justify-between gap-2"
                                >
                                  <span>Not Set</span>
                                  {r.ads === null ? (
                                    <Check className="h-4 w-4 shrink-0 opacity-70" />
                                  ) : null}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
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
    </div>
  );
}
