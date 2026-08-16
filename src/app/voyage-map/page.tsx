'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  Anchor,
  ArrowRight,
  CalendarRange,
  MapPinned,
  Route,
  Ship,
  Sparkles,
  Waves,
} from 'lucide-react';
import { WkPageShell, WkPageHero } from '@/components/wk/wk-page-shell';
import { DEMO_PASSAGE_STATS } from '@/data/demo-passage-tracks';

const VoyageMapCanvas = dynamic(
  () =>
    import('@/components/landing/voyage-map-canvas').then(
      (m) => m.VoyageMapCanvas,
    ),
  {
    ssr: false,
    loading: () => (
      <div
        className="flex min-h-[520px] items-center justify-center rounded-2xl"
        style={{
          backgroundColor: '#0b1220',
          border: '1px solid var(--wk-line)',
        }}
      >
        <p className="text-sm" style={{ color: 'var(--wk-text-muted)' }}>
          Loading interactive map…
        </p>
      </div>
    ),
  },
);

const CAPABILITIES = [
  {
    Icon: Route,
    title: 'Full passage history',
    description:
      'Past AIS positions become clean voyage tracks — not a spaghetti of raw pings. Gaps at anchor stay gaps; underway segments stay underway.',
    color: '#0ea5e9',
  },
  {
    Icon: MapPinned,
    title: 'Every port call, visible',
    description:
      'Start and end markers show where each passage began and finished so you can read a season at a glance.',
    color: '#14b8a6',
  },
  {
    Icon: CalendarRange,
    title: 'Distance, speed & duration',
    description:
      'Click any track to see nautical miles covered, average speed, and how long the vessel was underway.',
    color: '#8b5cf6',
  },
  {
    Icon: Waves,
    title: 'Multiple vessels, one chart',
    description:
      'Toggle vessels on and off, focus a season, and compare routes across fleets without leaving the map.',
    color: '#f59e0b',
  },
];

function CapabilityCard({
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
  const soft = `color-mix(in srgb, ${color} 12%, transparent)`;
  const ring = `color-mix(in srgb, ${color} 30%, transparent)`;
  return (
    <div
      className="rounded-2xl p-6"
      style={{
        backgroundColor: 'var(--wk-card)',
        border: '1px solid var(--wk-line)',
        boxShadow: 'var(--wk-shadow-md)',
      }}
    >
      <span
        className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl"
        style={{ backgroundColor: soft, color, border: `1px solid ${ring}` }}
      >
        <Icon className="h-5 w-5" />
      </span>
      <h3 className="text-lg font-bold tracking-tight" style={{ color: 'var(--wk-text)' }}>
        {title}
      </h3>
      <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--wk-text-soft)' }}>
        {description}
      </p>
    </div>
  );
}

export default function VoyageMapPage() {
  return (
    <WkPageShell>
      <WkPageHero
        eyebrow="Passage tracks"
        icon={<Ship className="h-7 w-7" />}
        title={
          <>
            Your past voyages,{' '}
            <span className="wk-gradient-text">drawn on the chart</span>
          </>
        }
        description="See what SeaJourney does with historical vessel AIS — continuous passage tracks, port-to-port stories, and fleet seasons you can actually read."
      />

      <section className="pb-10">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-5xl grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              {
                value: String(DEMO_PASSAGE_STATS.vessels),
                label: 'Sample vessels',
              },
              {
                value: String(DEMO_PASSAGE_STATS.passages),
                label: 'Demo passages',
              },
              {
                value: `${DEMO_PASSAGE_STATS.distanceNm.toLocaleString()} NM`,
                label: 'Illustrated distance',
              },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded-2xl p-5 text-center"
                style={{
                  backgroundColor: 'var(--wk-card)',
                  border: '1px solid var(--wk-line)',
                  boxShadow: 'var(--wk-shadow-md)',
                }}
              >
                <div className="text-2xl font-bold sm:text-3xl" style={{ color: 'var(--wk-accent)' }}>
                  {s.value}
                </div>
                <div
                  className="mt-1 text-[11px] font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--wk-text-muted)' }}
                >
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="pb-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div className="max-w-2xl">
                <span className="wk-chip">Interactive demo</span>
                <h2
                  className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl"
                  style={{ color: 'var(--wk-text)' }}
                >
                  Explore sample seasons on the map
                </h2>
                <p className="mt-2 text-sm sm:text-base" style={{ color: 'var(--wk-text-soft)' }}>
                  Click a coloured track for passage details. Use the vessel cards to focus or hide
                  a season. This uses illustrative routes — your live dashboard shows your real AIS history.
                </p>
              </div>
              <div
                className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest"
                style={{
                  backgroundColor: 'var(--wk-accent-soft)',
                  color: 'var(--wk-accent-strong)',
                  border: '1px solid var(--wk-accent-ring)',
                }}
              >
                <Sparkles className="h-3.5 w-3.5" />
                Sample data · no login
              </div>
            </div>

            <VoyageMapCanvas className="h-[min(72vh,720px)] min-h-[480px] w-full" />
          </div>
        </div>
      </section>

      <section className="pb-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <div className="mb-10 max-w-3xl">
              <span className="wk-chip">What you get</span>
              <h2
                className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl"
                style={{ color: 'var(--wk-text)' }}
              >
                Turn past vessel data into{' '}
                <span className="wk-gradient-text">a readable season</span>
              </h2>
              <p className="mt-3 text-base leading-relaxed sm:text-lg" style={{ color: 'var(--wk-text-soft)' }}>
                SeaJourney reconstructs passages from AIS history so crew and operators can
                review where the boat went, how long each leg took, and how seasons compare —
                without exporting spreadsheets first.
              </p>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              {CAPABILITIES.map((c) => (
                <CapabilityCard key={c.title} {...c} />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="pb-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div
            className="mx-auto flex max-w-5xl flex-col items-start gap-6 rounded-3xl p-8 sm:flex-row sm:items-center sm:justify-between sm:p-10"
            style={{
              background:
                'linear-gradient(135deg, color-mix(in srgb, var(--wk-accent) 16%, var(--wk-card)) 0%, var(--wk-card) 55%)',
              border: '1px solid var(--wk-line)',
              boxShadow: 'var(--wk-shadow-lg)',
            }}
          >
            <div className="max-w-xl">
              <div className="mb-3 inline-flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--wk-accent)' }}>
                <Anchor className="h-4 w-4" />
                Ready for your vessels
              </div>
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl" style={{ color: 'var(--wk-text)' }}>
                Open the real passage map in your dashboard
              </h2>
              <p className="mt-2 text-sm sm:text-base" style={{ color: 'var(--wk-text-soft)' }}>
                Crew Professional and Vessel Premium unlock live AIS samples, month caches,
                and your actual voyage history on the same chart engine.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/signup"
                className="inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold text-white"
                style={{
                  background:
                    'linear-gradient(135deg, var(--wk-accent) 0%, var(--wk-accent-strong) 100%)',
                  boxShadow: 'var(--wk-glow)',
                }}
              >
                Start free
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/for-vessels"
                className="inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold"
                style={{
                  color: 'var(--wk-text)',
                  border: '1px solid var(--wk-line-strong)',
                  backgroundColor: 'var(--wk-bg-raised)',
                }}
              >
                For vessels
              </Link>
            </div>
          </div>
        </div>
      </section>
    </WkPageShell>
  );
}
