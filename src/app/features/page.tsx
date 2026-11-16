'use client';

import Link from 'next/link';
import {
  Anchor,
  ArrowRight,
  Award,
  BarChart3,
  Bell,
  BookOpen,
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Database,
  FileSignature,
  FileText,
  Layers,
  LayoutGrid,
  Link2,
  MapPin,
  Navigation,
  Radar,
  Route,
  ScanSearch,
  Shield,
  ShieldCheck,
  Ship,
  Smartphone,
  Sparkles,
  Users,
  Watch as WatchIcon,
  Waves,
  Zap,
} from 'lucide-react';
import { WkPageShell, WkPageHero } from '@/components/wk/wk-page-shell';

type Feature = {
  Icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  color: string;
  tier?: string;
};

const HIGHLIGHTS = [
  { value: 'Sea service', label: 'Daily logs, calendars & MCA-ready totals' },
  { value: 'AIS-backed', label: 'History import, live tracks & vessel states' },
  { value: 'Audit-ready', label: 'Sign-offs, verification codes & exports' },
];

const SEA_SERVICE_FEATURES: Feature[] = [
  {
    Icon: Calendar,
    title: 'Daily state calendar',
    description:
      'Log underway, at anchor, moored, in yard, or on leave — on iPhone or web — with a clear year and month view of your sea service.',
    color: '#0ea5e9',
  },
  {
    Icon: Waves,
    title: 'MCA-style sea time totals',
    description:
      'See underway and at-anchor days roll up automatically so applications and audits start from accurate numbers, not rebuilt spreadsheets.',
    color: '#3b82f6',
  },
  {
    Icon: Smartphone,
    title: 'Log anywhere, sync everywhere',
    description:
      'Capture days on mobile even when offline, then manage sign-offs, exports, and career paperwork on the web from the same record.',
    color: '#8b5cf6',
  },
  {
    Icon: Ship,
    title: 'Multi-vessel history',
    description:
      'Keep every assignment and past vessel in one timeline so your sea service story stays complete when you move programmes.',
    color: '#14b8a6',
  },
  {
    Icon: Clock,
    title: 'Range & period summaries',
    description:
      'Select date ranges on crew and vessel calendars to total sea time for a season, contract, or application window.',
    color: '#06b6d4',
  },
  {
    Icon: LayoutGrid,
    title: 'Crew year calendar',
    description:
      'Vessel managers compare the vessel log with every crew member across 365 days — including leave that stays visible on personal rows.',
    color: '#6366f1',
    tier: 'Vessel',
  },
];

const DOCUMENTS_FEATURES: Feature[] = [
  {
    Icon: FileSignature,
    title: 'Digital testimonials',
    description:
      'Request captain or officer sign-off digitally. Signed records stay linked to your sea time with verification codes.',
    color: '#0ea5e9',
  },
  {
    Icon: ScanSearch,
    title: 'AI document scanner',
    description:
      'Drop a PDF or image and map fields from your profile, vessel data, and calculated sea time — then verify the overlay before saving.',
    color: '#8b5cf6',
    tier: 'Beta',
  },
  {
    Icon: FileText,
    title: 'Official MCA forms',
    description:
      'Generate Watch Rating (MSF 4371), OOW (MSF 4370), and sea service testimonials pre-filled from your SeaJourney record.',
    color: '#16a34a',
  },
  {
    Icon: Award,
    title: 'Certificates & compliance',
    description:
      'Track ticket expiry, renewal dates, and compliance status so you know what is current before the next application.',
    color: '#f59e0b',
  },
  {
    Icon: ClipboardCheck,
    title: 'Apply — next ticket',
    description:
      'See clear requirements, live progress, and the next ticket to focus on — then package evidence when you are ready to submit.',
    color: '#3b82f6',
  },
  {
    Icon: Layers,
    title: 'Vessel document generator',
    description:
      'Issue vessel documents from templates, share them with crew, and keep a searchable archive with verification codes.',
    color: '#6366f1',
    tier: 'Vessel Premium+',
  },
];

const AIS_FEATURES: Feature[] = [
  {
    Icon: Database,
    title: 'AIS history import',
    description:
      'Backfill months or years of operational history — daily states, port calls, and passages — without manual entry.',
    color: '#0ea5e9',
    tier: 'Vessel Premium+',
  },
  {
    Icon: Radar,
    title: 'Live AIS tracking',
    description:
      'Sample live position for your vessel, keep daily states aligned with reality, and surface movement on the map.',
    color: '#8b5cf6',
    tier: 'Vessel Premium+',
  },
  {
    Icon: Route,
    title: 'Passage tracks map',
    description:
      'Visualise seasons of passages on one chart — scrub history, review port-to-port stories, and open the public voyage map demo.',
    color: '#06b6d4',
    tier: 'Vessel Premium+',
  },
  {
    Icon: BookOpen,
    title: 'Passage logbook',
    description:
      'Record departures, arrivals, distance, weather, and notes. Promote AIS tracks straight into documentary logbook entries.',
    color: '#14b8a6',
    tier: 'Vessel Premium+',
  },
  {
    Icon: Zap,
    title: 'State reconciliation',
    description:
      'Review AIS suggestions against existing logs, resolve conflicts, and import only the days you approve.',
    color: '#0d9488',
    tier: 'Vessel Premium+',
  },
  {
    Icon: MapPin,
    title: 'Mobile live position',
    description:
      'Crew see live position, port context, and speed cues on mobile so sea time stays tied to what the vessel is doing.',
    color: '#3b82f6',
    tier: 'Vessel Premium+',
  },
];

const OPERATIONS_FEATURES: Feature[] = [
  {
    Icon: Navigation,
    title: 'Bridge watch log',
    description:
      'Officers log watches from the dashboard. Captains and managers review a single chronological bridge record.',
    color: '#06b6d4',
    tier: 'Vessel Premium+',
  },
  {
    Icon: WatchIcon,
    title: 'Nav watch schedule',
    description:
      'Build and publish watch rotas. Linked officers see their roster; captains approve and adjust as the programme changes.',
    color: '#f59e0b',
    tier: 'Vessel Premium+',
  },
  {
    Icon: Users,
    title: 'Crew leave planner',
    description:
      'Leave requests, conflict checks, captain approvals, and notifications — without a separate crew spreadsheet.',
    color: '#14b8a6',
    tier: 'Vessel',
  },
  {
    Icon: Anchor,
    title: 'Onboard crew tracker',
    description:
      'See who is on board, who is ashore, and rotation status at a glance across the active vessel programme.',
    color: '#0ea5e9',
    tier: 'Vessel Premium+',
  },
  {
    Icon: Bell,
    title: 'Visa tracker',
    description:
      'Multi-country visa reminders and compliance cues so travel windows do not sneak up mid-season.',
    color: '#ef4444',
  },
  {
    Icon: Link2,
    title: 'Linked team accounts',
    description:
      'Captain, officer, engineer, and manager logins tied to the vessel — with feature access you control on Professional plans.',
    color: '#6366f1',
    tier: 'Vessel Professional+',
  },
];

const VERIFY_FEATURES: Feature[] = [
  {
    Icon: ShieldCheck,
    title: 'Public verification',
    description:
      'Anyone with a verification code can confirm a testimonial or document — no SeaJourney account required.',
    color: '#16a34a',
  },
  {
    Icon: Shield,
    title: 'Tamper-resistant records',
    description:
      'Signed sea service and issued documents stay tied to verification codes recruiters and authorities can check.',
    color: '#0ea5e9',
  },
  {
    Icon: BarChart3,
    title: 'Exports & reports',
    description:
      'Pull sea time, state logs, and passage data as CSV, Excel, or professional PDFs when owners or auditors ask.',
    color: '#f59e0b',
    tier: 'Premium+',
  },
  {
    Icon: Sparkles,
    title: 'Career progress',
    description:
      'Track milestones, certificates, and application readiness so the next ticket is always clear.',
    color: '#8b5cf6',
  },
];

function FeatureCard({ Icon, title, description, color, tier }: Feature) {
  const ring = `color-mix(in srgb, ${color} 30%, transparent)`;
  const soft = `color-mix(in srgb, ${color} 12%, transparent)`;
  return (
    <div
      className="group flex h-full flex-col rounded-2xl p-6 transition-all hover:-translate-y-0.5"
      style={{
        backgroundColor: 'var(--wk-card)',
        border: '1px solid var(--wk-line)',
        boxShadow: 'var(--wk-shadow-md)',
      }}
    >
      <div className="mb-4 flex items-start justify-between gap-2">
        <span
          className="inline-flex h-12 w-12 flex-none items-center justify-center rounded-xl transition-transform group-hover:scale-105"
          style={{
            backgroundColor: soft,
            color,
            border: `1px solid ${ring}`,
          }}
        >
          <Icon className="h-6 w-6" />
        </span>
        {tier ? (
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
            style={{
              backgroundColor: 'var(--wk-accent-soft)',
              color: 'var(--wk-accent)',
              border: '1px solid var(--wk-accent-ring)',
            }}
          >
            {tier}
          </span>
        ) : null}
      </div>
      <h3 className="text-lg font-bold tracking-tight" style={{ color: 'var(--wk-text)' }}>
        {title}
      </h3>
      <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--wk-text-soft)' }}>
        {description}
      </p>
    </div>
  );
}

function FeatureSection({
  id,
  chip,
  title,
  titleAccent,
  description,
  features,
}: {
  id: string;
  chip: string;
  title: string;
  titleAccent: string;
  description: string;
  features: Feature[];
}) {
  return (
    <section id={id} className="scroll-mt-24 pb-16">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="mb-10 max-w-3xl">
            <span className="wk-chip">{chip}</span>
            <h2
              className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl"
              style={{ color: 'var(--wk-text)' }}
            >
              {title}{' '}
              <span className="wk-gradient-text">{titleAccent}</span>
            </h2>
            <p
              className="mt-3 text-base leading-relaxed sm:text-lg"
              style={{ color: 'var(--wk-text-soft)' }}
            >
              {description}
            </p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <FeatureCard key={f.title} {...f} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

const JUMP_LINKS = [
  { href: '#sea-service', label: 'Sea service' },
  { href: '#documents', label: 'Documents' },
  { href: '#ais', label: 'AIS & passages' },
  { href: '#operations', label: 'Ops & crew' },
  { href: '#verify', label: 'Verify & export' },
];

export default function FeaturesPage() {
  return (
    <WkPageShell>
      <WkPageHero
        eyebrow="All features"
        icon={<LayoutGrid className="h-7 w-7" />}
        title={
          <>
            Everything SeaJourney offers for{' '}
            <span className="wk-gradient-text">crew & vessels</span>
          </>
        }
        description="Sea service logging, digital sign-offs, AIS history, passage tools, certificates, and verification — the full product surface in one place."
      />

      <section className="pb-10">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2">
            {JUMP_LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="rounded-full px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-80"
                style={{
                  backgroundColor: 'var(--wk-bg-raised)',
                  color: 'var(--wk-text-soft)',
                  border: '1px solid var(--wk-line)',
                }}
              >
                {l.label}
              </a>
            ))}
          </div>
        </div>
      </section>

      <section className="pb-14">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-5xl grid-cols-1 gap-4 md:grid-cols-3">
            {HIGHLIGHTS.map((s) => (
              <div
                key={s.label}
                className="rounded-2xl p-6 text-center"
                style={{
                  backgroundColor: 'var(--wk-card)',
                  border: '1px solid var(--wk-line)',
                  boxShadow: 'var(--wk-shadow-md)',
                }}
              >
                <div className="text-xl font-bold sm:text-2xl" style={{ color: 'var(--wk-accent)' }}>
                  {s.value}
                </div>
                <div
                  className="mt-2 text-xs font-semibold uppercase tracking-wider leading-snug"
                  style={{ color: 'var(--wk-text-muted)' }}
                >
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <FeatureSection
        id="sea-service"
        chip="Core logging"
        title="Track sea service"
        titleAccent="without spreadsheets"
        description="Daily states, calendars, and totals built for yacht crew — with vessel managers able to see the whole programme year at a glance."
        features={SEA_SERVICE_FEATURES}
      />

      <FeatureSection
        id="documents"
        chip="Paperwork"
        title="Forms, certificates &"
        titleAccent="sign-offs"
        description="From digital testimonials to MCA application packs and certificate tracking — keep evidence ready for the next ticket."
        features={DOCUMENTS_FEATURES}
      />

      <FeatureSection
        id="ais"
        chip="AIS & passages"
        title="Backfill history &"
        titleAccent="map every passage"
        description="Import AIS history, track live, and turn movement into passage logs and charts your owners and auditors can trust."
        features={AIS_FEATURES}
      />

      <FeatureSection
        id="operations"
        chip="Vessel operations"
        title="Watches, leave &"
        titleAccent="team accounts"
        description="Bridge watches, rotas, leave, visas, and linked roles — operational tools that sit beside the sea service record."
        features={OPERATIONS_FEATURES}
      />

      <FeatureSection
        id="verify"
        chip="Trust"
        title="Verify, export &"
        titleAccent="prove your record"
        description="Public verification codes, professional exports, and career progress so proof is always one click away."
        features={VERIFY_FEATURES}
      />

      <section className="pb-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div
            className="mx-auto max-w-4xl overflow-hidden rounded-3xl p-10 text-center sm:p-14"
            style={{
              background:
                'linear-gradient(135deg, var(--wk-accent-soft) 0%, transparent 50%, var(--wk-accent-2-soft) 100%)',
              border: '1px solid var(--wk-accent-ring)',
              boxShadow: 'var(--wk-shadow-lg)',
            }}
          >
            <h3 className="text-3xl font-bold tracking-tight" style={{ color: 'var(--wk-text)' }}>
              Ready to start logging?
            </h3>
            <p
              className="mx-auto mt-3 max-w-2xl text-base"
              style={{ color: 'var(--wk-text-soft)' }}
            >
              Create a free crew account, register a vessel, or book a demo for your programme.
            </p>
            <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="/signup" className="wk-btn wk-btn-primary">
                Start free
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/for-vessels" className="wk-btn wk-btn-ghost">
                For vessels
              </Link>
              <Link href="/offers" className="wk-btn wk-btn-ghost">
                See plans
              </Link>
            </div>
          </div>
        </div>
      </section>
    </WkPageShell>
  );
}
