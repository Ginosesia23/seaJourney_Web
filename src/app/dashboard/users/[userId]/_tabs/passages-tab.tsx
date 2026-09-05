'use client';

import { useEffect, useMemo, useState } from 'react';
import { differenceInHours, format, parseISO } from 'date-fns';
import { ArrowRight, Loader2 } from 'lucide-react';

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
import { useSupabase } from '@/supabase';
import { getPassageLogs } from '@/supabase/database/queries';
import type { PassageLog } from '@/lib/types';

type Props = { userId: string };

type EnrichedPassage = PassageLog & { vesselName?: string | null };

export function PassagesTab({ userId }: Props) {
  const { supabase } = useSupabase();
  const [rows, setRows] = useState<EnrichedPassage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      setError(null);
      try {
        const passages = await getPassageLogs(supabase, userId);
        const vesselIds = Array.from(
          new Set(
            passages
              .map((p) => p.vessel_id)
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
          passages.map((p) => ({
            ...p,
            vesselName: nameById.get(p.vessel_id) ?? null,
          })),
        );
      } catch (err) {
        console.error('[admin/users/passages] load:', err);
        if (!cancelled)
          setError(err instanceof Error ? err.message : 'Failed to load passages');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, userId]);

  const stats = useMemo(() => {
    let totalNm = 0;
    let totalHours = 0;
    for (const r of rows) {
      if (typeof r.distance_nm === 'number') totalNm += r.distance_nm;
      if (r.start_time && r.end_time) {
        const start = safeParse(r.start_time);
        const end = safeParse(r.end_time);
        if (start && end) totalHours += Math.max(0, differenceInHours(end, start));
      }
    }
    return { count: rows.length, totalNm, totalHours };
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
        <CardTitle className="text-xs font-medium">Passages</CardTitle>
        <CardDescription className="text-[11px]">
          <span className="font-mono tabular-nums">{stats.count}</span> passage
          {stats.count === 1 ? '' : 's'} ·{' '}
          <span className="font-mono tabular-nums">
            {stats.totalNm.toFixed(1)}
          </span>{' '}
          NM ·{' '}
          <span className="font-mono tabular-nums">{stats.totalHours}</span> h
          underway
        </CardDescription>
      </CardHeader>
      <CardContent className="px-4 py-3">
        {error ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 py-6 text-center text-xs text-destructive">
            {error}
          </p>
        ) : rows.length === 0 ? (
          <p className="py-10 text-center text-xs text-muted-foreground">
            No passages logged.
          </p>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vessel</TableHead>
                  <TableHead>Departure</TableHead>
                  <TableHead>Arrival</TableHead>
                  <TableHead>Route</TableHead>
                  <TableHead>Distance</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Type</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => {
                  const start = safeParse(p.start_time);
                  const end = safeParse(p.end_time);
                  const hours =
                    start && end ? Math.max(0, differenceInHours(end, start)) : null;
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">
                        {p.vesselName || p.vessel_id?.slice(0, 8) || '—'}
                      </TableCell>
                      <TableCell>
                        {start ? (
                          <div className="flex flex-col">
                            <span>{format(start, 'd MMM yyyy')}</span>
                            <span className="text-xs text-muted-foreground">
                              {format(start, 'HH:mm')}
                            </span>
                          </div>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell>
                        {end ? (
                          <div className="flex flex-col">
                            <span>{format(end, 'd MMM yyyy')}</span>
                            <span className="text-xs text-muted-foreground">
                              {format(end, 'HH:mm')}
                            </span>
                          </div>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1 text-xs">
                          <span>{p.departure_port || '—'}</span>
                          <ArrowRight className="h-3 w-3 text-muted-foreground" />
                          <span>{p.arrival_port || '—'}</span>
                        </span>
                      </TableCell>
                      <TableCell>
                        {typeof p.distance_nm === 'number'
                          ? `${p.distance_nm.toFixed(1)} NM`
                          : '—'}
                      </TableCell>
                      <TableCell>{hours != null ? `${hours} h` : '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {p.passage_type || '—'}
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
