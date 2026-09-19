'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  TrainingRecordsEmpty,
  TrainingRecordsPageHeader,
  TrainingRecordsSection,
  TrainingStatusPill,
} from '@/components/dashboard/training-records-page-ui';
import { bearerHeaders } from '@/lib/applications/client';
import { useToast } from '@/hooks/use-toast';
import { useSupabase } from '@/supabase';

type BatchDetail = {
  ok: true;
  kind: 'batch';
  batch: {
    id: string;
    status: string;
    expiresAt: string;
    usedAt: string | null;
    createdAt: string;
    optionalMessage: string | null;
    overallFeedback: string | null;
    signerEmail: string;
    signerName: string | null;
    vesselName: string | null;
  };
  candidate: { name: string };
  programme: { name: string; version: string | null };
  counts: {
    total: number;
    pending: number;
    approved: number;
    changesRequested: number;
    rejected: number;
    cancelled: number;
  };
  items: Array<{
    id: string;
    status: string;
    decisionNotes: string | null;
    decidedAt: string | null;
    taskProgressId: string;
    task: {
      taskCode: string;
      title: string;
      officialTitle?: string | null;
    } | null;
    section: { title: string } | null;
    progress: { candidateNotes: string | null; status: string } | null;
  }>;
};

export default function BatchRequestDetailPage() {
  const params = useParams<{ enrollmentId: string; batchRequestId: string }>();
  const { session } = useSupabase();
  const { toast } = useToast();
  const [detail, setDetail] = useState<BatchDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(async () => {
    if (!session?.access_token || !params.batchRequestId) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/trb/signoff/batch/${params.batchRequestId}`,
        { headers: bearerHeaders(session.access_token) },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Not found');
      setDetail(json);
    } catch (e) {
      toast({
        title: 'Could not load request',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [session?.access_token, params.batchRequestId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function cancelRequest() {
    if (!session?.access_token || !detail) return;
    if (!window.confirm('Cancel this pending sign-off request?')) return;
    setCancelling(true);
    try {
      const res = await fetch('/api/trb/signoff/batch', {
        method: 'DELETE',
        headers: {
          ...bearerHeaders(session.access_token),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ batchRequestId: detail.batch.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Cancel failed');
      toast({ title: 'Request cancelled' });
      await load();
    } catch (e) {
      toast({
        title: 'Could not cancel',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setCancelling(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-16 w-full rounded-md" />
        <Skeleton className="h-48 w-full rounded-md" />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex flex-col gap-6">
        <TrainingRecordsPageHeader
          title="Request not found"
          description="This grouped sign-off request could not be loaded."
          actions={
            <Button asChild variant="outline" size="sm" className="h-8 rounded-md text-xs">
              <Link href={`/dashboard/training-records/${params.enrollmentId}`}>
                <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                Back
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <TrainingRecordsPageHeader
        title="Grouped sign-off request"
        breadcrumb={detail.programme.name}
        description={`${detail.counts.total} tasks · ${detail.batch.signerName || detail.batch.signerEmail}`}
        actions={
          <>
            <Button asChild variant="outline" size="sm" className="h-8 rounded-md text-xs">
              <Link href={`/dashboard/training-records/${params.enrollmentId}`}>
                <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                Programme
              </Link>
            </Button>
            {detail.batch.status === 'pending' ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 rounded-md text-xs"
                disabled={cancelling}
                onClick={() => void cancelRequest()}
              >
                {cancelling ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : null}
                Cancel request
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid gap-3 rounded-md border border-border bg-background p-4 text-sm sm:grid-cols-2">
        <div>
          <p className="text-[11px] text-muted-foreground">Status</p>
          <TrainingStatusPill status={detail.batch.status} />
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground">Requested</p>
          <p className="font-mono text-xs">
            {new Date(detail.batch.createdAt).toLocaleString('en-GB')}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground">Reviewer</p>
          <p>{detail.batch.signerName || detail.batch.signerEmail}</p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground">Vessel</p>
          <p>{detail.batch.vesselName || '—'}</p>
        </div>
        {detail.batch.optionalMessage ? (
          <div className="sm:col-span-2">
            <p className="text-[11px] text-muted-foreground">Your message</p>
            <p className="whitespace-pre-wrap">{detail.batch.optionalMessage}</p>
          </div>
        ) : null}
        {detail.batch.overallFeedback ? (
          <div className="sm:col-span-2">
            <p className="text-[11px] text-muted-foreground">Overall feedback</p>
            <p className="whitespace-pre-wrap">{detail.batch.overallFeedback}</p>
          </div>
        ) : null}
        <div className="sm:col-span-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span>{detail.counts.approved} approved</span>
          <span>{detail.counts.changesRequested} changes requested</span>
          <span>{detail.counts.rejected} rejected</span>
          <span>{detail.counts.pending} pending</span>
        </div>
      </div>

      <TrainingRecordsSection title="Tasks in this request" flush>
        {detail.items.length === 0 ? (
          <TrainingRecordsEmpty title="No items" description="No tasks on this request." />
        ) : (
          <ul className="divide-y divide-border">
            {detail.items.map((item) => (
              <li key={item.id} className="space-y-2 px-4 py-3 sm:px-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">
                      <span className="mr-1.5 font-mono text-[11px] text-muted-foreground">
                        {item.task?.taskCode}
                      </span>
                      {item.task?.officialTitle || item.task?.title}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {item.section?.title}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <TrainingStatusPill status={item.status} />
                    <Button asChild variant="outline" size="sm" className="h-7 text-xs">
                      <Link
                        href={`/dashboard/training-records/${params.enrollmentId}/tasks/${item.taskProgressId}`}
                      >
                        Open task
                      </Link>
                    </Button>
                  </div>
                </div>
                {item.decisionNotes ? (
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                    Feedback: {item.decisionNotes}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </TrainingRecordsSection>
    </div>
  );
}
