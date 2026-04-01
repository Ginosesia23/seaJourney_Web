'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useUser, useSupabase } from '@/supabase';
import { useDoc } from '@/supabase/database';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { FileText, Loader2, Download, Ship, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import type { UserProfile, Testimonial, VesselGeneratedTestimonial } from '@/lib/types';
import { hasActiveSubscription } from '@/supabase/database/subscription-helpers';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { downloadVesselGeneratedTestimonialForCrew } from '@/lib/download-vessel-generated-testimonial-for-crew';
import { downloadTestimonialPdfForCrewMember } from '@/lib/download-testimonial-pdf-for-crew';
import { generateProofOfServicePDF, type TestimonialPDFFormat } from '@/lib/pdf-generator';

type ProofOfServiceRow = {
  id: string;
  vessel_id: string;
  start_date: string;
  end_date: string;
  total_days: number;
  at_sea_days: number;
  standby_days: number;
  yard_days: number;
  leave_days: number;
  vessel_name: string;
  vessel_type: string | null;
  vessel_imo: string | null;
  crew_name: string;
  crew_position: string | null;
  generated_by_name: string;
  generated_by_email: string | null;
  notes: string | null;
  verification_code: string | null;
  created_at: string;
};

type ApprovedTestimonialRow = {
  id: string;
  testimonial_id: string;
  vessel_name: string;
  start_date: string;
  end_date: string;
  testimonial_code: string | null;
  approved_at: string;
};

function formatSjCode(code: string | null | undefined): string {
  if (!code?.trim()) return '—';
  const c = code.trim().toUpperCase();
  if (c.startsWith('SJ-')) return c;
  return `SJ-${c.replace(/^SJ-?/i, '')}`;
}

function formatPosCode(code: string | null | undefined): string {
  if (!code?.trim()) return '—';
  const c = code.trim().toUpperCase();
  if (c.startsWith('POS-')) return c;
  return `POS-${c.replace(/^POS-?/i, '')}`;
}

type UnifiedRow = {
  key: string;
  sortAt: string;
  typeLabel: string;
  vesselName: string;
  startDate: string;
  endDate: string;
  totalDays?: number;
  periodExtra?: string;
  verificationDisplay: string;
  action: 'vessel_pdf' | 'pos_pdf' | 'pdf_url' | 'testimonial_pdf';
  vesselGenerated?: VesselGeneratedTestimonial;
  proofRow?: ProofOfServiceRow;
  pdfUrl?: string | null;
  /** Pending testimonial row — generate PDF without extra fetch */
  testimonialForPdf?: Testimonial;
  /** Approved testimonial id when there is no stored pdf_url */
  testimonialIdForPdf?: string;
};

export default function VesselDocumentsPage() {
  const { user } = useUser();
  const { supabase } = useSupabase();
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [vesselGenerated, setVesselGenerated] = useState<VesselGeneratedTestimonial[]>([]);
  const [proofRows, setProofRows] = useState<ProofOfServiceRow[]>([]);
  const [approvedRows, setApprovedRows] = useState<ApprovedTestimonialRow[]>([]);
  const [approvedMeta, setApprovedMeta] = useState<
    Record<string, { pdf_url: string | null; vessel_id: string | null }>
  >({});
  const [pendingTestimonials, setPendingTestimonials] = useState<Testimonial[]>([]);
  const [vesselNames, setVesselNames] = useState<Record<string, string>>({});
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const { data: userProfileRaw, isLoading: profileLoading } = useDoc<UserProfile>('users', user?.id);

  const userProfile = useMemo(() => {
    if (!userProfileRaw) return null;
    const p = userProfileRaw as Record<string, unknown>;
    return {
      ...userProfileRaw,
      role: (p.role as string) || 'crew',
      subscriptionTier: (p.subscription_tier as string) || (p.subscriptionTier as string) || 'free',
      subscriptionStatus:
        (p.subscription_status as string) || (p.subscriptionStatus as string) || 'inactive',
      firstName: (p.first_name as string) || userProfileRaw.firstName,
      lastName: (p.last_name as string) || userProfileRaw.lastName,
    } as UserProfile;
  }, [userProfileRaw]);

  const isCrewLimited = useMemo(() => {
    if (!userProfile || !userProfileRaw) return false;
    const tier = (userProfile.subscriptionTier || '').toLowerCase();
    return (
      userProfile.role === 'crew' &&
      tier === 'crew_limited' &&
      hasActiveSubscription(userProfileRaw)
    );
  }, [userProfile, userProfileRaw]);

  useEffect(() => {
    if (!profileLoading && userProfile && !isCrewLimited) {
      router.replace('/dashboard');
    }
  }, [profileLoading, userProfile, isCrewLimited, router]);

  const loadData = useCallback(async () => {
    if (!user?.id || !isCrewLimited) return;
    setLoading(true);
    try {
      const { data: idRows, error: idErr } = await supabase
        .from('testimonials')
        .select('id')
        .eq('user_id', user.id);

      if (idErr) {
        console.error('[vessel-documents] testimonial ids', idErr);
      }

      const testimonialIds = (idRows || []).map((r: { id: string }) => r.id);

      const [vgRes, posRes, approvedRes] = await Promise.all([
        supabase
          .from('vessel_generated_testimonials')
          .select('*')
          .eq('crew_user_id', user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('proof_of_service')
          .select('*')
          .eq('crew_user_id', user.id)
          .eq('data_source', 'vessel')
          .order('created_at', { ascending: false }),
        testimonialIds.length > 0
          ? supabase.from('approved_testimonials').select('*').in('testimonial_id', testimonialIds)
          : Promise.resolve({ data: [] as ApprovedTestimonialRow[], error: null }),
      ]);

      if (vgRes.error) console.error('[vessel-documents]', vgRes.error);
      if (posRes.error) console.error('[vessel-documents]', posRes.error);
      if ('error' in approvedRes && approvedRes.error) {
        console.error('[vessel-documents]', approvedRes.error);
      }

      const vg = (vgRes.data || []) as VesselGeneratedTestimonial[];
      const pos = (posRes.data || []) as ProofOfServiceRow[];
      const approved = (approvedRes.data || []) as ApprovedTestimonialRow[];

      setVesselGenerated(vg);
      setProofRows(pos);
      setApprovedRows(approved);

      const approvedTidSet = new Set(approved.map((a) => a.testimonial_id));

      let meta: Record<string, { pdf_url: string | null; vessel_id: string | null }> = {};
      if (approvedTidSet.size > 0) {
        const { data: tmeta, error: metaErr } = await supabase
          .from('testimonials')
          .select('id, pdf_url, vessel_id')
          .in('id', [...approvedTidSet]);
        if (metaErr) {
          console.error('[vessel-documents] testimonial meta', metaErr);
        } else {
          meta = Object.fromEntries(
            (tmeta || []).map((t: { id: string; pdf_url: string | null; vessel_id: string }) => [
              t.id,
              { pdf_url: t.pdf_url ?? null, vessel_id: t.vessel_id ?? null },
            ]),
          );
        }
      }
      setApprovedMeta(meta);

      const { data: vesselT, error: vtErr } = await supabase
        .from('testimonials')
        .select('*')
        .eq('user_id', user.id)
        .eq('data_source', 'vessel')
        .order('created_at', { ascending: false });

      if (vtErr) {
        console.error('[vessel-documents] vessel testimonials', vtErr);
        setPendingTestimonials([]);
      } else {
        const all = (vesselT || []) as Testimonial[];
        setPendingTestimonials(all.filter((t) => !approvedTidSet.has(t.id)));
      }

      const vesselIdSet = new Set<string>();
      vg.forEach((x) => vesselIdSet.add(x.vessel_id));
      pos.forEach((x) => vesselIdSet.add(x.vessel_id));
      approved.forEach((a) => {
        const vid = meta[a.testimonial_id]?.vessel_id;
        if (vid) vesselIdSet.add(vid);
      });
      (vesselT || []).forEach((t: Testimonial) => vesselIdSet.add(t.vessel_id));

      if (vesselIdSet.size > 0) {
        const { data: vessels } = await supabase
          .from('vessels')
          .select('id, name')
          .in('id', [...vesselIdSet]);
        const map: Record<string, string> = {};
        vessels?.forEach((v: { id: string; name: string }) => {
          map[v.id] = v.name || v.id;
        });
        setVesselNames(map);
      } else {
        setVesselNames({});
      }
    } finally {
      setLoading(false);
    }
  }, [user?.id, isCrewLimited, supabase]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const tableRows = useMemo((): UnifiedRow[] => {
    const rows: UnifiedRow[] = [];

    vesselGenerated.forEach((row) => {
      rows.push({
        key: `vg-${row.id}`,
        sortAt: row.created_at,
        typeLabel: 'Testimonial (vessel generated)',
        vesselName: vesselNames[row.vessel_id] || '—',
        startDate: row.start_date,
        endDate: row.end_date,
        totalDays: row.total_days,
        periodExtra: row.pdf_format ? `${row.pdf_format.toUpperCase()} format` : undefined,
        verificationDisplay: '—',
        action: 'vessel_pdf',
        vesselGenerated: row,
      });
    });

    proofRows.forEach((row) => {
      rows.push({
        key: `pos-${row.id}`,
        sortAt: row.created_at,
        typeLabel: 'Proof of service',
        vesselName: row.vessel_name || vesselNames[row.vessel_id] || '—',
        startDate: row.start_date,
        endDate: row.end_date,
        totalDays: row.total_days,
        verificationDisplay: formatPosCode(row.verification_code),
        action: 'pos_pdf',
        proofRow: row,
      });
    });

    approvedRows.forEach((a) => {
      const m = approvedMeta[a.testimonial_id];
      const vid = m?.vessel_id;
      rows.push({
        key: `ap-${a.id}`,
        sortAt: a.approved_at,
        typeLabel: 'Testimonial (approved)',
        vesselName: a.vessel_name || (vid ? vesselNames[vid] : null) || '—',
        startDate: a.start_date,
        endDate: a.end_date,
        totalDays: undefined,
        periodExtra: `Approved ${format(new Date(a.approved_at), 'd MMM yyyy')}`,
        verificationDisplay: formatSjCode(a.testimonial_code),
        action: m?.pdf_url ? 'pdf_url' : 'testimonial_pdf',
        pdfUrl: m?.pdf_url ?? null,
        testimonialIdForPdf: m?.pdf_url ? undefined : a.testimonial_id,
      });
    });

    pendingTestimonials.forEach((t) => {
      rows.push({
        key: `pt-${t.id}`,
        sortAt: t.created_at,
        typeLabel: 'Testimonial',
        vesselName: vesselNames[t.vessel_id] || '—',
        startDate: t.start_date,
        endDate: t.end_date,
        totalDays: t.total_days,
        periodExtra: `Status: ${t.status.replace(/_/g, ' ')}`,
        verificationDisplay: formatSjCode(t.testimonial_code),
        action: t.pdf_url ? 'pdf_url' : 'testimonial_pdf',
        pdfUrl: t.pdf_url ?? null,
        testimonialForPdf: t.pdf_url ? undefined : t,
      });
    });

    rows.sort((a, b) => new Date(b.sortAt).getTime() - new Date(a.sortAt).getTime());
    return rows;
  }, [
    vesselGenerated,
    proofRows,
    approvedRows,
    approvedMeta,
    pendingTestimonials,
    vesselNames,
  ]);

  const handleDownloadVesselGenerated = async (row: VesselGeneratedTestimonial, downloadKey: string) => {
    if (!userProfile) return;
    setDownloadingId(downloadKey);
    try {
      const fmt = (row.pdf_format === 'seajourney' ? 'seajourney' : 'mca') as TestimonialPDFFormat;
      await downloadVesselGeneratedTestimonialForCrew(supabase, row, userProfile, fmt, 'download');
      toast({ title: 'Download started', description: 'Your PDF should download shortly.' });
    } catch (e) {
      console.error(e);
      toast({
        variant: 'destructive',
        title: 'Could not generate PDF',
        description: e instanceof Error ? e.message : 'Try again later.',
      });
    } finally {
      setDownloadingId((cur) => (cur === downloadKey ? null : cur));
    }
  };

  const handleDownloadProof = async (pos: ProofOfServiceRow, downloadKey: string) => {
    setDownloadingId(downloadKey);
    try {
      await generateProofOfServicePDF(
        {
          vesselName: pos.vessel_name,
          vesselType: pos.vessel_type,
          vesselImo: pos.vessel_imo,
          crewName: pos.crew_name,
          crewPosition: pos.crew_position,
          startDate: pos.start_date,
          endDate: pos.end_date,
          totalDays: pos.total_days,
          atSeaDays: pos.at_sea_days,
          standbyDays: pos.standby_days,
          yardDays: pos.yard_days,
          leaveDays: pos.leave_days,
          generatedByName: pos.generated_by_name,
          generatedByEmail: pos.generated_by_email,
          notes: pos.notes,
          verificationCode: pos.verification_code,
        },
        'download',
      );
      toast({ title: 'Downloaded', description: 'Proof of Service PDF saved to your device.' });
    } catch (e) {
      console.error(e);
      toast({
        variant: 'destructive',
        title: 'Could not generate PDF',
        description: e instanceof Error ? e.message : 'Try again later.',
      });
    } finally {
      setDownloadingId((cur) => (cur === downloadKey ? null : cur));
    }
  };

  const handleDownloadTestimonialPdf = async (
    downloadKey: string,
    opts: { testimonial?: Testimonial; testimonialId?: string },
  ) => {
    if (!userProfile) return;
    setDownloadingId(downloadKey);
    try {
      let testimonial = opts.testimonial;
      const tid = opts.testimonialId ?? opts.testimonial?.id;
      if (!testimonial && tid) {
        const { data, error } = await supabase.from('testimonials').select('*').eq('id', tid).maybeSingle();
        if (error || !data) {
          throw new Error('Could not load testimonial for PDF.');
        }
        testimonial = data as Testimonial;
      }
      if (!testimonial) {
        throw new Error('No testimonial to download.');
      }
      await downloadTestimonialPdfForCrewMember(supabase, testimonial, userProfile, user?.id, 'mca');
      toast({ title: 'Download started', description: 'Your PDF should download shortly.' });
    } catch (e) {
      console.error(e);
      toast({
        variant: 'destructive',
        title: 'Could not generate PDF',
        description: e instanceof Error ? e.message : 'Try again later.',
      });
    } finally {
      setDownloadingId((cur) => (cur === downloadKey ? null : cur));
    }
  };

  if (profileLoading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!isCrewLimited) {
    return null;
  }

  const empty = !loading && tableRows.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <FileText className="h-8 w-8 text-primary" />
          Documents
        </h1>
        <p className="text-muted-foreground max-w-2xl">
          Sea service documents your vessels have created for you, including approved testimonials with
          SeaJourney verification codes (SJ-) and proof of service codes (POS-). You cannot create new
          documents here; your vessel can generate them from their dashboard.
        </p>
      </div>

      <Card className="rounded-xl border">
        <CardHeader>
          <CardTitle>Documents from your vessels</CardTitle>
          <CardDescription>
            Testimonials, proof of service, and approved records linked to your account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12 text-muted-foreground gap-2">
              <Loader2 className="h-6 w-6 animate-spin" />
              Loading…
            </div>
          ) : empty ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
              <Ship className="h-12 w-12 mb-4 opacity-40" />
              <p className="font-medium text-foreground">No vessel documents yet</p>
              <p className="text-sm max-w-md mt-2">
                When a vessel generates a document for you, it will appear here for you to view or
                download.
              </p>
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Vessel</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead className="whitespace-nowrap">Verification code</TableHead>
                    <TableHead className="w-[140px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tableRows.map((row) => (
                    <TableRow key={row.key}>
                      <TableCell>
                        <span className="font-medium text-sm">{row.typeLabel}</span>
                      </TableCell>
                      <TableCell className="font-medium">{row.vesselName}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-sm">
                          <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                          {format(new Date(row.startDate), 'd MMM yyyy')} –{' '}
                          {format(new Date(row.endDate), 'd MMM yyyy')}
                        </div>
                        {row.totalDays != null ? (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {row.totalDays} days
                            {row.periodExtra ? ` · ${row.periodExtra}` : ''}
                          </div>
                        ) : row.periodExtra ? (
                          <div className="text-xs text-muted-foreground mt-0.5">{row.periodExtra}</div>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
                          {row.verificationDisplay}
                        </code>
                      </TableCell>
                      <TableCell>
                        {row.action === 'vessel_pdf' && row.vesselGenerated ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="shrink-0"
                            aria-label="Download PDF"
                            disabled={downloadingId === row.key}
                            onClick={() =>
                              void handleDownloadVesselGenerated(row.vesselGenerated!, row.key)
                            }
                          >
                            {downloadingId === row.key ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Download className="h-4 w-4" />
                            )}
                          </Button>
                        ) : row.action === 'pos_pdf' && row.proofRow ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="shrink-0"
                            aria-label="Download proof of service PDF"
                            disabled={downloadingId === row.key}
                            onClick={() => void handleDownloadProof(row.proofRow!, row.key)}
                          >
                            {downloadingId === row.key ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Download className="h-4 w-4" />
                            )}
                          </Button>
                        ) : row.action === 'pdf_url' && row.pdfUrl ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="shrink-0"
                            aria-label="Open or download PDF"
                            asChild
                          >
                            <a href={row.pdfUrl} target="_blank" rel="noopener noreferrer">
                              <Download className="h-4 w-4" />
                            </a>
                          </Button>
                        ) : row.action === 'testimonial_pdf' &&
                          (row.testimonialForPdf || row.testimonialIdForPdf) ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="shrink-0"
                            aria-label="Download testimonial PDF"
                            disabled={downloadingId === row.key}
                            onClick={() =>
                              void handleDownloadTestimonialPdf(row.key, {
                                testimonial: row.testimonialForPdf,
                                testimonialId: row.testimonialIdForPdf,
                              })
                            }
                          >
                            {downloadingId === row.key ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Download className="h-4 w-4" />
                            )}
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
