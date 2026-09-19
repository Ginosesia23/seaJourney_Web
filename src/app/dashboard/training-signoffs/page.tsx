'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  TrainingRecordsEmpty,
  TrainingRecordsPageHeader,
  TrainingRecordsSection,
  TrainingStatusPill,
} from '@/components/dashboard/training-records-page-ui';
import { bearerHeaders } from '@/lib/applications/client';
import { useSupabase } from '@/supabase';

type Row = {
  id: string;
  status: string;
  signer_email: string;
  signer_name: string | null;
  expires_at: string;
  created_at: string;
  used_at: string | null;
  vessel_name_snapshot?: string | null;
  taskTitle?: string | null;
  taskCode?: string | null;
  programmeName?: string | null;
  programmeCode?: string | null;
  resourceType?: string;
};

export default function TrainingSignoffsPage() {
  const { session } = useSupabase();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [programmeFilter, setProgrammeFilter] = useState<string>('all');

  const load = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    try {
      const qs =
        statusFilter !== 'all'
          ? `?status=${encodeURIComponent(statusFilter)}`
          : '';
      const res = await fetch(`/api/trb/signoff/queue${qs}`, {
        headers: bearerHeaders(session.access_token),
      });
      const json = await res.json();
      if (res.ok) setRows(json.requests || []);
    } finally {
      setLoading(false);
    }
  }, [session?.access_token, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const programmes = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      if (r.programmeName) set.add(r.programmeName);
    }
    return [...set].sort();
  }, [rows]);

  const filtered = rows.filter((r) => {
    if (programmeFilter !== 'all' && r.programmeName !== programmeFilter) {
      return false;
    }
    return true;
  });

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="space-y-2 border-b border-border pb-5">
          <Skeleton className="h-3 w-40 rounded-md" />
          <Skeleton className="h-7 w-56 rounded-md" />
        </div>
        <Skeleton className="h-48 w-full rounded-md" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <TrainingRecordsPageHeader
        title="Training sign-offs"
        description="Digital TRB Companion requests associated with your email. Use the secure email link to review evidence and decide. Testimonials remain on the existing testimonial approval flow."
      />

      <div className="flex flex-wrap gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 w-[180px] rounded-md text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="changes_requested">Changes requested</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
          </SelectContent>
        </Select>
        <Select value={programmeFilter} onValueChange={setProgrammeFilter}>
          <SelectTrigger className="h-8 w-[220px] rounded-md text-xs">
            <SelectValue placeholder="Programme" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All programmes</SelectItem>
            {programmes.map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <TrainingRecordsSection
        title="Your queue"
        description="Training-task requests only — filter by status and programme"
        flush
      >
        {filtered.length === 0 ? (
          <TrainingRecordsEmpty
            title="No requests found"
            description="When a crew member requests your review, it will appear here. Decisions are still made via the secure email link."
          />
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5"
              >
                <div className="min-w-0 space-y-0.5">
                  <p className="text-sm font-medium text-foreground">
                    {r.taskCode ? `${r.taskCode} · ` : ''}
                    {r.taskTitle || r.signer_name || r.signer_email}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {r.programmeName || 'Training programme'}
                    {r.vessel_name_snapshot ? ` · ${r.vessel_name_snapshot}` : ''}
                  </p>
                  <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
                    Requested {new Date(r.created_at).toLocaleString('en-GB')}
                    {r.status === 'pending'
                      ? ` · expires ${new Date(r.expires_at).toLocaleString('en-GB')}`
                      : ''}
                  </p>
                </div>
                <TrainingStatusPill status={r.status} />
              </li>
            ))}
          </ul>
        )}
      </TrainingRecordsSection>
    </div>
  );
}
