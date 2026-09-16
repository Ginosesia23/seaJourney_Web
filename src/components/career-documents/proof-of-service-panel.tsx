'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, useSupabase } from '@/supabase';
import { useDoc } from '@/supabase/database';
import { isVesselLinkedAccount } from '@/supabase/database/subscription-helpers';
import { isVesselLinkedFeatureGranted } from '@/lib/vessel-linked-features';
import type { UserProfile } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { ShieldCheck, Download, Ship, Loader2 } from 'lucide-react';
import { format, parse } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import type { ProofOfService } from '@/lib/types';
import { generateProofOfServicePDF } from '@/lib/pdf-generator';

function mapRow(row: any): ProofOfService {
  return {
    id: row.id,
    crewUserId: row.crew_user_id,
    vesselId: row.vessel_id,
    vesselUserId: row.vessel_user_id,
    startDate: row.start_date,
    endDate: row.end_date,
    totalDays: row.total_days,
    atSeaDays: row.at_sea_days,
    standbyDays: row.standby_days,
    yardDays: row.yard_days,
    leaveDays: row.leave_days,
    vesselName: row.vessel_name,
    vesselType: row.vessel_type ?? null,
    vesselImo: row.vessel_imo ?? null,
    crewName: row.crew_name,
    crewPosition: row.crew_position ?? null,
    generatedByName: row.generated_by_name,
    generatedByEmail: row.generated_by_email ?? null,
    dataSource: row.data_source,
    notes: row.notes ?? null,
    verificationCode: row.verification_code ?? '',
    pdfPath: row.pdf_path ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function entryToPdfData(entry: ProofOfService) {
  return {
    vesselName: entry.vesselName,
    vesselType: entry.vesselType,
    vesselImo: entry.vesselImo,
    crewName: entry.crewName,
    crewPosition: entry.crewPosition,
    startDate: entry.startDate,
    endDate: entry.endDate,
    totalDays: entry.totalDays,
    atSeaDays: entry.atSeaDays,
    standbyDays: entry.standbyDays,
    yardDays: entry.yardDays,
    leaveDays: entry.leaveDays,
    generatedByName: entry.generatedByName,
    generatedByEmail: entry.generatedByEmail,
    notes: entry.notes,
    verificationCode: entry.verificationCode,
  };
}

export function ProofOfServicePanel({ embedded = false }: { embedded?: boolean } = {}) {
  const { user } = useUser();
  const { supabase } = useSupabase();
  const { toast } = useToast();
  const router = useRouter();
  const { data: userProfileRaw } = useDoc<UserProfile>('users', user?.id);

  // Vessel-linked accounts only use this page when the vessel manager has
  // granted Proof of service on Team accounts.
  useEffect(() => {
    if (
      userProfileRaw &&
      isVesselLinkedAccount(userProfileRaw) &&
      !isVesselLinkedFeatureGranted(userProfileRaw, 'proof_of_service')
    ) {
      router.replace('/dashboard');
    }
  }, [userProfileRaw, router]);

  const [entries, setEntries] = useState<ProofOfService[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadDialogOpen, setDownloadDialogOpen] = useState(false);
  const [selectedForDownload, setSelectedForDownload] = useState<Set<string>>(new Set());
  const [downloadingSelected, setDownloadingSelected] = useState(false);

  const allSelected = useMemo(
    () => entries.length > 0 && selectedForDownload.size === entries.length,
    [entries.length, selectedForDownload.size]
  );
  const noneSelected = selectedForDownload.size === 0;

  useEffect(() => {
    if (!user?.id) {
      setIsLoading(false);
      return;
    }
    const fetchEntries = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('proof_of_service')
          .select('*')
          .eq('crew_user_id', user.id)
          .order('created_at', { ascending: false });
        if (error) throw error;
        const rows = data || [];
        const byId = new Map<string, (typeof rows)[0]>();
        rows.forEach((r) => byId.set(r.id, r));
        setEntries(Array.from(byId.values()).map(mapRow));
      } catch (e) {
        console.error('[PROOF OF SERVICE]', e);
        toast({
          title: 'Error',
          description: 'Failed to load proof of service entries.',
          variant: 'destructive',
        });
      } finally {
        setIsLoading(false);
      }
    };
    fetchEntries();
  }, [user?.id, supabase, toast]);

  useEffect(() => {
    if (downloadDialogOpen && entries.length > 0) {
      setSelectedForDownload(new Set(entries.map((e) => e.id)));
    }
  }, [downloadDialogOpen, entries]);

  const toggleSelected = (id: string) => {
    setSelectedForDownload((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const selectAll = () => setSelectedForDownload(new Set(entries.map((e) => e.id)));
  const clearAll = () => setSelectedForDownload(new Set());

  const handleDownloadSelected = async () => {
    const selected = entries.filter((e) => selectedForDownload.has(e.id));
    if (selected.length === 0) return;
    setDownloadingSelected(true);
    try {
      await generateProofOfServicePDF(
        selected.map(entryToPdfData),
        'download'
      );
      toast({
        title: 'Downloaded',
        description: `Proof of Service PDF with ${selected.length} ${selected.length === 1 ? 'entry' : 'entries'} saved to your device.`,
      });
      setDownloadDialogOpen(false);
    } catch (e) {
      toast({
        title: 'Error',
        description: 'Failed to generate PDF.',
        variant: 'destructive',
      });
    } finally {
      setDownloadingSelected(false);
    }
  };

  const handleDownload = async (entry: ProofOfService) => {
    setDownloadingId(entry.id);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Your session has expired. Please refresh and try again.');
      }
      const res = await fetch(`/api/proof-of-service/${entry.id}/file`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `Download failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `proof-of-service-${entry.id.slice(0, 8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ title: 'Downloaded', description: 'Proof of Service PDF saved to your device.' });
    } catch (e) {
      try {
        await generateProofOfServicePDF(
          {
            vesselName: entry.vesselName,
            vesselType: entry.vesselType,
            vesselImo: entry.vesselImo,
            crewName: entry.crewName,
            crewPosition: entry.crewPosition,
            startDate: entry.startDate,
            endDate: entry.endDate,
            totalDays: entry.totalDays,
            atSeaDays: entry.atSeaDays,
            standbyDays: entry.standbyDays,
            yardDays: entry.yardDays,
            leaveDays: entry.leaveDays,
            generatedByName: entry.generatedByName,
            generatedByEmail: entry.generatedByEmail,
            notes: entry.notes,
            verificationCode: entry.verificationCode,
          },
          'download',
        );
        toast({ title: 'Downloaded', description: 'Proof of Service PDF saved to your device.' });
      } catch {
        toast({
          title: 'Error',
          description: e instanceof Error ? e.message : 'Failed to download PDF.',
          variant: 'destructive',
        });
      }
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {!embedded ? (
          <div className="min-w-0 space-y-1 border-b border-border pb-4 sm:border-0 sm:pb-0">
            <h1 className="text-xl font-medium tracking-tight">Proof of service</h1>
            <p className="text-sm text-muted-foreground">
              Saved entries from vessels you have worked on. Download one file or combine several.
            </p>
          </div>
        ) : null}
        {entries.length > 0 ? (
          <Button
            className="h-8 shrink-0 rounded-md text-xs"
            onClick={() => setDownloadDialogOpen(true)}
          >
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Download selected
          </Button>
        ) : null}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="overflow-hidden rounded-md border border-border bg-background"
            >
              <div className="border-b border-border bg-muted/40 px-4 py-2.5">
                <Skeleton className="h-4 w-1/3" />
              </div>
              <div className="space-y-2 px-4 py-4">
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-8 w-full" />
              </div>
            </div>
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="overflow-hidden rounded-md border border-border bg-background">
          <div className="border-b border-border bg-muted/40 px-4 py-2.5">
            <p className="text-xs font-medium text-foreground">No proof of service yet</p>
          </div>
          <div className="flex flex-col items-center justify-center px-4 py-14 text-center">
            <ShieldCheck className="h-5 w-5 text-muted-foreground" />
            <p className="mt-3 max-w-md text-xs text-muted-foreground">
              When you leave a vessel, the vessel can generate a Proof of Service for your time on
              board and save it to your profile. Ask your vessel manager to create one from
              Generator → Documents.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((entry, index) => (
            <div
              key={entry.id ?? `entry-${index}`}
              className="overflow-hidden rounded-md border border-border bg-background"
            >
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border bg-muted/40 px-4 py-2.5">
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                    <Ship className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{entry.vesselName}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {format(parse(entry.startDate, 'yyyy-MM-dd', new Date()), 'dd MMM yyyy')} –{' '}
                      {format(parse(entry.endDate, 'yyyy-MM-dd', new Date()), 'dd MMM yyyy')}
                      {entry.vesselType && ` · ${entry.vesselType}`}
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0 rounded-md border-border text-xs"
                  onClick={() => handleDownload(entry)}
                  disabled={downloadingId === entry.id}
                >
                  {downloadingId === entry.id ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Download
                </Button>
              </div>
              <div className="px-4 py-3 sm:px-5">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                  <div>
                    <p className="text-[11px] text-muted-foreground">Total days</p>
                    <p className="font-mono text-sm font-medium tabular-nums">{entry.totalDays}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground">At sea</p>
                    <p className="font-mono text-sm font-medium tabular-nums text-sky-600">
                      {entry.atSeaDays}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground">Standby</p>
                    <p className="font-mono text-sm font-medium tabular-nums text-[#7629BB]">
                      {entry.standbyDays}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground">Yard</p>
                    <p className="font-mono text-sm font-medium tabular-nums">{entry.yardDays}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground">Leave</p>
                    <p className="font-mono text-sm font-medium tabular-nums">{entry.leaveDays}</p>
                  </div>
                </div>
                <p className="mt-3 text-[11px] text-muted-foreground">
                  Generated by {entry.generatedByName}
                  {entry.createdAt &&
                    ` on ${format(new Date(entry.createdAt), 'dd MMM yyyy')}`}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={downloadDialogOpen} onOpenChange={setDownloadDialogOpen}>
        <DialogContent className="flex max-h-[85vh] max-w-md flex-col rounded-md">
          <DialogHeader>
            <DialogTitle className="text-base font-medium">Download proof of service</DialogTitle>
            <DialogDescription>
              Select which entries to include. You can download all or choose specific vessels.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 border-b border-border pb-2 text-xs text-muted-foreground">
            <button
              type="button"
              className="font-medium text-foreground hover:underline"
              onClick={selectAll}
            >
              Select all
            </button>
            <span>·</span>
            <button
              type="button"
              className="font-medium text-foreground hover:underline"
              onClick={clearAll}
            >
              Clear all
            </button>
            <span className="ml-auto font-mono tabular-nums">
              {selectedForDownload.size} of {entries.length} selected
            </span>
          </div>
          <div className="-mr-1 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {entries.map((entry, index) => (
              <label
                key={entry.id ?? `entry-${index}`}
                className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 transition-colors hover:bg-muted/40"
              >
                <Checkbox
                  checked={selectedForDownload.has(entry.id)}
                  onCheckedChange={() => toggleSelected(entry.id)}
                  onPointerDown={(e) => e.preventDefault()}
                />
                <div className="min-w-0 flex-1">
                  <span className="text-sm font-medium">{entry.vesselName}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {format(parse(entry.startDate, 'yyyy-MM-dd', new Date()), 'dd MMM yyyy')} –{' '}
                    {format(parse(entry.endDate, 'yyyy-MM-dd', new Date()), 'dd MMM yyyy')}
                    {entry.vesselType && ` · ${entry.vesselType}`}
                  </span>
                </div>
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="h-8 rounded-md text-xs"
              onClick={() => setDownloadDialogOpen(false)}
              disabled={downloadingSelected}
            >
              Cancel
            </Button>
            <Button
              className="h-8 rounded-md text-xs"
              onClick={handleDownloadSelected}
              disabled={noneSelected || downloadingSelected}
            >
              {downloadingSelected ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="mr-1.5 h-3.5 w-3.5" />
              )}
              Download
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
