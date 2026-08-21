'use client';

import Link from 'next/link';
import {
  Users,
  Shield,
  CheckCircle2,
  BarChart3,
  UserCheck,
  Clock,
  Ship,
  ArrowRight,
  Anchor,
  Route,
  Database,
  MapPin,
  Calendar,
  Zap,
  FileText,
  Sparkles,
} from 'lucide-react';
import { WkPageShell, WkPageHero } from '@/components/wk/wk-page-shell';

const CREW_FEATURES = [
  {
    Icon: Users,
    title: 'Crew management',
    description:
      'View and manage all crew members in one centralised dashboard. Search by name, email, or username.',
    color: '#0ea5e9',
  },
  {
    Icon: CheckCircle2,
    title: 'Onboard status',
    description:
      'Track which crew members are currently onboard or offboard at a glance. Monitor crew presence in real time.',
    color: '#16a34a',
  },
  {
    Icon: BarChart3,
    title: 'Activity overview',
    description:
      'Track crew activity, sea time logs, and engagement to understand how your team uses the platform.',
    color: '#8b5cf6',
  },
  {
    Icon: UserCheck,
    title: 'Profile management',
    description:
      'Access crew member profiles, assign them to vessels, and manage their permissions.',
    color: '#f59e0b',
  },
  {
    Icon: Clock,
    title: 'Sea time tracking',
    description:
      'Real-time view of every crew member\'s sea time logs and certifications.',
    color: '#06b6d4',
  },
  {
    Icon: Shield,
    title: 'Captain sign-off',
    description:
      'Captains can approve testimonials and sign off sea time records directly from the dashboard.',
    color: '#3b82f6',
  },
];

const AIS_FEATURES = [
  {
    Icon: Route,
    title: 'Past passages',
    description:
      'Import complete passage history including departure / arrival ports, dates, and routes from AIS data.',
    color: '#0ea5e9',
  },
  {
    Icon: Ship,
    title: 'Vessel state history',
    description:
      'Automatically populate vessel state logs (underway, at anchor, moored) since vessel launch.',
    color: '#8b5cf6',
  },
  {
    Icon: Database,
    title: 'Historical data',
    description:
      'Backfill years of operational data instantly — no manual entry required.',
    color: '#16a34a',
  },
  {
    Icon: MapPin,
    title: 'Port logs',
    description:
      'Detailed records of every port visit, with timestamps and durations.',
    color: '#f59e0b',
  },
  {
    Icon: Calendar,
    title: 'Operational timeline',
    description:
      'A complete chronological view of vessel activity, ready to share with crew, owners or insurers.',
    color: '#06b6d4',
  },
  {
    Icon: Zap,
    title: 'Instant import',
    description:
      'One-click ingestion of AIS feeds — no spreadsheets, no manual reconciliation.',
    color: '#0d9488',
  },
];

function FeatureCard({
  Icon,
  title,
  description,
  color,
}: {
  Icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  color: string;
}) {
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
      <span
        className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl transition-transform group-hover:scale-105"
        style={{
          backgroundColor: soft,
          color,
          border: `1px solid ${ring}`,
        }}
      >
        <Icon className="h-6 w-6" />
      </span>
      <h3
        className="text-lg font-bold tracking-tight"
        style={{ color: 'var(--wk-text)' }}
      >
        {title}
      </h3>
      <p
        className="mt-2 text-sm leading-relaxed"
        style={{ color: 'var(--wk-text-soft)' }}
      >
        {description}
      </p>
    </div>
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
            Built for vessels,{' '}
            <span className="wk-gradient-text">captains and operators</span>
          </>
        }
        description="A single command centre for crew, sea time, and operations — with verifiable testimonials and effortless AIS history import."
      />

      {/* Headline stats */}
      <section className="pb-14">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-5xl grid-cols-1 gap-4 md:grid-cols-3">
            {[
              { value: '1', label: 'Centralised dashboard' },
              { value: 'Real-time', label: 'Crew & onboard status' },
              { value: 'Tamper-proof', label: 'Verifiable testimonials' },
            ].map((s, i) => (
              <div
                key={i}
                className="rounded-2xl p-6 text-center"
                style={{
                  backgroundColor: 'var(--wk-card)',
                  border: '1px solid var(--wk-line)',
                  boxShadow: 'var(--wk-shadow-md)',
                }}
              >
                <div
                  className="text-3xl font-bold"
                  style={{ color: 'var(--wk-accent)' }}
                >
                  {s.value}
                </div>
                <div
                  className="mt-1 text-xs font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--wk-text-muted)' }}
                >
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Crew dashboard */}
      <section className="pb-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <div className="mb-10 max-w-3xl">
              <span className="wk-chip">Crew dashboard</span>
              <h2
                className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl"
                style={{ color: 'var(--wk-text)' }}
              >
                Manage your <span className="wk-gradient-text">entire crew</span> from one place
              </h2>
              <p
                className="mt-3 text-base leading-relaxed sm:text-lg"
                style={{ color: 'var(--wk-text-soft)' }}
              >
                Onboarding, sign-offs, sea time, certifications — all in a
                single, real-time view designed for captains and crew managers.
              </p>
            </div>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {CREW_FEATURES.map((f, i) => (
                <FeatureCard key={i} {...f} />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* AIS import */}
      <section className="pb-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <div className="mb-10 max-w-3xl">
              <span className="wk-chip">AIS import</span>
              <h2
                className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl"
                style={{ color: 'var(--wk-text)' }}
              >
                Backfill years of vessel history{' '}
                <span className="wk-gradient-text">in one click</span>
              </h2>
              <p
                className="mt-3 text-base leading-relaxed sm:text-lg"
                style={{ color: 'var(--wk-text-soft)' }}
              >
                Connect your vessel's AIS feed and SeaJourney will populate
                passages, port calls and operational state automatically — no
                spreadsheets, no manual entry.
              </p>
            </div>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {AIS_FEATURES.map((f, i) => (
                <FeatureCard key={i} {...f} />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Why it matters */}
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
                  text: 'Replace email-based testimonials and manual sea time spreadsheets with a single signed digital record.',
                },
                {
                  Icon: Shield,
                  title: 'Trusted by authorities',
                  text: 'Every sign-off includes a tamper-proof verification code that the MCA and recruiters can verify instantly.',
                },
                {
                  Icon: FileText,
                  title: 'Audit-ready exports',
                  text: 'Export complete crew records and vessel histories as professional PDFs whenever you need them.',
                },
              ].map((b, i) => (
                <div key={i}>
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
                  <h3
                    className="mt-4 text-lg font-bold"
                    style={{ color: 'var(--wk-text)' }}
                  >
                    {b.title}
                  </h3>
                  <p
                    className="mt-2 text-sm leading-relaxed"
                    style={{ color: 'var(--wk-text-soft)' }}
                  >
                    {b.text}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
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
            <h3
              className="mt-5 text-3xl font-bold tracking-tight"
              style={{ color: 'var(--wk-text)' }}
            >
              Ready to bring your vessel onboard?
            </h3>
            <p
              className="mx-auto mt-3 max-w-2xl text-base"
              style={{ color: 'var(--wk-text-soft)' }}
            >
              Register your vessel in minutes and start tracking your crew, sea
              time, and testimonials with a single platform.
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
          </div>
        </div>
      </section>
    </WkPageShell>
  );
}
