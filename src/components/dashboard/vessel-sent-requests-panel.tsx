'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import { FileSignature, Loader2, Users } from 'lucide-react';

import { useSupabase, useUser } from '@/supabase';
import { useDoc } from '@/supabase/database';
import type { UserProfile } from '@/lib/types';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

type KindFilter = 'all' | 'testimonial' | 'access';
type StatusFilter = 'pending' | 'past' | 'all';
type ItemStatus = 'pending' | 'approved' | 'rejected';

type UserLite = {
  id: string;
  email?: string | null;
  username?: string | null;
  first_name?: string | null;
  last_name?: string | null;
};

export type VesselSentRequestItem = {
  id: string;
  kind: 'testimonial' | 'access';
  status: ItemStatus;
  statusText: string;
  createdAt: string;
  crewUserId: string;
  crewName: string;
  period: string;
  days: string;
  captainName: string;
  href: string;
};

function personName(u?: UserLite | null, fallback?: string | null): string {
  if (!u) return fallback?.trim() || 'Unknown';
  const full = [u.first_name, u.last_name].filter(Boolean).join(' ').trim();
  return full || u.username || u.email || fallback?.trim() || 'Unknown';
}

function testimonialStatus(status: string | null | undefined): ItemStatus | null {
  if (status === 'pending_captain' || status === 'pending_official') return 'pending';
  if (status === 'approved') return 'approved';
  if (status === 'rejected') return 'rejected';
  return null;
}

function accessStatus(status: string | null | undefined): ItemStatus | null {
  if (status === 'pending') return 'pending';
  if (status === 'approved') return 'approved';
  if (status === 'rejected') return 'rejected';
  return null;
}

function statusDotClass(status: ItemStatus): string {
  if (status === 'approved') return 'bg-emerald-500';
  if (status === 'rejected') return 'bg-red-500';
  return 'bg-amber-500';
}

function formatCompactDate(iso: string): string {
  const d = parseISO(iso);
  return d.getFullYear() === new Date().getFullYear()
    ? format(d, 'd MMM')
    : format(d, 'd MMM yyyy');
}

function formatDateRange(start?: string | null, end?: string | null): string {
  if (!start || !end) return '—';
  const s = parseISO(start);
  const e = parseISO(end);
  if (format(s, 'yyyy-MM-dd') === format(e, 'yyyy-MM-dd')) {
    return format(s, s.getFullYear() === new Date().getFullYear() ? 'd MMM' : 'd MMM yyyy');
  }
  if (s.getFullYear() === e.getFullYear()) {
    if (s.getMonth() === e.getMonth()) {
      return `${format(s, 'd')}–${format(e, e.getFullYear() === new Date().getFullYear() ? 'd MMM' : 'd MMM yyyy')}`;
    }
    return `${format(s, 'd MMM')} – ${format(e, e.getFullYear() === new Date().getFullYear() ? 'd MMM' : 'd MMM yyyy')}`;
  }
  return `${format(s, 'd MMM yyyy')} – ${format(e, 'd MMM yyyy')}`;
}

export function VesselSentRequestsPanel({
  embedded = false,
  onPendingCountChange,
}: {
  embedded?: boolean;
  onPendingCountChange?: (count: number) => void;
}) {
  const router = useRouter();
  const { user } = useUser();
  const { supabase } = useSupabase();
  const { data: userProfile } = useDoc<UserProfile>('users', user?.id);
  const [isLoading, setIsLoading] = useState(true);
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [items, setItems] = useState<VesselSentRequestItem[]>([]);

  const activeVesselId =
    (userProfile as { active_vessel_id?: string; activeVesselId?: string } | null)
      ?.active_vessel_id ||
    userProfile?.activeVesselId ||
    null;

  const load = useCallback(async () => {
    if (!user?.id) {
      setItems([]);
      setIsLoading(false);
      onPendingCountChange?.(0);
      return;
    }

    setIsLoading(true);
    try {
      let testimonialQuery = supabase
        .from('testimonials')
        .select(
          'id, user_id, vessel_id, start_date, end_date, status, captain_user_id, captain_email, captain_name, official_body, generated_by_user_id, created_at, total_days, at_sea_days',
        )
        .in('status', ['pending_captain', 'pending_official', 'approved', 'rejected'])
        .order('created_at', { ascending: false });

      if (activeVesselId) {
        testimonialQuery = testimonialQuery.or(
          `vessel_id.eq.${activeVesselId},generated_by_user_id.eq.${user.id}`,
        );
      } else {
        testimonialQuery = testimonialQuery.eq('generated_by_user_id', user.id);
      }

      const [testimonialsRes, accessRes] = await Promise.all([
        testimonialQuery,
        supabase
          .from('vessel_sea_time_access_requests')
          .select('*')
          .eq('vessel_user_id', user.id)
          .in('status', ['pending', 'approved', 'rejected'])
          .order('created_at', { ascending: false }),
      ]);

      const testimonials = testimonialsRes.data || [];
      const accessRows = accessRes.data || [];

      const userIds = new Set<string>();
      for (const t of testimonials) {
        if (t.user_id) userIds.add(t.user_id);
        if (t.captain_user_id) userIds.add(t.captain_user_id);
      }
      for (const a of accessRows) {
        if (a.crew_user_id) userIds.add(a.crew_user_id);
      }

      const people = new Map<string, UserLite>();
      if (userIds.size > 0) {
        const { data: users } = await supabase
          .from('users')
          .select('id, email, username, first_name, last_name')
          .in('id', [...userIds]);
        for (const u of users || []) {
          people.set(u.id, u as UserLite);
        }
      }

      const next: VesselSentRequestItem[] = [];

      for (const t of testimonials) {
        const status = testimonialStatus(t.status);
        if (!status) continue;
        const crew = people.get(t.user_id);
        const captain = t.captain_user_id ? people.get(t.captain_user_id) : null;
        const captainName = personName(
          captain,
          t.captain_name || t.captain_email || t.official_body || '—',
        );
        const atSea = t.at_sea_days != null ? Number(t.at_sea_days) : null;
        const total = t.total_days != null ? Number(t.total_days) : null;
        let days = '—';
        if (atSea != null && Number.isFinite(atSea)) {
          days = `${atSea} at sea`;
        } else if (total != null && Number.isFinite(total)) {
          days = `${total}d`;
        }
        let statusText = 'Pending';
        if (status === 'approved') statusText = 'Approved';
        else if (status === 'rejected') statusText = 'Rejected';
        else if (t.status === 'pending_official') statusText = 'Official';
        else statusText = 'Captain';
        next.push({
          id: `t-${t.id}`,
          kind: 'testimonial',
          status,
          statusText,
          createdAt: t.created_at,
          crewUserId: t.user_id,
          crewName: personName(crew, 'Crew member'),
          period: formatDateRange(t.start_date, t.end_date),
          days,
          captainName,
          href: `/dashboard/crew?member=${t.user_id}`,
        });
      }

      for (const a of accessRows) {
        const status = accessStatus(a.status);
        if (!status) continue;
        const crew = people.get(a.crew_user_id);
        const rejection =
          status === 'rejected' && typeof a.rejection_reason === 'string'
            ? a.rejection_reason.trim()
            : '';
        next.push({
          id: `a-${a.id}`,
          kind: 'access',
          status,
          statusText:
            status === 'approved' ? 'Approved' : status === 'rejected' ? 'Rejected' : 'Pending',
          createdAt: a.created_at,
          crewUserId: a.crew_user_id,
          crewName: personName(crew, 'Crew member'),
          period: rejection || '—',
          days: '—',
          captainName: '—',
          href: `/dashboard/crew?member=${a.crew_user_id}`,
        });
      }

      next.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setItems(next);
      onPendingCountChange?.(next.filter((i) => i.status === 'pending').length);
    } catch (err) {
      console.error('[vessel-sent-requests]', err);
      setItems([]);
      onPendingCountChange?.(0);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, activeVesselId, supabase, onPendingCountChange]);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => {
    const pending = items.filter((i) => i.status === 'pending').length;
    const past = items.filter((i) => i.status !== 'pending').length;
    return { pending, past, total: items.length };
  }, [items]);

  const visible = useMemo(() => {
    return items.filter((item) => {
      if (kindFilter !== 'all' && item.kind !== kindFilter) return false;
      if (statusFilter === 'pending' && item.status !== 'pending') return false;
      if (statusFilter === 'past' && item.status === 'pending') return false;
      return true;
    });
  }, [items, kindFilter, statusFilter]);

  return (
    <div className="flex flex-col gap-0">
      {!embedded && (
        <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-end sm:justify-between sm:px-5">
          <div>
            <h2 className="text-sm font-medium">Sent requests</h2>
            <p className="text-xs text-muted-foreground">
              Testimonials sent to captains and sea-time access sent to crew.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="h-8 rounded-md border-border text-xs" asChild>
              <Link href="/dashboard/crew">
                <Users className="mr-1.5 h-3.5 w-3.5" />
                Crew
              </Link>
            </Button>
            <Button variant="outline" size="sm" className="h-8 rounded-md border-border text-xs" asChild>
              <Link href="/dashboard/documents">
                <FileSignature className="mr-1.5 h-3.5 w-3.5" />
                Documents
              </Link>
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex flex-wrap items-center gap-1 rounded-md border border-border bg-muted/40 p-0.5">
          {(
            [
              ['pending', 'Pending', counts.pending],
              ['past', 'Past', counts.past],
              ['all', 'All', counts.total],
            ] as const
          ).map(([id, label, count]) => (
            <button
              key={id}
              type="button"
              onClick={() => setStatusFilter(id)}
              className={cn(
                'inline-flex h-7 items-center gap-1.5 rounded-[5px] px-2.5 text-xs transition-colors',
                statusFilter === id
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
              <span
                className={cn(
                  'rounded px-1 font-mono text-[10px] tabular-nums',
                  statusFilter === id
                    ? 'bg-muted text-muted-foreground'
                    : 'text-muted-foreground/70',
                )}
              >
                {count}
              </span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {embedded ? (
            <>
              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-md border-border text-xs"
                asChild
              >
                <Link href="/dashboard/crew">
                  <Users className="mr-1.5 h-3.5 w-3.5" />
                  Crew
                </Link>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-md border-border text-xs"
                asChild
              >
                <Link href="/dashboard/documents">
                  <FileSignature className="mr-1.5 h-3.5 w-3.5" />
                  Documents
                </Link>
              </Button>
            </>
          ) : null}
          <Select
            value={kindFilter}
            onValueChange={(value) => setKindFilter(value as KindFilter)}
          >
            <SelectTrigger className="h-8 w-[9.5rem] rounded-md border-border text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">
                All types
              </SelectItem>
              <SelectItem value="testimonial" className="text-xs">
                Testimonials
              </SelectItem>
              <SelectItem value="access" className="text-xs">
                Sea-time access
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex min-h-[180px] items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      ) : visible.length === 0 ? (
        <div className="px-4 py-12 text-center">
          <p className="text-sm text-foreground">
            {statusFilter === 'pending' ? 'Nothing pending' : 'No requests'}
          </p>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
            {statusFilter === 'pending'
              ? 'Sent testimonials and sea-time access requests will appear here until they are answered.'
              : statusFilter === 'past'
                ? 'Approved and rejected requests will appear here.'
                : 'Send a testimonial or sea-time access request and it will appear here.'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="h-9 bg-muted/40 px-3 text-[11px] font-normal text-muted-foreground">
                Crew
              </TableHead>
              <TableHead className="h-9 bg-muted/40 px-3 text-[11px] font-normal text-muted-foreground">
                Type
              </TableHead>
              <TableHead className="h-9 bg-muted/40 px-3 text-[11px] font-normal text-muted-foreground">
                Period
              </TableHead>
              <TableHead className="h-9 bg-muted/40 px-3 text-[11px] font-normal text-muted-foreground">
                Days
              </TableHead>
              <TableHead className="h-9 bg-muted/40 px-3 text-[11px] font-normal text-muted-foreground">
                Captain
              </TableHead>
              <TableHead className="h-9 bg-muted/40 px-3 text-[11px] font-normal text-muted-foreground">
                Status
              </TableHead>
              <TableHead className="h-9 bg-muted/40 px-3 text-right text-[11px] font-normal text-muted-foreground">
                Sent
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((item) => (
              <TableRow
                key={item.id}
                className="cursor-pointer border-border bg-background hover:bg-muted/40"
                onClick={() => router.push(item.href)}
              >
                <TableCell className="whitespace-nowrap px-3 py-2 text-sm">
                  {item.crewName}
                </TableCell>
                <TableCell className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                  {item.kind === 'testimonial' ? 'Testimonial' : 'Access'}
                </TableCell>
                <TableCell className="max-w-[180px] truncate px-3 py-2 text-xs tabular-nums">
                  {item.period}
                </TableCell>
                <TableCell className="whitespace-nowrap px-3 py-2 text-xs tabular-nums text-muted-foreground">
                  {item.days}
                </TableCell>
                <TableCell className="whitespace-nowrap px-3 py-2 text-xs">
                  {item.captainName}
                </TableCell>
                <TableCell className="whitespace-nowrap px-3 py-2">
                  <span className="inline-flex items-center gap-1.5 text-xs">
                    <span
                      className={cn('h-1.5 w-1.5 rounded-full', statusDotClass(item.status))}
                    />
                    {item.statusText}
                  </span>
                </TableCell>
                <TableCell className="whitespace-nowrap px-3 py-2 text-right text-xs tabular-nums text-muted-foreground">
                  {formatCompactDate(item.createdAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
      )}
    </div>
  );
}
