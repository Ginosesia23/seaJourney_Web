'use client';

import { useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ExternalLink, Loader2 } from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useSupabase } from '@/supabase';
import type { Testimonial, TestimonialStatus } from '@/lib/types';

type Props = { userId: string };

type EnrichedRow = Testimonial & { vesselName: string | null };

const STATUS_VARIANT: Record<TestimonialStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  approved: 'default',
  pending_captain: 'secondary',
  pending_official: 'secondary',
  rejected: 'destructive',
  draft: 'outline',
};

const STATUS_LABEL: Record<TestimonialStatus, string> = {
  approved: 'Approved',
  pending_captain: 'Pending captain',
  pending_official: 'Pending official',
  rejected: 'Rejected',
  draft: 'Draft',
};

export function TestimonialsTab({ userId }: Props) {
  const { supabase } = useSupabase();
  const [rows, setRows] = useState<EnrichedRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      try {
        const { data: testimonials } = await supabase
          .from('testimonials')
          .select('*')
          .eq('user_id', userId)
          .order('end_date', { ascending: false });

        const list = (testimonials ?? []) as Testimonial[];
        const vesselIds = Array.from(
          new Set(
            list
              .map((t) => t.vessel_id)
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
          list.map((t) => ({
            ...t,
            vesselName: nameById.get(t.vessel_id) ?? null,
          })),
        );
      } catch (err) {
        console.error('[admin/users/testimonials] load:', err);
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
    const counts: Record<TestimonialStatus, number> = {
      draft: 0,
      pending_captain: 0,
      pending_official: 0,
      approved: 0,
      rejected: 0,
    };
    for (const r of rows) {
      if (counts[r.status as TestimonialStatus] != null)
        counts[r.status as TestimonialStatus] += 1;
    }
    return { total: rows.length, counts };
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
        <CardTitle className="text-xs font-medium">Testimonials</CardTitle>
        <CardDescription className="text-[11px]">
          <span className="font-mono tabular-nums">{stats.total}</span> total ·{' '}
          <span className="font-mono tabular-nums">{stats.counts.approved}</span>{' '}
          approved ·{' '}
          <span className="font-mono tabular-nums">
            {stats.counts.pending_captain + stats.counts.pending_official}
          </span>{' '}
          pending ·{' '}
          <span className="font-mono tabular-nums">{stats.counts.rejected}</span>{' '}
          rejected
        </CardDescription>
      </CardHeader>
      <CardContent className="px-4 py-3">
        {rows.length === 0 ? (
          <p className="py-10 text-center text-xs text-muted-foreground">
            No testimonials yet.
          </p>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vessel</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Days</TableHead>
                  <TableHead>Captain</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead className="w-12 text-right" aria-label="Open" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">
                      {t.vesselName || t.vessel_id?.slice(0, 8) || '—'}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col text-xs">
                        <span>
                          {safeFmt(t.start_date)} – {safeFmt(t.end_date)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col text-xs">
                        <span className="font-medium">{t.total_days} d</span>
                        <span className="text-muted-foreground">
                          {t.at_sea_days} sea · {t.standby_days} stby · {t.yard_days} yard · {t.leave_days} leave
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col text-xs">
                        <span>{t.captain_name || '—'}</span>
                        {t.captain_email && (
                          <span className="text-muted-foreground">{t.captain_email}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={STATUS_VARIANT[t.status as TestimonialStatus] ?? 'outline'}
                      >
                        {STATUS_LABEL[t.status as TestimonialStatus] ?? t.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <code className="text-[11px] text-muted-foreground">
                        {t.testimonial_code || '—'}
                      </code>
                    </TableCell>
                    <TableCell className="text-right">
                      {t.pdf_url ? (
                        <Button asChild variant="ghost" size="icon" className="h-8 w-8">
                          <a href={t.pdf_url} target="_blank" rel="noreferrer" aria-label="Open PDF">
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function safeFmt(iso: string): string {
  try {
    return format(parseISO(iso), 'd MMM yyyy');
  } catch {
    return iso;
  }
}
