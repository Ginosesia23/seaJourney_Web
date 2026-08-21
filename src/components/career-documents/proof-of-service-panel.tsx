'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, useSupabase } from '@/supabase';
import { useDoc } from '@/supabase/database';
import { isVesselLinkedAccount } from '@/supabase/database/subscription-helpers';
import { isVesselLinkedFeatureGranted } from '@/lib/vessel-linked-features';
import type { UserProfile } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        {!embedded ? (
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Proof of Service</h1>
          <p className="text-muted-foreground mt-1">
            Your saved proof of service entries from vessels you have worked on. Download one file per entry or choose which entries to include in a single download.
          </p>
        </div>
        ) : (
          <div>
            <p className="text-sm text-muted-foreground">
              Saved proof of service entries from vessels you have worked on. Download one file or combine several into a single PDF.
            </p>
          </div>
        )}
        {entries.length > 0 && (
          <Button
            className="shrink-0 rounded-lg"
            onClick={() => setDownloadDialogOpen(true)}
          >
            <Download className="h-4 w-4 mr-2" />
            Download selected
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-5 w-1/3" />
                <Skeleton className="h-4 w-1/2 mt-2" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-10 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : entries.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <ShieldCheck className="h-14 w-14 text-muted-foreground mb-4 opacity-50" />
            <h3 className="text-lg font-semibold mb-2">No proof of service yet</h3>
            <p className="text-sm text-muted-foreground max-w-md mb-4">
              When you leave a vessel, the vessel can generate a Proof of Service for your time on board and save it to your profile. You can then download or print it here. Ask your vessel manager to create one for you from Generator → Documents.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {entries.map((entry, index) => (
            <Card key={entry.id ?? `entry-${index}`} className="overflow-hidden">
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Ship className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{entry.vesselName}</CardTitle>
                      <CardDescription className="mt-0.5">
                        {format(parse(entry.startDate, 'yyyy-MM-dd', new Date()), 'dd MMM yyyy')} – {format(parse(entry.endDate, 'yyyy-MM-dd', new Date()), 'dd MMM yyyy')}
                        {entry.vesselType && ` · ${entry.vesselType}`}
                      </CardDescription>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl shrink-0"
                    onClick={() => handleDownload(entry)}
                    disabled={downloadingId === entry.id}
                  >
                    {downloadingId === entry.id ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Download className="h-4 w-4 mr-2" />
                    )}
                    Download
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">Total days</span>
                    <p className="font-semibold">{entry.totalDays}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">At sea</span>
                    <p className="font-semibold">{entry.atSeaDays}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Standby</span>
                    <p className="font-semibold text-purple-600 dark:text-purple-400">{entry.standbyDays}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Yard</span>
                    <p className="font-semibold">{entry.yardDays}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Leave</span>
                    <p className="font-semibold">{entry.leaveDays}</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-3">
                  Generated by {entry.generatedByName}
                  {entry.createdAt && ` on ${format(new Date(entry.createdAt), 'dd MMM yyyy')}`}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={downloadDialogOpen} onOpenChange={setDownloadDialogOpen}>
        <DialogContent className="max-w-md max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Download Proof of Service</DialogTitle>
            <DialogDescription>
              Select which entries to include. You can download all or choose specific vessels.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 text-sm text-muted-foreground border-b pb-2">
            <button
              type="button"
              className="text-primary hover:underline font-medium"
              onClick={selectAll}
            >
              Select all
            </button>
            <span>·</span>
            <button
              type="button"
              className="text-primary hover:underline font-medium"
              onClick={clearAll}
            >
              Clear all
            </button>
            <span className="ml-auto">
              {selectedForDownload.size} of {entries.length} selected
            </span>
          </div>
          <div className="overflow-y-auto flex-1 min-h-0 space-y-2 pr-1 -mr-1">
            {entries.map((entry, index) => (
              <label
                key={entry.id ?? `entry-${index}`}
                className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors"
              >
                <Checkbox
                  checked={selectedForDownload.has(entry.id)}
                  onCheckedChange={() => toggleSelected(entry.id)}
                  onPointerDown={(e) => e.preventDefault()}
                />
                <div className="flex-1 min-w-0">
                  <span className="font-medium">{entry.vesselName}</span>
                  <span className="text-muted-foreground text-sm block">
                    {format(parse(entry.startDate, 'yyyy-MM-dd', new Date()), 'dd MMM yyyy')} – {format(parse(entry.endDate, 'yyyy-MM-dd', new Date()), 'dd MMM yyyy')}
                    {entry.vesselType && ` · ${entry.vesselType}`}
                  </span>
                </div>
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDownloadDialogOpen(false)}
              disabled={downloadingSelected}
            >
              Cancel
            </Button>
            <Button
              onClick={handleDownloadSelected}
              disabled={noneSelected || downloadingSelected}
            >
              {downloadingSelected ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Download
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
