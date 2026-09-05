'use client';

import Link from 'next/link';
import {
  Anchor,
  ArrowRight,
  BarChart3,
  BookOpen,
  CheckCircle2,
  Clock,
  Database,
  FileSignature,
  FileText,
  Layers,
  Link2,
  MapPin,
  Navigation,
  Radar,
  RefreshCw,
  Route,
  Shield,
  Ship,
  Sparkles,
  UserCog,
  Users,
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
  { value: 'Linked roles', label: 'Captain, officer, engineer & manager accounts' },
  { value: 'AIS-powered', label: 'History import & live vessel tracking' },
  { value: 'Audit-ready', label: 'Passage logs, exports & verification codes' },
];

const LINKED_ACCOUNT_FEATURES: Feature[] = [
  {
    Icon: Link2,
    title: 'Linked team accounts',
    description:
      'Create captain, officer, engineer, and manager logins tied to your vessel. Each role gets its own dashboard with permissions you control.',
    color: '#0ea5e9',
    tier: 'Vessel Professional+',
  },
  {
    Icon: UserCog,
    title: 'Granular feature access',
    description:
      'Choose what linked accounts can use — passage logbook, passages map, export reports, testimonials, bridge watch, and more.',
    color: '#6366f1',
    tier: 'Vessel Professional+',
  },
  {
    Icon: Shield,
    title: 'Vessel-paid seats',
    description:
      'Secondary accounts sit on your vessel plan instead of personal crew subscriptions — one bill, one place to manage the team.',
    color: '#16a34a',
    tier: 'Vessel Professional+',
  },
];

const OPERATIONS_FEATURES: Feature[] = [
  {
    Icon: BookOpen,
    title: 'Passage logbook',
    description:
      'Record departures, arrivals, distance, weather, and notes for every passage. Promote AIS tracks straight into the logbook.',
    color: '#0ea5e9',
    tier: 'Vessel Premium+',
  },
  {
    Icon: Route,
    title: 'Passage tracks map',
    description:
      'Visualise every passage on an interactive map — historical AIS backfill, live position, and scrub through voyages over time.',
    color: '#8b5cf6',
    tier: 'Vessel Premium+',
  },
  {
    Icon: Navigation,
    title: 'Bridge watch log',
    description:
      'Officers log watches from the dashboard. Captains and vessel managers review entries in one chronological record.',
    color: '#06b6d4',
    tier: 'Vessel Premium+',
  },
  {
    Icon: Clock,
    title: 'Nav watch schedule',
    description:
      'Build and publish watch rotas for the crew. Linked officers see their roster; captains approve and adjust.',
    color: '#f59e0b',
    tier: 'Vessel Premium+',
  },
  {
    Icon: RefreshCw,
    title: 'Onboard crew tracker',
    description:
      'See who is on board, who is on leave, and crew rotation status at a glance — no separate spreadsheet.',
    color: '#14b8a6',
    tier: 'Vessel Premium+',
  },
  {
    Icon: MapPin,
    title: 'Daily state logs',
    description:
      'Underway, at anchor, moored, in yard, on leave — the whole crew logs vessel state daily with a shared calendar view.',
    color: '#3b82f6',
  },
];

const AIS_FEATURES: Feature[] = [
  {
    Icon: Database,
    title: 'AIS history import',
    description:
      'Backfill months or years of operational history from AIS — states, port calls, and passages without manual data entry.',
    color: '#0ea5e9',
    tier: 'Vessel Premium+',
  },
  {
    Icon: Radar,
    title: 'Live AIS tracking',
    description:
      'Enable live position sampling for your vessel. See current state on the map and keep crew daily logs aligned with reality.',
    color: '#8b5cf6',
    tier: 'Vessel Premium+',
  },
  {
    Icon: Ship,
    title: 'Vessel state history',
    description:
      'Automatically derive underway, at anchor, and moored states from AIS movement — ready for audits and insurer requests.',
    color: '#16a34a',
    tier: 'Vessel Premium+',
  },
  {
    Icon: Zap,
    title: 'One-click reconciliation',
    description:
      'Review AIS suggestions against existing logs, resolve conflicts, and import only what you need.',
    color: '#0d9488',
    tier: 'Vessel Premium+',
  },
];

const CREW_FEATURES: Feature[] = [
  {
    Icon: Users,
    title: 'Crew management',
    description:
      'Invite crew, manage assignments, and see every member\'s sea time, certificates, and activity in one dashboard.',
    color: '#0ea5e9',
  },
  {
    Icon: CheckCircle2,
    title: 'Onboard status',
    description:
      'Track who is currently on board or ashore. Monitor presence and assignment dates in real time.',
    color: '#16a34a',
  },
  {
    Icon: FileSignature,
    title: 'Captain sign-off',
    description:
      'Captains approve testimonials and sea time records digitally — tamper-proof verification codes included.',
    color: '#3b82f6',
  },
  {
    Icon: BarChart3,
    title: 'Crew analytics',
    description:
      'Understand how your team uses the platform — engagement, logging consistency, and certification progress.',
    color: '#8b5cf6',
    tier: 'Vessel Premium+',
  },
  {
    Icon: FileText,
    title: 'Export reports',
    description:
      'Pull sea time, state logs, and passage data as CSV, Excel, or PDF whenever owners, managers, or auditors ask.',
    color: '#f59e0b',
    tier: 'Vessel Premium+',
  },
  {
    Icon: Layers,
    title: 'Document generator',
    description:
      'Generate vessel documents from templates, issue them to crew, and keep a searchable archive with verification codes.',
    color: '#6366f1',
    tier: 'Vessel Premium+',
  },
];

const PLANS = [
  {
    name: 'Vessel Standard',
    slug: 'vessel_lite',
    summary: 'Core crew logging and vessel management for smaller yachts.',
    highlights: ['Crew invites & assignments', 'Daily state calendar', 'Testimonial workflows'],
  },
  {
    name: 'Vessel Premium',
    slug: 'vessel_basic',
    summary: 'AIS history, passage tools, and Premium management features.',
    highlights: [
      'Passage logbook & tracks map',
      'AIS history import & live tracking',
      'Watch schedules & bridge watch',
    ],
    featured: true,
  },
  {
    name: 'Vessel Professional',
    slug: 'vessel_pro',
    summary: 'Linked team accounts and full operational toolkit for larger programs.',
    highlights: [
      'Linked captain / officer / engineer accounts',
      'Onboard crew tracker & document generator',
      'Priority AIS & passage map capacity',
    ],
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
  chip,
  title,
  titleAccent,
  description,
  features,
}: {
  chip: string;
  title: string;
  titleAccent: string;
  description: string;
  features: Feature[];
}) {
  return (
    <section className="pb-16">
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

export default function ForVesselsPage() {
  return (
    <WkPageShell>
      <WkPageHero
        eyebrow="For vessels"
        icon={<Anchor className="h-7 w-7" />}
        title={
          <>
            One platform for your yacht,{' '}
            <span className="wk-gradient-text">crew & operations</span>
          </>
        }
        description="Linked team accounts, passage logbook, AIS-powered tracks, watch schedules, and verifiable documents — built for captains, managers, and fleet operators."
      />

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
        chip="Team accounts"
        title="Linked roles for your"
        titleAccent="bridge team"
        description="On Vessel Professional, create dedicated logins for captains, officers, engineers, and managers — each with the features you choose to grant."
        features={LINKED_ACCOUNT_FEATURES}
      />

      <FeatureSection
        chip="Passages & watches"
        title="Logbook, tracks &"
        titleAccent="watchkeeping"
        description="From passage records to interactive AIS maps and nav watch rotas — everything your operational team needs on Vessel Premium and above."
        features={OPERATIONS_FEATURES}
      />

      <FeatureSection
        chip="AIS & tracking"
        title="Backfill history &"
        titleAccent="track live"
        description="Import years of AIS data in minutes, keep daily states accurate, and monitor your vessel's position without spreadsheets or third-party tools."
        features={AIS_FEATURES}
      />

      <FeatureSection
        chip="Crew & compliance"
        title="Manage crew &"
        titleAccent="stay audit-ready"
        description="Invite crew, sign off testimonials, export professional reports, and generate vessel documents — all from the same dashboard."
        features={CREW_FEATURES}
      />

      <section className="pb-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <div className="mb-10 max-w-3xl">
              <span className="wk-chip">Plans</span>
              <h2
                className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl"
                style={{ color: 'var(--wk-text)' }}
              >
                Choose the right{' '}
                <span className="wk-gradient-text">vessel plan</span>
              </h2>
              <p
                className="mt-3 text-base leading-relaxed sm:text-lg"
                style={{ color: 'var(--wk-text-soft)' }}
              >
                Start with Standard for core crew logging, step up to Premium for AIS
                and passage tools, or Professional for linked team accounts.
              </p>
            </div>
            <div className="grid gap-5 lg:grid-cols-3">
              {PLANS.map((plan) => (
                <div
                  key={plan.slug}
                  className="flex h-full flex-col rounded-2xl p-6 sm:p-8"
                  style={{
                    backgroundColor: 'var(--wk-card)',
                    border: plan.featured
                      ? '1px solid var(--wk-accent-ring)'
                      : '1px solid var(--wk-line)',
                    boxShadow: plan.featured ? 'var(--wk-glow)' : 'var(--wk-shadow-md)',
                  }}
                >
                  {plan.featured ? (
                    <span className="wk-chip mb-4 w-fit">Most popular</span>
                  ) : (
                    <span className="mb-4 h-6" aria-hidden />
                  )}
                  <h3 className="text-xl font-bold" style={{ color: 'var(--wk-text)' }}>
                    {plan.name}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--wk-text-soft)' }}>
                    {plan.summary}
                  </p>
                  <ul className="mt-5 flex-1 space-y-2.5">
                    {plan.highlights.map((item) => (
                      <li
                        key={item}
                        className="flex items-start gap-2 text-sm"
                        style={{ color: 'var(--wk-text-soft)' }}
                      >
                        <CheckCircle2
                          className="mt-0.5 h-4 w-4 shrink-0"
                          style={{ color: 'var(--wk-good)' }}
                        />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <p className="mt-6 text-center text-sm" style={{ color: 'var(--wk-text-muted)' }}>
              Crew on your vessel can inherit Premium or Professional features while
              actively assigned — without each member needing their own paid plan.
            </p>
          </div>
        </div>
      </section>

      <section className="pb-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div
            className="mx-auto max-w-5xl rounded-3xl p-8 sm:p-12"
            style={{
              backgroundColor: 'var(--wk-card)',
              border: '1px solid var(--wk-line)',
              boxShadow: 'var(--wk-shadow-lg)',
            }}
          >
            <div className="grid gap-10 md:grid-cols-3">
              {[
                {
                  Icon: Sparkles,
                  title: 'Less paperwork',
                  text: 'Replace email testimonials and manual sea time spreadsheets with signed digital records.',
                },
                {
                  Icon: Shield,
                  title: 'Trusted verification',
                  text: 'Every sign-off and issued document includes a verification code recruiters and authorities can check.',
                },
                {
                  Icon: FileText,
                  title: 'Owner-ready exports',
                  text: 'Export complete crew and vessel histories as professional PDFs whenever you need them.',
                },
              ].map((b) => (
                <div key={b.title}>
                  <span
                    className="inline-flex h-11 w-11 items-center justify-center rounded-xl"
                    style={{
                      backgroundColor: 'var(--wk-accent-soft)',
                      color: 'var(--wk-accent)',
                      border: '1px solid var(--wk-accent-ring)',
                    }}
                  >
                    <b.Icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-4 text-lg font-bold" style={{ color: 'var(--wk-text)' }}>
                    {b.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--wk-text-soft)' }}>
                    {b.text}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

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
            <span
              className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl"
              style={{
                backgroundColor: 'var(--wk-accent-soft)',
                color: 'var(--wk-accent)',
                border: '1px solid var(--wk-accent-ring)',
              }}
            >
              <Anchor className="h-7 w-7" />
            </span>
            <h3 className="mt-5 text-3xl font-bold tracking-tight" style={{ color: 'var(--wk-text)' }}>
              Ready to bring your vessel onboard?
            </h3>
            <p
              className="mx-auto mt-3 max-w-2xl text-base"
              style={{ color: 'var(--wk-text-soft)' }}
            >
              Register in minutes, link your yacht, invite crew, and start logging
              passages with AIS-backed accuracy.
            </p>
            <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="/signup/vessel" className="wk-btn wk-btn-primary">
                Register a vessel
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/request-demo" className="wk-btn wk-btn-ghost">
                Request a demo
              </Link>
              <Link href="/offers" className="wk-btn wk-btn-ghost">
                See plans
              </Link>
            </div>
            <p className="mt-6 text-sm" style={{ color: 'var(--wk-text-muted)' }}>
              Looking for individual crew features?{' '}
              <Link href="/" className="font-medium underline-offset-2 hover:underline" style={{ color: 'var(--wk-accent)' }}>
                View the crew landing page
              </Link>
            </p>
          </div>
        </div>
      </section>
    </WkPageShell>
  );
}
