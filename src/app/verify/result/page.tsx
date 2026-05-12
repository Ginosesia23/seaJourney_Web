'use client';

import { useEffect, useMemo, useState, Suspense, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  Compass,
  FileSignature,
  Loader2,
  Search,
  Ship,
  User,
  XCircle,
} from 'lucide-react';

import { WkAuthShell } from '@/components/wk/wk-auth-shell';
import { createPublicSupabaseClient } from '@/lib/supabase-public';

type VerificationStatus = 'verified' | 'voided' | 'not_found';
type DocumentType = 'testimonial' | 'proof_of_service';

interface VerificationData {
  crew_name: string;
  rank: string;
  vessel_name: string;
  imo: string | null;
  start_date: string;
  end_date: string;
  total_days: number;
  sea_days: number;
  standby_days: number;
  captain_name: string;
  captain_license: string | null;
  approved_at: string;
  testimonial_code: string | null;
  document_id: string;
}

interface ProofOfServiceData {
  verification_code: string;
  vessel_name: string;
  vessel_type: string | null;
  vessel_imo: string | null;
  crew_name: string;
  crew_position: string | null;
  start_date: string;
  end_date: string;
  total_days: number;
  at_sea_days: number;
  standby_days: number;
  yard_days: number;
  leave_days: number;
  generated_by_name: string;
  generated_by_email: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Reusable presentational primitives
// ---------------------------------------------------------------------------

function StatusBanner({
  tone,
  icon,
  title,
  description,
  rightSlot,
}: {
  tone: 'good' | 'bad' | 'warn';
  icon: ReactNode;
  title: string;
  description?: ReactNode;
  rightSlot?: ReactNode;
}) {
  return (
    <div className="wk-status-banner" data-tone={tone}>
      <span className="wk-status-icon" data-tone={tone}>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div
          className="text-base font-semibold sm:text-lg"
          style={{ color: 'var(--wk-text)' }}
        >
          {title}
        </div>
        {description ? (
          <div
            className="mt-1 text-sm"
            style={{ color: 'var(--wk-text-soft)' }}
          >
            {description}
          </div>
        ) : null}
      </div>
      {rightSlot ? <div className="hidden sm:block">{rightSlot}</div> : null}
    </div>
  );
}

function SectionCard({
  eyebrow,
  title,
  icon,
  children,
}: {
  eyebrow?: string;
  title: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className="wk-auth-card p-6 sm:p-8"
      style={{ boxShadow: 'var(--wk-shadow-md)' }}
    >
      <div className="flex items-center gap-3">
        {icon ? (
          <span
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg"
            style={{
              backgroundColor: 'var(--wk-accent-soft)',
              color: 'var(--wk-accent)',
              border: '1px solid var(--wk-accent-ring)',
            }}
          >
            {icon}
          </span>
        ) : null}
        <div className="min-w-0">
          {eyebrow ? (
            <div className="wk-section-eyebrow">{eyebrow}</div>
          ) : null}
          <h2
            className="text-lg font-semibold tracking-tight sm:text-xl"
            style={{ color: 'var(--wk-text)' }}
          >
            {title}
          </h2>
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </div>
  );
}

function DataField({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: ReactNode;
  emphasis?: 'accent' | 'good' | 'warn';
}) {
  const valueStyle: React.CSSProperties = {};
  if (emphasis === 'accent') valueStyle.color = 'var(--wk-accent)';
  if (emphasis === 'good') valueStyle.color = 'var(--wk-good)';
  if (emphasis === 'warn') valueStyle.color = 'var(--wk-warn)';
  return (
    <div className="space-y-1.5">
      <div className="wk-data-label">{label}</div>
      <div className="wk-data-value" style={valueStyle}>
        {value}
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: ReactNode;
  accent?: 'accent' | 'sea' | 'standby' | 'yard' | 'anchor';
}) {
  const tone =
    accent === 'sea'
      ? 'var(--wk-accent)'
      : accent === 'standby'
        ? '#a855f7'
        : accent === 'yard'
          ? 'var(--wk-warn)'
          : accent === 'anchor'
            ? 'var(--wk-accent-2)'
            : 'var(--wk-text)';
  return (
    <div
      className="rounded-xl px-4 py-3"
      style={{
        backgroundColor: 'var(--wk-bg-subtle)',
        border: '1px solid var(--wk-line)',
      }}
    >
      <div className="wk-data-label">{label}</div>
      <div
        className="mt-1 text-2xl font-bold tabular-nums"
        style={{ color: tone }}
      >
        {value}
      </div>
    </div>
  );
}

function ActionRow({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-center">
      {children}
    </div>
  );
}

function PrimaryLink({
  href,
  children,
  icon,
}: {
  href: string;
  children: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <Link href={href} className="wk-btn wk-btn-primary">
      <span className="inline-flex items-center gap-2">
        {children}
        {icon ?? <ArrowRight className="h-4 w-4" />}
      </span>
    </Link>
  );
}

function GhostLink({
  href,
  children,
  icon,
}: {
  href: string;
  children: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <Link href={href} className="wk-btn wk-btn-ghost">
      <span className="inline-flex items-center gap-2">
        {icon ?? <ArrowLeft className="h-4 w-4" />}
        {children}
      </span>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Main content
// ---------------------------------------------------------------------------

function VerificationResultContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const [isLoading, setIsLoading] = useState(true);
  const [status, setStatus] = useState<VerificationStatus | null>(null);
  const [documentType, setDocumentType] = useState<DocumentType | null>(null);
  const [data, setData] = useState<VerificationData | null>(null);
  const [posData, setPosData] = useState<ProofOfServiceData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let code = searchParams.get('code');
    let typeParam = searchParams.get('type');

    if (!code && typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      code = urlParams.get('code');
      typeParam = typeParam ?? urlParams.get('type');
    }

    if (code) {
      try {
        code = decodeURIComponent(code);
      } catch (e) {
        console.warn('[VERIFY] Failed to decode code parameter:', e);
      }
    }

    if (!code) {
      router.push('/verify');
      return;
    }

    const restrictToType =
      typeParam === 'sj' || typeParam === 'pos' ? typeParam : null;

    const verifyCode = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const userInput = code
          .trim()
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, '');
        let codePart: string;
        if (userInput.startsWith('POS') && userInput.length >= 11) {
          codePart = userInput.slice(3, 11);
        } else if (userInput.startsWith('SJ') && userInput.length >= 10) {
          codePart = userInput.slice(2, 10);
        } else {
          codePart = userInput.substring(0, 8);
        }

        if (codePart.length < 8) {
          setStatus('not_found');
          setIsLoading(false);
          return;
        }

        const sjCode = `SJ-${codePart}`;
        const posCode = `POS-${codePart}`;

        const tryPos = async (): Promise<boolean> => {
          const res = await fetch(
            `/api/verify/proof-of-service?code=${encodeURIComponent(posCode)}`,
          );
          if (!res.ok) return false;
          const json = await res.json();
          if (json.found && json.record) {
            setDocumentType('proof_of_service');
            setPosData(json.record);
            setStatus('verified');
            return true;
          }
          return false;
        };

        const tryTestimonial = async () => {
          const { data: r, error: e } = await supabase
            .from('approved_testimonials')
            .select('*')
            .eq('testimonial_code', sjCode)
            .maybeSingle();
          if (e) throw e;
          return r;
        };

        const setTestimonialData = (row: VerificationData) => {
          setData({
            crew_name: row.crew_name,
            rank: row.rank,
            vessel_name: row.vessel_name,
            imo: row.imo,
            start_date: row.start_date,
            end_date: row.end_date,
            total_days: row.total_days,
            sea_days: row.sea_days,
            standby_days: row.standby_days,
            captain_name: row.captain_name,
            captain_license: row.captain_license,
            approved_at: row.approved_at,
            testimonial_code: row.testimonial_code,
            document_id: row.document_id,
          });
        };

        if (restrictToType === 'pos') {
          const posFound = await tryPos();
          if (!posFound) setStatus('not_found');
          setIsLoading(false);
          return;
        }

        if (restrictToType === 'sj') {
          let recordData = await tryTestimonial();
          if (!recordData) {
            const { data: caseInsensitiveData } = await supabase
              .from('approved_testimonials')
              .select('*')
              .ilike('testimonial_code', sjCode)
              .maybeSingle();
            recordData = caseInsensitiveData ?? undefined;
          }
          if (!recordData) {
            const { data: codeOnlyData } = await supabase
              .from('approved_testimonials')
              .select('*')
              .ilike('testimonial_code', `%${codePart}%`)
              .maybeSingle();
            recordData = codeOnlyData ?? undefined;
          }
          if (!recordData) {
            setStatus('not_found');
            setIsLoading(false);
            return;
          }
          setDocumentType('testimonial');
          let verificationStatus: VerificationStatus = 'verified';
          const { data: orig } = await supabase
            .from('testimonials')
            .select('id, status')
            .eq('id', recordData.testimonial_id)
            .maybeSingle();
          if (orig && orig.status !== 'approved') verificationStatus = 'voided';
          setStatus(verificationStatus);
          setTestimonialData(recordData);
          setIsLoading(false);
          return;
        }

        if (userInput.startsWith('POS') && userInput.length >= 11) {
          const posFound = await tryPos();
          if (posFound) {
            setIsLoading(false);
            return;
          }
          let recordData = await tryTestimonial();
          if (!recordData) {
            const { data: caseInsensitiveData } = await supabase
              .from('approved_testimonials')
              .select('*')
              .ilike('testimonial_code', sjCode)
              .maybeSingle();
            if (caseInsensitiveData) {
              setDocumentType('testimonial');
              setStatus('verified');
              setTestimonialData(caseInsensitiveData);
              setIsLoading(false);
              return;
            }
            setStatus('not_found');
            setIsLoading(false);
            return;
          }
          setDocumentType('testimonial');
          let verificationStatus: VerificationStatus = 'verified';
          const { data: orig } = await supabase
            .from('testimonials')
            .select('id, status')
            .eq('id', recordData.testimonial_id)
            .maybeSingle();
          if (orig && orig.status !== 'approved') verificationStatus = 'voided';
          setStatus(verificationStatus);
          setTestimonialData(recordData);
          setIsLoading(false);
          return;
        }

        let recordData = await tryTestimonial();

        if (!recordData) {
          const { data: caseInsensitiveData } = await supabase
            .from('approved_testimonials')
            .select('*')
            .ilike('testimonial_code', sjCode)
            .maybeSingle();
          if (caseInsensitiveData) recordData = caseInsensitiveData;
        }

        if (!recordData) {
          const { data: codeOnlyData } = await supabase
            .from('approved_testimonials')
            .select('*')
            .ilike('testimonial_code', `%${codePart}%`)
            .maybeSingle();
          if (codeOnlyData) recordData = codeOnlyData;
        }

        if (!recordData) {
          const posFound = await tryPos();
          if (posFound) {
            setIsLoading(false);
            return;
          }
          setStatus('not_found');
          setIsLoading(false);
          return;
        }

        setDocumentType('testimonial');

        let verificationStatus: VerificationStatus = 'verified';

        const { data: originalTestimonial, error: testimonialError } =
          await supabase
            .from('testimonials')
            .select('id, status')
            .eq('id', recordData.testimonial_id)
            .maybeSingle();

        if (!testimonialError && originalTestimonial) {
          if (originalTestimonial.status !== 'approved') {
            verificationStatus = 'voided';
          }
        }

        setStatus(verificationStatus);
        setTestimonialData(recordData);
      } catch (e: unknown) {
        console.error('Verification failed:', e);
        setError(
          'An error occurred while verifying the record. Please try again.',
        );
      } finally {
        setIsLoading(false);
      }
    };

    void verifyCode();
  }, [searchParams, router, supabase]);

  // -----------------------------------------------------------------------
  // Render states
  // -----------------------------------------------------------------------

  if (isLoading) {
    return (
      <WkAuthShell size="md">
        <div
          className="wk-auth-card flex flex-col items-center justify-center px-8 py-16 text-center"
          style={{ minHeight: 280 }}
        >
          <Loader2
            className="h-8 w-8 animate-spin"
            style={{ color: 'var(--wk-accent)' }}
          />
          <p
            className="mt-4 text-base font-semibold"
            style={{ color: 'var(--wk-text)' }}
          >
            Verifying record
          </p>
          <p
            className="mt-1 text-sm"
            style={{ color: 'var(--wk-text-muted)' }}
          >
            Cross-referencing the code with our verified registry…
          </p>
        </div>
      </WkAuthShell>
    );
  }

  if (error) {
    return (
      <WkAuthShell size="md">
        <div className="space-y-6">
          <StatusBanner
            tone="bad"
            icon={<XCircle className="h-5 w-5" />}
            title="Verification failed"
            description={error}
          />
          <ActionRow>
            <PrimaryLink href="/verify" icon={<Search className="h-4 w-4" />}>
              Try another code
            </PrimaryLink>
            <GhostLink href="/">Back to home</GhostLink>
          </ActionRow>
        </div>
      </WkAuthShell>
    );
  }

  if (status === 'not_found') {
    return (
      <WkAuthShell size="md">
        <div className="wk-auth-card p-8 sm:p-10">
          <div className="flex flex-col items-center text-center">
            <span className="wk-status-icon" data-tone="bad">
              <XCircle className="h-6 w-6" />
            </span>
            <h1
              className="mt-4 text-2xl font-semibold tracking-tight"
              style={{ color: 'var(--wk-text)' }}
            >
              Code <span className="wk-gradient-text">not found</span>
            </h1>
            <p
              className="mt-2 max-w-md text-sm"
              style={{ color: 'var(--wk-text-soft)' }}
            >
              We couldn't find a record matching the verification code you
              entered. Make sure you copied it exactly as it appears in the
              PDF, including the prefix.
            </p>
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <PrimaryLink href="/verify" icon={<Search className="h-4 w-4" />}>
              Try another code
            </PrimaryLink>
            <GhostLink href="/">Back to home</GhostLink>
          </div>
        </div>
      </WkAuthShell>
    );
  }

  if (status === 'voided' && data) {
    return (
      <WkAuthShell size="xl">
        <div className="space-y-5">
          <StatusBanner
            tone="warn"
            icon={<AlertTriangle className="h-5 w-5" />}
            title="This record has been voided"
            description="The original testimonial is no longer valid or has been removed by the issuing captain."
          />
          <SectionCard
            eyebrow="Voided record snapshot"
            title="Testimonial details"
            icon={<FileSignature className="h-5 w-5" />}
          >
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <DataField label="Crew member" value={data.crew_name} />
              <DataField label="Position / Rank" value={data.rank} />
              <DataField label="Vessel" value={data.vessel_name} />
              {data.imo ? (
                <DataField label="IMO number" value={data.imo} />
              ) : null}
              <DataField
                label="From"
                value={format(new Date(data.start_date), 'dd MMM yyyy')}
              />
              <DataField
                label="Until"
                value={format(new Date(data.end_date), 'dd MMM yyyy')}
              />
            </div>
          </SectionCard>
          <ActionRow>
            <PrimaryLink href="/verify" icon={<Search className="h-4 w-4" />}>
              Try another code
            </PrimaryLink>
            <GhostLink href="/">Back to home</GhostLink>
          </ActionRow>
        </div>
      </WkAuthShell>
    );
  }

  if (status === 'verified' && documentType === 'proof_of_service' && posData) {
    return (
      <WkAuthShell size="xl">
        <div className="space-y-5">
          <StatusBanner
            tone="good"
            icon={<CheckCircle2 className="h-5 w-5" />}
            title="Verified · Proof of Service"
            description={
              <>
                <code
                  className="rounded px-1 py-0.5 font-mono text-[12px] font-semibold"
                  style={{
                    backgroundColor: 'var(--wk-good-soft)',
                    color: 'var(--wk-good)',
                  }}
                >
                  {posData.verification_code}
                </code>{' '}
                matches an official Proof of Service record on SeaJourney.
              </>
            }
            rightSlot={
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider"
                style={{
                  backgroundColor: 'var(--wk-good-soft)',
                  color: 'var(--wk-good)',
                  border: '1px solid var(--wk-good-ring)',
                }}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Verified
              </span>
            }
          />

          <SectionCard
            eyebrow="Crew & vessel"
            title="Service details"
            icon={<Ship className="h-5 w-5" />}
          >
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <DataField label="Crew member" value={posData.crew_name} />
              <DataField
                label="Position"
                value={posData.crew_position ?? '—'}
              />
              <DataField
                label="Vessel"
                value={
                  posData.vessel_type
                    ? `${posData.vessel_name} (${posData.vessel_type})`
                    : posData.vessel_name
                }
              />
              {posData.vessel_imo ? (
                <DataField
                  label="IMO / Official no."
                  value={posData.vessel_imo}
                />
              ) : null}
              <DataField
                label="Service period"
                value={
                  <>
                    {format(new Date(posData.start_date), 'dd MMM yyyy')}
                    {' — '}
                    {format(new Date(posData.end_date), 'dd MMM yyyy')}
                  </>
                }
              />
              <DataField
                label="Generated"
                value={format(new Date(posData.created_at), 'dd MMM yyyy')}
              />
            </div>
          </SectionCard>

          <SectionCard
            eyebrow="Sea time breakdown"
            title="Days at sea"
            icon={<Compass className="h-5 w-5" />}
          >
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <StatTile label="Total" value={posData.total_days} />
              <StatTile
                label="At sea"
                value={posData.at_sea_days}
                accent="sea"
              />
              <StatTile
                label="Standby"
                value={posData.standby_days}
                accent="standby"
              />
              <StatTile label="Yard" value={posData.yard_days} accent="yard" />
              <StatTile
                label="At anchor"
                value={posData.leave_days}
                accent="anchor"
              />
            </div>
          </SectionCard>

          <SectionCard
            eyebrow="Issued by"
            title="Generation record"
            icon={<User className="h-5 w-5" />}
          >
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <DataField
                label="Generated by"
                value={
                  posData.generated_by_email
                    ? `${posData.generated_by_name} (${posData.generated_by_email})`
                    : posData.generated_by_name
                }
              />
              <DataField
                label="Generated at"
                value={format(new Date(posData.created_at), 'dd MMM yyyy')}
              />
            </div>
            <div className="mt-5 space-y-2">
              <div className="wk-data-label">Verification code</div>
              <code className="wk-credential">{posData.verification_code}</code>
            </div>
          </SectionCard>

          <ActionRow>
            <PrimaryLink href="/verify" icon={<Search className="h-4 w-4" />}>
              Verify another record
            </PrimaryLink>
            <GhostLink href="/">Back to home</GhostLink>
          </ActionRow>
        </div>
      </WkAuthShell>
    );
  }

  if (status === 'verified' && data) {
    return (
      <WkAuthShell size="xl">
        <div className="space-y-5">
          <StatusBanner
            tone="good"
            icon={<CheckCircle2 className="h-5 w-5" />}
            title="Verified · MCA Testimonial"
            description={
              <>
                <code
                  className="rounded px-1 py-0.5 font-mono text-[12px] font-semibold"
                  style={{
                    backgroundColor: 'var(--wk-good-soft)',
                    color: 'var(--wk-good)',
                  }}
                >
                  {data.testimonial_code}
                </code>{' '}
                matches an official record approved by{' '}
                <span style={{ color: 'var(--wk-text)' }}>
                  {data.captain_name}
                </span>
                .
              </>
            }
            rightSlot={
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider"
                style={{
                  backgroundColor: 'var(--wk-good-soft)',
                  color: 'var(--wk-good)',
                  border: '1px solid var(--wk-good-ring)',
                }}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Verified
              </span>
            }
          />

          <SectionCard
            eyebrow="Part 1"
            title="Seafarer details"
            icon={<User className="h-5 w-5" />}
          >
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <DataField label="Name" value={data.crew_name} />
              <DataField label="Position / Rank" value={data.rank} />
            </div>
          </SectionCard>

          <SectionCard
            eyebrow="Part 2"
            title="Service"
            icon={<Ship className="h-5 w-5" />}
          >
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <DataField label="Vessel name" value={data.vessel_name} />
                {data.imo ? (
                  <DataField label="IMO number" value={data.imo} />
                ) : null}
              </div>

              <div className="wk-divider" />

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <DataField
                  label="From (Onboard service)"
                  value={format(new Date(data.start_date), 'dd MMM yyyy')}
                />
                <DataField
                  label="Until"
                  value={format(new Date(data.end_date), 'dd MMM yyyy')}
                />
              </div>

              <div className="wk-divider" />

              <div>
                <div className="wk-section-eyebrow mb-3">
                  Service breakdown
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <StatTile label="Total days" value={data.total_days} />
                  <StatTile
                    label="Sea days"
                    value={data.sea_days}
                    accent="sea"
                  />
                  <StatTile
                    label="Standby days"
                    value={data.standby_days}
                    accent="standby"
                  />
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            eyebrow="Part 3"
            title="Declaration by Master"
            icon={<FileSignature className="h-5 w-5" />}
          >
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <DataField label="Captain name" value={data.captain_name} />
              {data.captain_license ? (
                <DataField
                  label="License / Certification"
                  value={data.captain_license}
                />
              ) : null}
              <DataField
                label="Approved"
                value={
                  <span className="inline-flex items-center gap-2">
                    <Calendar className="h-4 w-4 opacity-70" />
                    {format(
                      new Date(data.approved_at),
                      "dd MMM yyyy 'at' HH:mm",
                    )}
                  </span>
                }
              />
            </div>
          </SectionCard>

          <SectionCard
            eyebrow="Document"
            title="Verification details"
            icon={<ClipboardCheck className="h-5 w-5" />}
          >
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <div className="wk-data-label">Testimonial code</div>
                <code className="wk-credential">{data.testimonial_code}</code>
              </div>
              <div className="space-y-2">
                <div className="wk-data-label">Document ID</div>
                <code
                  className="wk-credential"
                  style={{
                    color: 'var(--wk-text-muted)',
                    borderStyle: 'solid',
                    borderColor: 'var(--wk-line)',
                    backgroundColor: 'var(--wk-bg-subtle)',
                  }}
                >
                  {data.document_id}
                </code>
              </div>
            </div>

            <div
              className="mt-5 rounded-xl p-4 text-sm"
              style={{
                backgroundColor: 'var(--wk-accent-soft)',
                border: '1px solid var(--wk-accent-ring)',
                color: 'var(--wk-text-soft)',
              }}
            >
              <strong style={{ color: 'var(--wk-accent)' }}>
                Verification note ·
              </strong>{' '}
              This record matches the official testimonial document. Officials
              can cross-reference the code above with the code in the PDF
              footer to confirm authenticity.
            </div>
          </SectionCard>

          <ActionRow>
            <PrimaryLink href="/verify" icon={<Search className="h-4 w-4" />}>
              Verify another record
            </PrimaryLink>
            <GhostLink href="/">Back to home</GhostLink>
          </ActionRow>
        </div>
      </WkAuthShell>
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// Suspense wrapper
// ---------------------------------------------------------------------------

export default function VerificationResultPage() {
  return (
    <Suspense
      fallback={
        <WkAuthShell size="md">
          <div
            className="wk-auth-card flex flex-col items-center justify-center px-8 py-16 text-center"
            style={{ minHeight: 280 }}
          >
            <Loader2
              className="h-8 w-8 animate-spin"
              style={{ color: 'var(--wk-accent)' }}
            />
            <p
              className="mt-4 text-base font-semibold"
              style={{ color: 'var(--wk-text)' }}
            >
              Loading
            </p>
          </div>
        </WkAuthShell>
      }
    >
      <VerificationResultContent />
    </Suspense>
  );
}
