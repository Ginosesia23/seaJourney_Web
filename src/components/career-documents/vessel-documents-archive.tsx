'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format, isAfter, subDays } from 'date-fns';
import {
  Calendar,
  Check,
  Copy,
  Download,
  ExternalLink,
  FileCheck,
  FileText,
  FolderOpen,
  Layers,
  Loader2,
  RefreshCw,
  Search,
  Ship,
  Users,
} from 'lucide-react';

import { useUser, useSupabase } from '@/supabase';
import { useDoc } from '@/supabase/database';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
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
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { UserProfile, Testimonial, VesselGeneratedTestimonial } from '@/lib/types';
import { hasPaidDashboardAccess } from '@/supabase/database/subscription-helpers';
import { downloadVesselGeneratedTestimonialForCrew } from '@/lib/download-vessel-generated-testimonial-for-crew';
import { downloadTestimonialPdfForCrewMember } from '@/lib/download-testimonial-pdf-for-crew';
import { generateProofOfServicePDF, type TestimonialPDFFormat } from '@/lib/pdf-generator';

type ProofOfServiceRow = {
  id: string;
  vessel_id: string;
  crew_user_id: string;
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

type DocKind = 'vessel_generated' | 'proof' | 'approved' | 'pending';
type TypeFilter = 'all' | DocKind;
type SortKey = 'newest' | 'oldest' | 'crew' | 'period';

type UnifiedRow = {
  key: string;
  kind: DocKind;
  sortAt: string;
  typeLabel: string;
  shortType: string;
  crewName?: string;
  crewUserId?: string;
  crewPosition?: string | null;
  vesselName: string;
  startDate: string;
  endDate: string;
  totalDays?: number;
  periodExtra?: string;
  formatLabel?: string;
  verificationDisplay: string;
  hasVerification: boolean;
  action: 'vessel_pdf' | 'pos_pdf' | 'pdf_url' | 'testimonial_pdf' | 'stored_pdf';
  vesselGenerated?: VesselGeneratedTestimonial;
  proofRow?: ProofOfServiceRow;
  pdfUrl?: string | null;
  testimonialForPdf?: Testimonial;
  testimonialIdForPdf?: string;
};

function formatSjCode(code: string | null | undefined): string {
  if (!code?.trim()) return '—';
  const c = code.trim().toUpperCase();
  if (c.startsWith('SJ-')) return c;
  return `SJ-${c.replace(/^SJ-?/i, '')}`;
}

function formatPosCode(code: string | null | undefined): string {
  if (!code?.trim()) return '—';
  const cleaned = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const body = cleaned.startsWith('POS') ? cleaned.slice(3) : cleaned;
  if (body.length < 8) return `POS-${body}` || '—';
  return `POS-${body.slice(0, 8)}`;
}

function mapUserRowToProfile(row: Record<string, unknown>): UserProfile {
  return {
    id: String(row.id),
    email: String(row.email ?? ''),
    username: String(row.username ?? ''),
    firstName: (row.first_name as string) || (row.firstName as string) || undefined,
    lastName: (row.last_name as string) || (row.lastName as string) || undefined,
    position: (row.position as string) || undefined,
    role: ((row.role as string) || 'crew') as UserProfile['role'],
    subscriptionTier: String(row.subscription_tier || row.subscriptionTier || 'free'),
    subscriptionStatus: ((row.subscription_status as string) ||
      (row.subscriptionStatus as string) ||
      'inactive') as UserProfile['subscriptionStatus'],
    registrationDate: String(row.created_at || row.registrationDate || new Date().toISOString()),
    dateOfBirth: (row.date_of_birth as string) || (row.dateOfBirth as string) || null,
    dischargeBookNumber:
      (row.discharge_book_number as string) || (row.dischargeBookNumber as string) || null,
  };
}

function displayNameFromProfile(p: UserProfile): string {
  const name = `${p.firstName || ''} ${p.lastName || ''}`.trim();
  return name || p.username || p.email || '—';
}

const KIND_META: Record<
  DocKind,
  { label: string; short: string; badge: string }
> = {
  vessel_generated: {
    label: 'Testimonial (vessel)',
    short: 'Testimonial',
    badge: 'border-sky-500/20 bg-sky-500/10 text-sky-800 dark:text-sky-300',
  },
  proof: {
    label: 'Proof of service',
    short: 'Proof',
    badge: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300',
  },
  approved: {
    label: 'Testimonial (approved)',
    short: 'Approved',
    badge: 'border-violet-500/20 bg-violet-500/10 text-violet-800 dark:text-violet-300',
  },
  pending: {
    label: 'Testimonial',
    short: 'Pending',
    badge: 'border-amber-500/20 bg-amber-500/10 text-amber-800 dark:text-amber-300',
  },
};

export type VesselDocumentsArchiveProps = {
  /** Hide page chrome when nested in Career documents hub */
  embedded?: boolean;
  /** Force personal (crew) archive mode even if role is vessel */
  forcePersonal?: boolean;
};

export function VesselDocumentsArchive({
  embedded = false,
  forcePersonal = false,
}: VesselDocumentsArchiveProps = {}) {
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
  const [crewProfiles, setCrewProfiles] = useState<Record<string, UserProfile>>({});
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [crewFilter, setCrewFilter] = useState<string>('all');
  const [sortKey, setSortKey] = useState<SortKey>('newest');
  const [groupByCrew, setGroupByCrew] = useState(false);
  const [recentOnly, setRecentOnly] = useState(false);

  const { data: userProfileRaw, isLoading: profileLoading } = useDoc<UserProfile>('users', user?.id);

  const userProfile = useMemo(() => {
    if (!userProfileRaw) return null;
    const p = userProfileRaw as unknown as Record<string, unknown>;
    return {
      ...userProfileRaw,
      role: (p.role as string) || 'crew',
      subscriptionTier: (p.subscription_tier as string) || (p.subscriptionTier as string) || 'free',
      subscriptionStatus:
        (p.subscription_status as string) || (p.subscriptionStatus as string) || 'inactive',
      firstName: (p.first_name as string) || userProfileRaw.firstName,
      lastName: (p.last_name as string) || userProfileRaw.lastName,
      activeVesselId:
        (p.active_vessel_id as string) ||
        (p.activeVesselId as string) ||
        userProfileRaw.activeVesselId,
    } as UserProfile;
  }, [userProfileRaw]);

  const isPaidEntitled = Boolean(userProfileRaw && hasPaidDashboardAccess(userProfileRaw));
  const isVesselArchiveViewer = forcePersonal
    ? false
    : isPaidEntitled && (userProfile?.role === 'vessel' || userProfile?.role === 'admin');
  const isPersonalDocsViewer = forcePersonal
    ? isPaidEntitled
    : isPaidEntitled && (userProfile?.role === 'crew' || userProfile?.role === 'captain');
  const canAccessPage = Boolean(isVesselArchiveViewer || isPersonalDocsViewer);
  const activeVesselId = userProfile?.activeVesselId;

  useEffect(() => {
    if (profileLoading || !userProfile || !userProfileRaw) return;
    if (!hasPaidDashboardAccess(userProfileRaw)) {
      router.replace('/offers');
      return;
    }
    if (!canAccessPage) {
      router.replace('/dashboard');
    }
  }, [profileLoading, userProfile, userProfileRaw, canAccessPage, router]);

  const loadData = useCallback(async () => {
    if (!user?.id || !canAccessPage) return;
    if (isVesselArchiveViewer && !activeVesselId) {
      setVesselGenerated([]);
      setProofRows([]);
      setApprovedRows([]);
      setApprovedMeta({});
      setPendingTestimonials([]);
      setCrewProfiles({});
      setVesselNames({});
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const crewFilterId = isPersonalDocsViewer ? user.id : null;
      const vesselFilterId = isVesselArchiveViewer ? activeVesselId : null;

      const { data: idRows, error: idErr } = crewFilterId
        ? await supabase.from('testimonials').select('id').eq('user_id', crewFilterId)
        : { data: [] as { id: string }[], error: null };

      if (idErr) console.error('[vessel-documents] testimonial ids', idErr);

      const testimonialIds = (idRows || []).map((r: { id: string }) => r.id);

      let vgQuery = supabase
        .from('vessel_generated_testimonials')
        .select('*')
        .order('created_at', { ascending: false });
      let posQuery = supabase
        .from('proof_of_service')
        .select('*')
        .eq('data_source', 'vessel')
        .order('created_at', { ascending: false });

      if (crewFilterId) {
        vgQuery = vgQuery.eq('crew_user_id', crewFilterId);
        posQuery = posQuery.eq('crew_user_id', crewFilterId);
      }
      if (vesselFilterId) {
        vgQuery = vgQuery.eq('vessel_id', vesselFilterId);
        posQuery = posQuery.eq('vessel_id', vesselFilterId);
      }

      const [vgRes, posRes, approvedRes] = await Promise.all([
        vgQuery,
        posQuery,
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

      const { data: vesselT, error: vtErr } = crewFilterId
        ? await supabase
            .from('testimonials')
            .select('*')
            .eq('user_id', crewFilterId)
            .eq('data_source', 'vessel')
            .order('created_at', { ascending: false })
        : { data: [] as Testimonial[], error: null };

      if (vtErr) {
        console.error('[vessel-documents] vessel testimonials', vtErr);
        setPendingTestimonials([]);
      } else {
        const all = (vesselT || []) as Testimonial[];
        setPendingTestimonials(all.filter((t) => !approvedTidSet.has(t.id)));
      }

      const crewIdSet = new Set<string>();
      vg.forEach((x) => crewIdSet.add(x.crew_user_id));
      pos.forEach((x) => {
        if (x.crew_user_id) crewIdSet.add(x.crew_user_id);
      });
      if (crewIdSet.size > 0 && isVesselArchiveViewer) {
        const { data: crewRows, error: crewErr } = await supabase
          .from('users')
          .select('*')
          .in('id', [...crewIdSet]);
        if (crewErr) {
          console.error('[vessel-documents] crew profiles', crewErr);
          setCrewProfiles({});
        } else {
          const map: Record<string, UserProfile> = {};
          (crewRows || []).forEach((row: Record<string, unknown>) => {
            const profile = mapUserRowToProfile(row);
            map[profile.id] = profile;
          });
          setCrewProfiles(map);
        }
      } else {
        setCrewProfiles({});
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
  }, [user?.id, canAccessPage, isVesselArchiveViewer, isPersonalDocsViewer, activeVesselId, supabase]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const tableRows = useMemo((): UnifiedRow[] => {
    const rows: UnifiedRow[] = [];

    vesselGenerated.forEach((row) => {
      const fmt = row.pdf_format ? String(row.pdf_format).toUpperCase() : undefined;
      rows.push({
        key: `vg-${row.id}`,
        kind: 'vessel_generated',
        sortAt: row.created_at,
        typeLabel: KIND_META.vessel_generated.label,
        shortType: KIND_META.vessel_generated.short,
        crewName: crewProfiles[row.crew_user_id]
          ? displayNameFromProfile(crewProfiles[row.crew_user_id])
          : undefined,
        crewUserId: row.crew_user_id,
        vesselName: vesselNames[row.vessel_id] || '—',
        startDate: row.start_date,
        endDate: row.end_date,
        totalDays: row.total_days,
        formatLabel: fmt,
        periodExtra: fmt ? `${fmt} format` : undefined,
        verificationDisplay: '—',
        hasVerification: false,
        action: 'vessel_pdf',
        vesselGenerated: row,
      });
    });

    proofRows.forEach((row) => {
      const code = formatPosCode(row.verification_code);
      rows.push({
        key: `pos-${row.id}`,
        kind: 'proof',
        sortAt: row.created_at,
        typeLabel: KIND_META.proof.label,
        shortType: KIND_META.proof.short,
        crewName: row.crew_name || (row.crew_user_id && crewProfiles[row.crew_user_id]
          ? displayNameFromProfile(crewProfiles[row.crew_user_id])
          : undefined),
        crewUserId: row.crew_user_id,
        crewPosition: row.crew_position,
        vesselName: row.vessel_name || vesselNames[row.vessel_id] || '—',
        startDate: row.start_date,
        endDate: row.end_date,
        totalDays: row.total_days,
        verificationDisplay: code,
        hasVerification: code !== '—',
        action: 'pos_pdf',
        proofRow: row,
      });
    });

    approvedRows.forEach((a) => {
      const m = approvedMeta[a.testimonial_id];
      const vid = m?.vessel_id;
      const code = formatSjCode(a.testimonial_code);
      const legacyHttpUrl =
        m?.pdf_url && /^https?:\/\//i.test(m.pdf_url) ? m.pdf_url : null;
      rows.push({
        key: `ap-${a.id}`,
        kind: 'approved',
        sortAt: a.approved_at,
        typeLabel: KIND_META.approved.label,
        shortType: KIND_META.approved.short,
        vesselName: a.vessel_name || (vid ? vesselNames[vid] : null) || '—',
        startDate: a.start_date,
        endDate: a.end_date,
        periodExtra: `Approved ${format(new Date(a.approved_at), 'd MMM yyyy')}`,
        verificationDisplay: code,
        hasVerification: code !== '—',
        action: legacyHttpUrl ? 'pdf_url' : 'stored_pdf',
        pdfUrl: legacyHttpUrl,
        testimonialIdForPdf: a.testimonial_id,
      });
    });

    pendingTestimonials.forEach((t) => {
      const code = formatSjCode(t.testimonial_code);
      rows.push({
        key: `pt-${t.id}`,
        kind: 'pending',
        sortAt: t.created_at,
        typeLabel: KIND_META.pending.label,
        shortType: KIND_META.pending.short,
        vesselName: vesselNames[t.vessel_id] || '—',
        startDate: t.start_date,
        endDate: t.end_date,
        totalDays: t.total_days,
        periodExtra: `Status: ${t.status.replace(/_/g, ' ')}`,
        verificationDisplay: code,
        hasVerification: code !== '—',
        action: t.pdf_url ? 'pdf_url' : 'testimonial_pdf',
        pdfUrl: t.pdf_url ?? null,
        testimonialForPdf: t.pdf_url ? undefined : t,
      });
    });

    return rows;
  }, [
    vesselGenerated,
    proofRows,
    approvedRows,
    approvedMeta,
    pendingTestimonials,
    vesselNames,
    crewProfiles,
  ]);

  const crewOptions = useMemo(() => {
    const map = new Map<string, string>();
    tableRows.forEach((r) => {
      if (r.crewUserId && r.crewName) map.set(r.crewUserId, r.crewName);
    });
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [tableRows]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const recentCut = subDays(new Date(), 30);

    let rows = tableRows.filter((row) => {
      if (typeFilter !== 'all' && row.kind !== typeFilter) return false;
      if (crewFilter !== 'all' && row.crewUserId !== crewFilter) return false;
      if (recentOnly && !isAfter(new Date(row.sortAt), recentCut)) return false;
      if (!q) return true;
      const hay = [
        row.typeLabel,
        row.shortType,
        row.crewName,
        row.crewPosition,
        row.vesselName,
        row.verificationDisplay,
        row.formatLabel,
        row.periodExtra,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });

    rows = [...rows].sort((a, b) => {
      if (sortKey === 'oldest') {
        return new Date(a.sortAt).getTime() - new Date(b.sortAt).getTime();
      }
      if (sortKey === 'crew') {
        const c = (a.crewName || '').localeCompare(b.crewName || '');
        if (c !== 0) return c;
        return new Date(b.sortAt).getTime() - new Date(a.sortAt).getTime();
      }
      if (sortKey === 'period') {
        return new Date(b.startDate).getTime() - new Date(a.startDate).getTime();
      }
      return new Date(b.sortAt).getTime() - new Date(a.sortAt).getTime();
    });

    return rows;
  }, [tableRows, search, typeFilter, crewFilter, sortKey, recentOnly]);

  const stats = useMemo(() => {
    const total = tableRows.length;
    const testimonials = tableRows.filter(
      (r) => r.kind === 'vessel_generated' || r.kind === 'approved' || r.kind === 'pending',
    ).length;
    const proofs = tableRows.filter((r) => r.kind === 'proof').length;
    const verified = tableRows.filter((r) => r.hasVerification).length;
    const recentCut = subDays(new Date(), 30);
    const recent = tableRows.filter((r) => isAfter(new Date(r.sortAt), recentCut)).length;
    const crewCount = new Set(tableRows.map((r) => r.crewUserId).filter(Boolean)).size;
    return { total, testimonials, proofs, verified, recent, crewCount };
  }, [tableRows]);

  const groupedRows = useMemo(() => {
    if (!groupByCrew || !isVesselArchiveViewer) return null;
    const groups = new Map<string, { name: string; rows: UnifiedRow[] }>();
    filteredRows.forEach((row) => {
      const id = row.crewUserId || '__unknown__';
      const name = row.crewName || 'Unknown crew';
      if (!groups.has(id)) groups.set(id, { name, rows: [] });
      groups.get(id)!.rows.push(row);
    });
    return [...groups.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name));
  }, [filteredRows, groupByCrew, isVesselArchiveViewer]);

  const handleCopyCode = async (row: UnifiedRow) => {
    if (!row.hasVerification) return;
    try {
      await navigator.clipboard.writeText(row.verificationDisplay);
      setCopiedKey(row.key);
      toast({ title: 'Copied', description: `${row.verificationDisplay} copied to clipboard.` });
      setTimeout(() => setCopiedKey((cur) => (cur === row.key ? null : cur)), 1500);
    } catch {
      toast({
        variant: 'destructive',
        title: 'Could not copy',
        description: 'Clipboard access was blocked.',
      });
    }
  };

  const handleDownloadVesselGenerated = async (row: VesselGeneratedTestimonial, downloadKey: string) => {
    const crewProfile =
      isPersonalDocsViewer && userProfile
        ? userProfile
        : crewProfiles[row.crew_user_id] || userProfile;
    if (!crewProfile) return;
    setDownloadingId(downloadKey);
    try {
      const raw = String(row.pdf_format || 'mca').toLowerCase();
      const fmt = (raw === 'seajourney' || raw === 'amsa' ? raw : 'mca') as TestimonialPDFFormat;
      await downloadVesselGeneratedTestimonialForCrew(supabase, row, crewProfile, fmt, 'download');
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
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Your session has expired. Please refresh and try again.');
      }
      const res = await fetch(`/api/proof-of-service/${pos.id}/file`, {
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
      a.download = `proof-of-service-${pos.id.slice(0, 8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ title: 'Downloaded', description: 'Proof of Service PDF saved to your device.' });
    } catch (e) {
      console.error(e);
      // Fallback: regenerate client-side if stored file is unavailable
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
      } catch (fallbackErr) {
        console.error(fallbackErr);
        toast({
          variant: 'destructive',
          title: 'Could not download PDF',
          description: e instanceof Error ? e.message : 'Try again later.',
        });
      }
    } finally {
      setDownloadingId((cur) => (cur === downloadKey ? null : cur));
    }
  };

  const handleDownloadStoredTestimonialPdf = async (
    downloadKey: string,
    testimonialId: string,
  ) => {
    setDownloadingId(downloadKey);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Your session has expired. Please refresh and try again.');
      }
      const res = await fetch(`/api/testimonials/${testimonialId}/file`, {
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
      a.download = `sea-service-testimonial-${testimonialId.slice(0, 8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ title: 'Downloaded', description: 'Approved testimonial PDF saved to your device.' });
    } catch (e) {
      console.error(e);
      toast({
        variant: 'destructive',
        title: 'Could not download PDF',
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

  const renderActions = (row: UnifiedRow) => {
    const busy = downloadingId === row.key;
    return (
      <div className="flex items-center justify-end gap-1">
        {row.hasVerification ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg"
            aria-label="Copy verification code"
            onClick={() => void handleCopyCode(row)}
          >
            {copiedKey === row.key ? (
              <Check className="h-3.5 w-3.5 text-emerald-600" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </Button>
        ) : null}

        {isVesselArchiveViewer && row.crewUserId ? (
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 rounded-lg" asChild>
            <Link href={`/dashboard/crew?member=${row.crewUserId}`} aria-label="Open crew member">
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </Button>
        ) : null}

        {row.action === 'vessel_pdf' && row.vesselGenerated ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 rounded-lg px-2.5"
            disabled={busy}
            onClick={() => void handleDownloadVesselGenerated(row.vesselGenerated!, row.key)}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            <span className="ml-1.5 hidden sm:inline">PDF</span>
          </Button>
        ) : row.action === 'pos_pdf' && row.proofRow ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 rounded-lg px-2.5"
            disabled={busy}
            onClick={() => void handleDownloadProof(row.proofRow!, row.key)}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            <span className="ml-1.5 hidden sm:inline">PDF</span>
          </Button>
        ) : row.action === 'pdf_url' && row.pdfUrl ? (
          <Button type="button" variant="outline" size="sm" className="h-8 rounded-lg px-2.5" asChild>
            <a href={row.pdfUrl} target="_blank" rel="noopener noreferrer">
              <Download className="h-3.5 w-3.5" />
              <span className="ml-1.5 hidden sm:inline">PDF</span>
            </a>
          </Button>
        ) : row.action === 'stored_pdf' && row.testimonialIdForPdf ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 rounded-lg px-2.5"
            disabled={busy}
            onClick={() =>
              void handleDownloadStoredTestimonialPdf(row.key, row.testimonialIdForPdf!)
            }
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            <span className="ml-1.5 hidden sm:inline">PDF</span>
          </Button>
        ) : row.action === 'testimonial_pdf' &&
          (row.testimonialForPdf || row.testimonialIdForPdf) ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 rounded-lg px-2.5"
            disabled={busy}
            onClick={() =>
              void handleDownloadTestimonialPdf(row.key, {
                testimonial: row.testimonialForPdf,
                testimonialId: row.testimonialIdForPdf,
              })
            }
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            <span className="ml-1.5 hidden sm:inline">PDF</span>
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </div>
    );
  };

  const renderRow = (row: UnifiedRow) => (
    <TableRow key={row.key} className="group">
      <TableCell className="align-top">
        <Badge
          variant="outline"
          className={cn('rounded-md font-mono text-[10px] uppercase tracking-wider', KIND_META[row.kind].badge)}
        >
          {row.shortType}
        </Badge>
        {row.formatLabel ? (
          <div className="mt-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
            {row.formatLabel}
          </div>
        ) : null}
      </TableCell>
      {isVesselArchiveViewer ? (
        <TableCell className="align-top">
          <div className="font-medium leading-snug">{row.crewName || '—'}</div>
          {row.crewPosition ? (
            <div className="mt-0.5 text-xs text-muted-foreground">{row.crewPosition}</div>
          ) : null}
        </TableCell>
      ) : null}
      {!isVesselArchiveViewer ? (
        <TableCell className="align-top font-medium">{row.vesselName}</TableCell>
      ) : null}
      <TableCell className="align-top">
        <div className="flex items-start gap-1.5 text-sm">
          <Calendar className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <div>
            <div className="leading-snug">
              {format(new Date(row.startDate), 'd MMM yyyy')} –{' '}
              {format(new Date(row.endDate), 'd MMM yyyy')}
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {row.totalDays != null ? `${row.totalDays} days` : null}
              {row.totalDays != null && row.periodExtra ? ' · ' : null}
              {row.periodExtra || null}
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell className="align-top">
        <code
          className={cn(
            'rounded-md px-1.5 py-0.5 font-mono text-[11px]',
            row.hasVerification ? 'bg-muted text-foreground' : 'text-muted-foreground',
          )}
        >
          {row.verificationDisplay}
        </code>
        <div className="mt-1 text-[10px] text-muted-foreground">
          {format(new Date(row.sortAt), 'd MMM yyyy')}
        </div>
      </TableCell>
      <TableCell className="align-top text-right">{renderActions(row)}</TableCell>
    </TableRow>
  );

  if (profileLoading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-36 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!canAccessPage) {
    return null;
  }

  if (isVesselArchiveViewer && !activeVesselId) {
    return (
      <div className="flex flex-col gap-6">
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="px-5 py-10 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border bg-muted/40 text-muted-foreground">
              <Ship className="h-6 w-6" />
            </div>
            <h1 className="mt-4 text-lg font-semibold tracking-tight">Select an active vessel</h1>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Choose an active vessel in your profile to browse documents generated for its crew.
            </p>
            <Button asChild className="mt-4 rounded-lg" size="sm">
              <Link href="/dashboard/profile">Open vessel profile</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const empty = !loading && filteredRows.length === 0;
  const hasAnyDocs = tableRows.length > 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Console header */}
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        {!embedded ? (
        <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">
              <FolderOpen className="h-3.5 w-3.5" />
              {isVesselArchiveViewer ? 'Vessel archive' : 'Your documents'}
            </div>
            <h1 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">
              {isVesselArchiveViewer ? 'Generated documents' : 'Documents'}
            </h1>
            <p className="mt-1 max-w-xl text-xs text-muted-foreground">
              {isVesselArchiveViewer
                ? 'Search, filter, and download every sea-service document created for crew on this vessel.'
                : 'Sea service documents vessels have created for you — including SJ- and POS- verification codes.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-lg"
              disabled={loading}
              onClick={() => void loadData()}
            >
              <RefreshCw className={cn('mr-2 h-3.5 w-3.5', loading && 'animate-spin')} />
              Refresh
            </Button>
            {isVesselArchiveViewer ? (
              <Button asChild size="sm" className="rounded-lg">
                <Link href="/dashboard/documents">
                  <Layers className="mr-2 h-3.5 w-3.5" />
                  Document generator
                </Link>
              </Button>
            ) : null}
          </div>
        </div>
        ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
          <p className="text-xs text-muted-foreground">
            Documents vessels issued for you — search, filter, and download with SJ-/POS- codes.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-lg"
            disabled={loading}
            onClick={() => void loadData()}
          >
            <RefreshCw className={cn('mr-2 h-3.5 w-3.5', loading && 'animate-spin')} />
            Refresh
          </Button>
        </div>
        )}

        <div className="grid grid-cols-2 border-t bg-muted/30 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: 'Total', value: stats.total, hint: 'All documents', icon: FileText },
            { label: 'Testimonials', value: stats.testimonials, hint: 'Sea service', icon: FileCheck },
            { label: 'Proofs', value: stats.proofs, hint: 'Proof of service', icon: FileText },
            { label: 'Verified', value: stats.verified, hint: 'With SJ/POS code', icon: Check },
            { label: '30 days', value: stats.recent, hint: 'Recently created', icon: Calendar },
            ...(isVesselArchiveViewer
              ? [{ label: 'Crew', value: stats.crewCount, hint: 'People covered', icon: Users }]
              : [{ label: 'Vessels', value: new Set(tableRows.map((r) => r.vesselName)).size, hint: 'Sources', icon: Ship }]),
          ].map((m, i, arr) => {
            const Icon = m.icon;
            return (
              <div
                key={m.label}
                className={cn(
                  'border-border px-4 py-3 sm:px-5',
                  i < arr.length - 1 && 'lg:border-r',
                  i % 2 === 0 && 'max-sm:border-r',
                  i < 4 && 'max-sm:border-b',
                  i < 3 && 'sm:border-r sm:max-lg:[&:nth-child(3)]:border-r-0',
                  i >= 3 && i < 6 && 'sm:border-b lg:border-b-0',
                )}
              >
                <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  <Icon className="h-3 w-3" />
                  {m.label}
                </div>
                <div className="mt-1 font-mono text-2xl font-semibold tabular-nums leading-none">
                  {loading ? '—' : String(m.value).padStart(2, '0')}
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">{m.hint}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Filters + table */}
      <section className="overflow-hidden rounded-xl border bg-card">
        <div className="flex flex-col gap-3 border-b bg-muted/20 px-4 py-3 sm:px-5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={
                  isVesselArchiveViewer
                    ? 'Search crew, code, format…'
                    : 'Search vessel, code, type…'
                }
                className="h-9 rounded-lg pl-8"
              />
            </div>

            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as TypeFilter)}>
              <SelectTrigger className="h-9 w-[150px] rounded-lg">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="vessel_generated">Testimonials</SelectItem>
                <SelectItem value="proof">Proof of service</SelectItem>
                {isPersonalDocsViewer ? (
                  <>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                  </>
                ) : null}
              </SelectContent>
            </Select>

            {isVesselArchiveViewer && crewOptions.length > 0 ? (
              <Select value={crewFilter} onValueChange={setCrewFilter}>
                <SelectTrigger className="h-9 w-[160px] rounded-lg">
                  <SelectValue placeholder="Crew" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All crew</SelectItem>
                  {crewOptions.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}

            <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
              <SelectTrigger className="h-9 w-[140px] rounded-lg">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest first</SelectItem>
                <SelectItem value="oldest">Oldest first</SelectItem>
                <SelectItem value="period">By period</SelectItem>
                {isVesselArchiveViewer ? <SelectItem value="crew">By crew</SelectItem> : null}
              </SelectContent>
            </Select>

            <Button
              type="button"
              variant={recentOnly ? 'default' : 'outline'}
              size="sm"
              className="h-9 rounded-lg"
              onClick={() => setRecentOnly((v) => !v)}
            >
              Last 30 days
            </Button>

            {isVesselArchiveViewer ? (
              <Button
                type="button"
                variant={groupByCrew ? 'default' : 'outline'}
                size="sm"
                className="h-9 rounded-lg"
                onClick={() => setGroupByCrew((v) => !v)}
              >
                <Users className="mr-1.5 h-3.5 w-3.5" />
                Group by crew
              </Button>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span>
              Showing{' '}
              <span className="font-mono font-semibold text-foreground">
                {filteredRows.length.toString().padStart(2, '0')}
              </span>{' '}
              of{' '}
              <span className="font-mono font-semibold text-foreground">
                {tableRows.length.toString().padStart(2, '0')}
              </span>
            </span>
            {(search || typeFilter !== 'all' || crewFilter !== 'all' || recentOnly) && (
              <button
                type="button"
                className="font-medium text-primary hover:underline"
                onClick={() => {
                  setSearch('');
                  setTypeFilter('all');
                  setCrewFilter('all');
                  setRecentOnly(false);
                }}
              >
                Clear filters
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading archive…
          </div>
        ) : empty ? (
          <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border bg-muted/40 text-muted-foreground">
              <Ship className="h-6 w-6" />
            </div>
            <p className="mt-4 text-sm font-semibold">
              {hasAnyDocs ? 'No documents match these filters' : 'No documents yet'}
            </p>
            <p className="mt-1 max-w-md text-xs text-muted-foreground">
              {hasAnyDocs
                ? 'Try clearing search or filters.'
                : isVesselArchiveViewer
                  ? 'Generate a testimonial or proof of service from Document generator — it will appear here for every crew member.'
                  : 'When a vessel generates a document for you, it will show up here with any verification code.'}
            </p>
            {isVesselArchiveViewer && !hasAnyDocs ? (
              <Button asChild size="sm" className="mt-4 rounded-lg">
                <Link href="/dashboard/documents">
                  <Layers className="mr-2 h-3.5 w-3.5" />
                  Open Document generator
                </Link>
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="font-mono text-[10px] uppercase tracking-wider">Type</TableHead>
                  {isVesselArchiveViewer ? (
                    <TableHead className="font-mono text-[10px] uppercase tracking-wider">Crew</TableHead>
                  ) : (
                    <TableHead className="font-mono text-[10px] uppercase tracking-wider">Vessel</TableHead>
                  )}
                  <TableHead className="font-mono text-[10px] uppercase tracking-wider">Period</TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-wider">
                    Code / created
                  </TableHead>
                  <TableHead className="w-[150px] text-right font-mono text-[10px] uppercase tracking-wider">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupedRows
                  ? groupedRows.flatMap(([crewId, group]) => [
                      <TableRow key={`g-${crewId}`} className="bg-muted/40 hover:bg-muted/40">
                        <TableCell colSpan={5} className="py-2">
                          <div className="flex items-center gap-2">
                            <Users className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-sm font-semibold">{group.name}</span>
                            <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                              {String(group.rows.length).padStart(2, '0')} docs
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>,
                      ...group.rows.map((row) => renderRow(row)),
                    ])
                  : filteredRows.map((row) => renderRow(row))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
