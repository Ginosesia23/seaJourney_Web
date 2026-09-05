'use client';

import { useEffect, useMemo, useState } from 'react';
import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { Loader2, Ship } from 'lucide-react';

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
import { getVesselAssignments } from '@/supabase/database/queries';
import type { VesselAssignment } from '@/lib/types';

type Props = { userId: string };

type EnrichedAssignment = VesselAssignment & {
  vesselName?: string | null;
  vesselType?: string | null;
};

export function AssignmentsTab({ userId }: Props) {
  const { supabase } = useSupabase();
  const [rows, setRows] = useState<EnrichedAssignment[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      try {
        const assignments = await getVesselAssignments(supabase, userId);
        const vesselIds = Array.from(
          new Set(
            assignments
              .map((a) => a.vesselId)
              .filter((id): id is string => typeof id === 'string'),
          ),
        );
        const nameById = new Map<string, { name: string; type: string | null }>();
        if (vesselIds.length > 0) {
          const { data: vessels } = await supabase
            .from('vessels')
            .select('id, name, type')
            .in('id', vesselIds);
          for (const v of vessels ?? []) {
            if (v.id) {
              nameById.set(v.id as string, {
                name: (v.name as string) || '—',
                type: (v.type as string) || null,
              });
            }
          }
        }
        const enriched: EnrichedAssignment[] = assignments.map((a) => {
          const lookup = nameById.get(a.vesselId);
          return {
            ...a,
            vesselName: lookup?.name ?? null,
            vesselType: lookup?.type ?? null,
          };
        });
        if (!cancelled) setRows(enriched);
      } catch (err) {
        console.error('[admin/users/assignments] load:', err);
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
    const total = rows.length;
    const active = rows.filter((r) => !r.endDate).length;
    let totalDays = 0;
    for (const r of rows) {
      const start = safeParse(r.startDate);
      const end = r.endDate ? safeParse(r.endDate) : new Date();
      if (start && end) totalDays += Math.max(0, differenceInCalendarDays(end, start) + 1);
    }
    return { total, active, totalDays };
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
        <CardTitle className="text-xs font-medium">Vessel assignments</CardTitle>
        <CardDescription className="text-[11px]">
          <span className="font-mono tabular-nums">{stats.total}</span> assignment
          {stats.total === 1 ? '' : 's'} ·{' '}
          <span className="font-mono tabular-nums">{stats.active}</span> active ·{' '}
          <span className="font-mono tabular-nums">{stats.totalDays}</span> total
          days
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-xs text-muted-foreground">
            No vessel assignments on file.
          </p>
        ) : (
          <div className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="h-9 bg-muted/40 text-[11px] font-normal text-muted-foreground">
                    Vessel
                  </TableHead>
                  <TableHead className="h-9 bg-muted/40 text-[11px] font-normal text-muted-foreground">
                    Position
                  </TableHead>
                  <TableHead className="h-9 bg-muted/40 text-[11px] font-normal text-muted-foreground">
                    Role
                  </TableHead>
                  <TableHead className="h-9 bg-muted/40 text-[11px] font-normal text-muted-foreground">
                    From
                  </TableHead>
                  <TableHead className="h-9 bg-muted/40 text-[11px] font-normal text-muted-foreground">
                    To
                  </TableHead>
                  <TableHead className="h-9 bg-muted/40 text-[11px] font-normal text-muted-foreground">
                    Duration
                  </TableHead>
                  <TableHead className="h-9 bg-muted/40 text-[11px] font-normal text-muted-foreground">
                    Status
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const start = safeParse(r.startDate);
                  const end = r.endDate ? safeParse(r.endDate) : null;
                  const days = start
                    ? Math.max(
                        0,
                        differenceInCalendarDays(end ?? new Date(), start) + 1,
                      )
                    : null;
                  return (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Ship className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="font-medium">
                            {r.vesselName || r.vesselId.slice(0, 8)}
                          </span>
                        </div>
                        {r.vesselType && (
                          <span className="text-xs text-muted-foreground">
                            {r.vesselType}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {r.position ? (
                          <span className="capitalize">{r.position}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {r.assignmentRole || 'crew'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {start ? format(start, 'd MMM yyyy') : '—'}
                      </TableCell>
                      <TableCell>
                        {end ? format(end, 'd MMM yyyy') : (
                          <Badge variant="secondary">Active</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {days != null ? `${days} d` : '—'}
                      </TableCell>
                      <TableCell>
                        {r.endDate ? (
                          <Badge variant="outline">Past</Badge>
                        ) : (
                          <Badge className="bg-green-600 hover:bg-green-600/90">
                            Current
                          </Badge>
                        )}
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
