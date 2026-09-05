'use client';

import { useEffect, useMemo, useState } from 'react';
import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { Loader2 } from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useSupabase } from '@/supabase';
import type { SeaTimeRequest } from '@/lib/types';

type Props = { userId: string };

type EnrichedRow = SeaTimeRequest & { vesselName: string | null };

const STATUS_VARIANT: Record<SeaTimeRequest['status'], 'default' | 'secondary' | 'destructive'> = {
  approved: 'default',
  pending: 'secondary',
  rejected: 'destructive',
};

export function SeaTimeTab({ userId }: Props) {
  const { supabase } = useSupabase();
  const [rows, setRows] = useState<EnrichedRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      try {
        const { data } = await supabase
          .from('sea_time_requests')
          .select('*')
          .eq('crew_user_id', userId)
          .order('created_at', { ascending: false });

        const list: SeaTimeRequest[] = (data ?? []).map((r: any) => ({
          id: r.id,
          crewUserId: r.crew_user_id,
          vesselId: r.vessel_id,
          startDate: r.start_date,
          endDate: r.end_date,
          status: r.status,
          notes: r.notes,
          rejectionReason: r.rejection_reason,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        }));

        const vesselIds = Array.from(
          new Set(
            list
              .map((r) => r.vesselId)
              .filter((id): id is string => typeof id === 'string'),
          ),
        );
        const nameById = new Map<string, string>();
        if (vesselIds.length > 0) {
          const { data: vessels } = await supabase
            .from('vessels')
            .select('id, name')
            .in('id', vesselIds);
          for (const v of vessels ?? []) {
            if (v.id && v.name) nameById.set(v.id as string, v.name as string);
          }
        }
        if (cancelled) return;
        setRows(
          list.map((r) => ({ ...r, vesselName: nameById.get(r.vesselId) ?? null })),
        );
      } catch (err) {
        console.error('[admin/users/sea-time] load:', err);
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, userId]);

  const stats = useMemo(() => {
    const counts = { pending: 0, approved: 0, rejected: 0 } as Record<
      SeaTimeRequest['status'],
      number
    >;
    for (const r of rows) counts[r.status] = (counts[r.status] ?? 0) + 1;
    return { total: rows.length, ...counts };
  }, [rows]);

  if (isLoading) {
    return (
      <Card className="rounded-md border-border shadow-none">
        <CardContent className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-md border-border shadow-none">
      <CardHeader className="border-b border-border bg-muted/40 px-4 py-2.5">
        <CardTitle className="text-xs font-medium">Sea time requests</CardTitle>
        <CardDescription className="text-[11px]">
          <span className="font-mono tabular-nums">{stats.total}</span> total ·{' '}
          <span className="font-mono tabular-nums">{stats.approved}</span>{' '}
          approved ·{' '}
          <span className="font-mono tabular-nums">{stats.pending}</span> pending
          · <span className="font-mono tabular-nums">{stats.rejected}</span>{' '}
          rejected
        </CardDescription>
      </CardHeader>
      <CardContent className="px-4 py-3">
        {rows.length === 0 ? (
          <p className="py-10 text-center text-xs text-muted-foreground">
            No sea time requests on file.
          </p>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vessel</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Days</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const start = safeParse(r.startDate);
                  const end = safeParse(r.endDate);
                  const days =
                    start && end
                      ? Math.max(0, differenceInCalendarDays(end, start) + 1)
                      : null;
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">
                        {r.vesselName || r.vesselId.slice(0, 8)}
                      </TableCell>
                      <TableCell>
                        {start && end
                          ? `${format(start, 'd MMM yyyy')} – ${format(end, 'd MMM yyyy')}`
                          : '—'}
                      </TableCell>
                      <TableCell>{days != null ? `${days} d` : '—'}</TableCell>
                      <TableCell>
                        {r.createdAt
                          ? format(parseISO(r.createdAt), 'd MMM yyyy')
                          : '—'}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={STATUS_VARIANT[r.status]}
                          className="capitalize"
                        >
                          {r.status}
                        </Badge>
                        {r.status === 'rejected' && r.rejectionReason && (
                          <div className="mt-1 max-w-xs text-[11px] text-destructive">
                            {r.rejectionReason}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-xs text-muted-foreground">
                        {r.notes || '—'}
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
  );
}

function safeParse(d: string | null | undefined): Date | null {
  if (!d) return null;
  try {
    return parseISO(d);
  } catch {
    return null;
  }
}
