'use client';

import Link from 'next/link';
import {
  ArrowLeftRight,
  ArrowRight,
  Award,
  Bell,
  BookOpen,
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  FileCheck,
  FileSignature,
  FileText,
  Link2,
  Radar,
  RefreshCw,
  Route,
  ShieldCheck,
  Ship,
  Smartphone,
  Sparkles,
  Target,
  User,
  Users,
} from 'lucide-react';
import { WkPageShell } from '@/components/wk/wk-page-shell';

type WorkflowStep = {
  step: string;
  vessel: string;
  crew: string;
  shared: string;
};

const WORKFLOW: WorkflowStep[] = [
  {
    step: '01',
    vessel: 'Register the yacht and invite crew or linked roles.',
    crew: 'Join from an invite — or self-join and wait for vessel approval where required.',
    shared: 'One shared vessel assignment links both dashboards.',
  },
  {
    step: '02',
    vessel: 'Import AIS history and keep live tracking on for operational truth.',
    crew: 'Log daily states — at sea, at anchor, moored, in yard, on leave — from the crew app.',
    shared: 'Vessel and crew logs stay comparable for audits and sign-off.',
  },
  {
    step: '03',
    vessel: 'Offer sea-time ranges or change assignment dates from the Crew page.',
    crew: 'Accept vessel sea-time offers in Inbox — records copy into the personal log.',
    shared: 'Sea time syncs automatically once accepted. No retyping.',
  },
  {
    step: '04',
    vessel: 'Generate testimonials for crew, or let crew request captain sign-off.',
    crew: 'Track sea time and certificates toward the next ticket on Career progress.',
    shared: 'Approvals and career data live in the same source of truth.',
  },
  {
    step: '05',
    vessel: 'Export reports and issue verified vessel documents when owners ask.',
    crew: 'Download signed testimonials with verification codes for applications.',
    shared: 'From logbook → sign-off → export, without spreadsheet ping-pong.',
  },
];

const SYNC_POINTS = [
  {
    Icon: RefreshCw,
    title: 'Sea-time offers',
    text: 'When a vessel manager updates your start date or offers a date range, you get an Inbox item. Accept and the days land in your personal sea-time log — ready for testimonials and career progress.',
  },
  {
    Icon: Calendar,
    title: 'Daily state alignment',
    text: 'Crew log their day; vessels can import AIS-derived states. Captains compare both sides before approving a testimonial so mismatches surface early.',
  },
  {
    Icon: Link2,
    title: 'Active assignment',
    text: 'While you are on a vessel roster, the right tools unlock for both sides — and Professional/Fleet vessels can cover crew access after plan-coverage approval.',
  },
  {
    Icon: Bell,
    title: 'Inbox for both sides',
    text: 'Incoming requests, sent testimonials, sea-time access, and plan coverage all sit in one Inbox — vessel Incoming/Sent tabs keep outbound work visible.',
  },
];

const CAREER_STEPS = [
  {
    n: '1',
    title: 'Pick your next ticket',
    text: 'Career progress shows the ladder — deck, engineering, or yacht certificates — and which milestone you are working toward next.',
  },
  {
    n: '2',
    title: 'See what is already on file',
    text: 'Sea time from approved testimonials, certificates in your vault, and proof of service are checked against each requirement automatically.',
  },
  {
    n: '3',
    title: 'Close the gaps',
    text: 'Missing or expiring certificates are called out. Link catalog presets when you upload so milestones match the right ticket types.',
  },
  {
    n: '4',
    title: 'Apply when ready',
    text: 'When required items are met, move into Apply for tickets with the same data package — no rebuilding your CV from scratch.',
  },
];

const TESTIMONIAL_FLOW = [
  {
    side: 'Crew or vessel',
    title: 'Generate or request',
    text: 'Crew request sign-off for a date range, or the vessel generates a testimonial for a crew member from the Crew page — same document path either way.',
  },
  {
    side: 'Captain',
    title: 'Review against logs',
    text: 'Inbox opens a date comparison: requested days vs vessel/crew state logs. Captains add conduct, ability, and general comments, then confirm their signature.',
  },
  {
    side: 'System',
    title: 'Sign & verify',
    text: 'Approved testimonials become downloadable PDFs with a verification code. Rejected ones can include mismatch notes so crew know what to fix.',
  },
];

const VESSEL_OFFERS = [
  {
    Icon: Ship,
    title: 'Vessel operations hub',
    text: 'Crew roster, assignments, daily state calendar, and passage tools in one manager dashboard.',
    color: '#0ea5e9',
  },
  {
    Icon: Radar,
    title: 'AIS-backed passages',
    text: 'History import, live tracking, passage map, and promote tracks into the passage logbook.',
    color: '#8b5cf6',
  },
  {
    Icon: Users,
    title: 'Team & linked accounts',
    text: 'Invite crew, create captain/officer seats, and grant feature access on Professional plans.',
    color: '#14b8a6',
  },
  {
    Icon: FileSignature,
    title: 'Generate & send sign-offs',
    text: 'Create testimonials for crew, request sea-time access, and track what is still pending in Sent.',
    color: '#6366f1',
  },
];

const CREW_OFFERS = [
  {
    Icon: Smartphone,
    title: 'Personal crew app',
    text: 'Your sea-time log, certificates, documents, and career path travel with you from yacht to yacht.',
    color: '#0ea5e9',
  },
  {
    Icon: Target,
    title: 'Progress to next ticket',
    text: 'See remaining sea days, certificate gaps, and checklist status for the milestone you are chasing.',
    color: '#f59e0b',
  },
  {
    Icon: ClipboardCheck,
    title: 'Digital testimonials',
    text: 'Request captain sign-off, accept vessel-generated docs, and keep verified PDFs for applications.',
    color: '#3b82f6',
  },
  {
    Icon: Sparkles,
    title: 'Auto-sync when assigned',
    text: 'Accept sea-time offers, answer access requests, and stay on your personal plan until vessel coverage is approved.',
    color: '#2dd4bf',
  },
];

const TOUCHPOINTS = [
  {
    Icon: ArrowLeftRight,
    label: 'Sea time sync',
    detail: 'Vessel offers · crew accepts · personal log updates',
  },
  {
    Icon: FileSignature,
    label: 'Testimonials',
    detail: 'Auto-generate · captain signs · verified PDF',
  },
  {
    Icon: Target,
    label: 'Career progress',
    detail: 'Sea time + certificates → next ticket checklist',
  },
  {
    Icon: ShieldCheck,
    label: 'Verification',
    detail: 'Tamper-proof codes on signed exports',
  },
];

const MORE_FEATURES = [
  {
    Icon: BookOpen,
    title: 'Passage logbook',
    text: 'Departures, arrivals, weather, and notes — promote AIS tracks straight into the book.',
  },
  {
    Icon: Route,
    title: 'Passages map',
    text: 'Visualise every voyage with historical backfill and live position when tracking is on.',
  },
  {
    Icon: FileText,
    title: 'Document generator',
    text: 'Issue vessel forms to crew from templates; keep an archive with verification codes.',
  },
  {
    Icon: FileCheck,
    title: 'Certificates vault',
    text: 'Upload tickets once; match them to the catalog so career milestones and vessel views stay consistent.',
  },
  {
    Icon: Users,
    title: 'Watch & rotation',
    text: 'Publish nav watch schedules and track who is onboard vs ashore without a separate spreadsheet.',
  },
  {
    Icon: Award,
    title: 'Apply for tickets',
    text: 'When career progress is green, assemble application packages from the same data you already logged.',
  },
];

function OfferCard({
  Icon,
  title,
  text,
  color,
}: {
  Icon: React.ComponentType<{ className?: string }>;
  title: string;
  text: string;
  color: string;
}) {
  const ring = `color-mix(in srgb, ${color} 30%, transparent)`;
  const soft = `color-mix(in srgb, ${color} 12%, transparent)`;
  return (
    <div
      className="flex h-full flex-col rounded-2xl p-6 transition-transform hover:-translate-y-0.5"
      style={{
        backgroundColor: 'var(--wk-card)',
        border: '1px solid var(--wk-line)',
        boxShadow: 'var(--wk-shadow-md)',
      }}
    >
      <span
        className="inline-flex h-11 w-11 items-center justify-center rounded-xl"
        style={{ backgroundColor: soft, color, border: `1px solid ${ring}` }}
      >
        <Icon className="h-5 w-5" />
      </span>
      <h3 className="mt-4 text-lg font-bold tracking-tight" style={{ color: 'var(--wk-text)' }}>
        {title}
      </h3>
      <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--wk-text-soft)' }}>
        {text}
      </p>
    </div>
  );
}

function FeatureDeepDive({
  chip,
  title,
  titleAccent,
  lead,
  children,
  reverse,
}: {
  chip: string;
  title: string;
  titleAccent: string;
  lead: string;
  children: React.ReactNode;
  reverse?: boolean;
}) {
  return (
    <section className="pb-20">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div
          className={`mx-auto flex max-w-6xl flex-col gap-10 lg:items-start lg:gap-14 ${
            reverse ? 'lg:flex-row-reverse' : 'lg:flex-row'
          }`}
        >
          <div className="lg:w-[38%] lg:shrink-0">
            <span className="wk-chip">{chip}</span>
            <h2
              className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl"
              style={{ color: 'var(--wk-text)' }}
            >
              {title}{' '}
              <span className="wk-gradient-text">{titleAccent}</span>
            </h2>
            <p
              className="mt-4 text-base leading-relaxed"
              style={{ color: 'var(--wk-text-soft)' }}
            >
              {lead}
            </p>
          </div>
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </div>
    </section>
  );
}

export default function TempLandingPage() {
  return (
    <WkPageShell>
      <div
        className="border-b px-4 py-2.5 text-center text-xs font-medium sm:text-sm"
        style={{
          backgroundColor: 'var(--wk-warn-soft)',
          borderColor: 'color-mix(in srgb, var(--wk-warn) 35%, transparent)',
          color: 'var(--wk-text)',
        }}
      >
        Preview only — redesign draft at{' '}
        <span className="font-semibold">/temp</span>. The main homepage is unchanged.
      </div>

      {/* Hero */}
      <section className="relative overflow-hidden pb-16 pt-12 sm:pb-20 sm:pt-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-4xl text-center">
            <span className="wk-chip">Vessel + crew together</span>
            <h1
              className="mt-5 text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl"
              style={{ color: 'var(--wk-text)' }}
            >
              Crew app and vessel hub —{' '}
              <span className="wk-gradient-text">built to sync</span>
            </h1>
            <p
              className="mx-auto mt-5 max-w-2xl text-base leading-relaxed sm:text-lg"
              style={{ color: 'var(--wk-text-soft)' }}
            >
              Crew keep a personal sea-time and career record on their phone. Vessels run the yacht
              from a shared dashboard. When someone is assigned, sea time, testimonials, and
              approvals flow between them automatically — so progress to the next ticket stays
              honest and paperwork stops living in email.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="/signup" className="wk-btn wk-btn-primary">
                Start as crew
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/signup/vessel" className="wk-btn wk-btn-ghost">
                Register a vessel
              </Link>
              <Link href="/" className="wk-btn wk-btn-ghost">
                Current homepage
              </Link>
            </div>
          </div>

          <div className="mx-auto mt-14 grid max-w-5xl gap-4 md:grid-cols-2">
            <div
              className="rounded-2xl p-6 sm:p-8"
              style={{
                backgroundColor: 'var(--wk-card)',
                border: '1px solid var(--wk-line)',
                boxShadow: 'var(--wk-shadow-md)',
              }}
            >
              <div className="flex items-center gap-3">
                <span
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl"
                  style={{
                    backgroundColor: 'var(--wk-accent-soft)',
                    color: 'var(--wk-accent)',
                    border: '1px solid var(--wk-accent-ring)',
                  }}
                >
                  <Ship className="h-5 w-5" />
                </span>
                <div className="text-left">
                  <p className="wk-eyebrow">Vessel hub</p>
                  <p className="text-lg font-bold" style={{ color: 'var(--wk-text)' }}>
                    Run the yacht once
                  </p>
                </div>
              </div>
              <p className="mt-4 text-sm leading-relaxed" style={{ color: 'var(--wk-text-soft)' }}>
                Roster, AIS, passages, watch schedules, generate testimonials for the team, and see
                what is still waiting in Inbox — without chasing each crew member for copies.
              </p>
            </div>
            <div
              className="rounded-2xl p-6 sm:p-8"
              style={{
                backgroundColor: 'var(--wk-card)',
                border: '1px solid var(--wk-line)',
                boxShadow: 'var(--wk-shadow-md)',
              }}
            >
              <div className="flex items-center gap-3">
                <span
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl"
                  style={{
                    backgroundColor: 'var(--wk-accent-2-soft)',
                    color: 'var(--wk-accent-2)',
                    border: '1px solid color-mix(in srgb, var(--wk-accent-2) 35%, transparent)',
                  }}
                >
                  <User className="h-5 w-5" />
                </span>
                <div className="text-left">
                  <p className="wk-eyebrow">Crew app</p>
                  <p className="text-lg font-bold" style={{ color: 'var(--wk-text)' }}>
                    Career record that moves with you
                  </p>
                </div>
              </div>
              <p className="mt-4 text-sm leading-relaxed" style={{ color: 'var(--wk-text-soft)' }}>
                Log days, store certificates, track the next ticket, accept vessel sea-time offers,
                and collect signed testimonials — then take that history to the next yacht.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Touchpoints */}
      <section className="pb-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-5xl">
            <div className="mb-8 text-center">
              <span className="wk-chip">Where they meet</span>
              <h2
                className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl"
                style={{ color: 'var(--wk-text)' }}
              >
                Shared data,{' '}
                <span className="wk-gradient-text">not duplicate admin</span>
              </h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {TOUCHPOINTS.map((t) => (
                <div
                  key={t.label}
                  className="rounded-xl p-4 text-center"
                  style={{
                    backgroundColor: 'var(--wk-bg-subtle)',
                    border: '1px solid var(--wk-line)',
                  }}
                >
                  <t.Icon className="mx-auto h-5 w-5" style={{ color: 'var(--wk-accent)' }} />
                  <p className="mt-2 text-sm font-semibold" style={{ color: 'var(--wk-text)' }}>
                    {t.label}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--wk-text-muted)' }}>
                    {t.detail}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Deep dive: auto sync */}
      <section
        className="border-y py-16 sm:py-20"
        style={{
          backgroundColor: 'var(--wk-bg-subtle)',
          borderColor: 'var(--wk-line)',
        }}
      >
        <FeatureDeepDive
          chip="Auto sync"
          title="The crew app stays personal —"
          titleAccent="and still syncs with the vessel"
          lead="Crew never lose ownership of their history. When they are assigned to a yacht on SeaJourney, the vessel can push sea-time ranges and documents into their Inbox. Accept once, and the personal log updates — ready for career progress and captain sign-off."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            {SYNC_POINTS.map((s) => (
              <div
                key={s.title}
                className="rounded-2xl p-5"
                style={{
                  backgroundColor: 'var(--wk-card)',
                  border: '1px solid var(--wk-line)',
                  boxShadow: 'var(--wk-shadow-sm)',
                }}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg"
                    style={{
                      backgroundColor: 'var(--wk-accent-soft)',
                      color: 'var(--wk-accent)',
                    }}
                  >
                    <s.Icon className="h-4 w-4" />
                  </span>
                  <h3 className="font-semibold" style={{ color: 'var(--wk-text)' }}>
                    {s.title}
                  </h3>
                </div>
                <p className="mt-3 text-sm leading-relaxed" style={{ color: 'var(--wk-text-soft)' }}>
                  {s.text}
                </p>
              </div>
            ))}
          </div>
        </FeatureDeepDive>
      </section>

      {/* Deep dive: career progress */}
      <section className="py-16 sm:py-20">
        <FeatureDeepDive
          chip="Career progress"
          title="Track the path to"
          titleAccent="your next ticket"
          lead="Career progress turns logged sea time and certificates into a live checklist for the milestone you are aiming at — Master, Chief Engineer, Yachtmaster, or the next step on your ladder. Gaps are visible before you apply, not after the package is rejected."
          reverse
        >
          <div className="space-y-3">
            {CAREER_STEPS.map((c) => (
              <div
                key={c.n}
                className="flex gap-4 rounded-2xl p-5"
                style={{
                  backgroundColor: 'var(--wk-card)',
                  border: '1px solid var(--wk-line)',
                  boxShadow: 'var(--wk-shadow-sm)',
                }}
              >
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold"
                  style={{
                    backgroundColor: 'var(--wk-accent-soft)',
                    color: 'var(--wk-accent)',
                    border: '1px solid var(--wk-accent-ring)',
                  }}
                >
                  {c.n}
                </span>
                <div>
                  <h3 className="font-semibold" style={{ color: 'var(--wk-text)' }}>
                    {c.title}
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed" style={{ color: 'var(--wk-text-soft)' }}>
                    {c.text}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <div
            className="mt-5 rounded-2xl p-5"
            style={{
              backgroundColor: 'var(--wk-accent-soft)',
              border: '1px solid var(--wk-accent-ring)',
            }}
          >
            <p className="text-sm leading-relaxed" style={{ color: 'var(--wk-text)' }}>
              <strong>Tied to vessel sync:</strong> when you accept sea-time from a yacht or get a
              signed testimonial, those days count toward the same career checklist — so logging on
              board and progressing your ticket stay one workflow.
            </p>
          </div>
        </FeatureDeepDive>
      </section>

      {/* Deep dive: testimonials */}
      <section
        className="border-y py-16 sm:py-20"
        style={{
          backgroundColor: 'var(--wk-bg-subtle)',
          borderColor: 'var(--wk-line)',
        }}
      >
        <FeatureDeepDive
          chip="Testimonials"
          title="Auto-generate, review,"
          titleAccent="sign off digitally"
          lead="Testimonials are the bridge between vessel truth and crew careers. Generate them from the vessel side for a crew member, or let crew request captain sign-off. Either path lands in Inbox with log comparison, captain comments, signature, and a verified PDF."
        >
          <div className="space-y-4">
            {TESTIMONIAL_FLOW.map((t, i) => (
              <div
                key={t.title}
                className="relative rounded-2xl p-5 sm:p-6"
                style={{
                  backgroundColor: 'var(--wk-card)',
                  border: '1px solid var(--wk-line)',
                  boxShadow: 'var(--wk-shadow-md)',
                }}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                    style={{
                      backgroundColor: 'var(--wk-accent-soft)',
                      color: 'var(--wk-accent)',
                      border: '1px solid var(--wk-accent-ring)',
                    }}
                  >
                    {t.side}
                  </span>
                  <span
                    className="font-mono text-xs font-bold"
                    style={{ color: 'var(--wk-text-muted)' }}
                  >
                    {String(i + 1).padStart(2, '0')}
                  </span>
                </div>
                <h3 className="mt-3 text-lg font-bold" style={{ color: 'var(--wk-text)' }}>
                  {t.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--wk-text-soft)' }}>
                  {t.text}
                </p>
              </div>
            ))}
          </div>
          <ul className="mt-5 grid gap-2 sm:grid-cols-2">
            {[
              'Date comparison vs vessel / crew state logs',
              'Captain comments (conduct, ability, general)',
              'Saved signature on the PDF',
              'Verification code for third-party checks',
            ].map((item) => (
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
        </FeatureDeepDive>
      </section>

      {/* End-to-end workflow table */}
      <section className="pb-20 pt-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-5xl">
            <div className="mb-10 max-w-3xl">
              <span className="wk-chip">End-to-end</span>
              <h2
                className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl"
                style={{ color: 'var(--wk-text)' }}
              >
                From join to{' '}
                <span className="wk-gradient-text">signed career record</span>
              </h2>
              <p className="mt-3 text-base leading-relaxed" style={{ color: 'var(--wk-text-soft)' }}>
                Vessel action, crew action, and the shared outcome — the same story as above in one
                pass.
              </p>
            </div>

            <div
              className="hidden overflow-hidden rounded-2xl md:block"
              style={{ border: '1px solid var(--wk-line)' }}
            >
              <div
                className="grid grid-cols-[3rem_1fr_1fr_1fr] gap-0 text-[11px] font-bold uppercase tracking-wider"
                style={{
                  backgroundColor: 'var(--wk-card)',
                  color: 'var(--wk-text-muted)',
                  borderBottom: '1px solid var(--wk-line)',
                }}
              >
                <div className="px-4 py-3">Step</div>
                <div className="border-l px-4 py-3" style={{ borderColor: 'var(--wk-line)' }}>
                  Vessel
                </div>
                <div className="border-l px-4 py-3" style={{ borderColor: 'var(--wk-line)' }}>
                  Crew
                </div>
                <div className="border-l px-4 py-3" style={{ borderColor: 'var(--wk-line)' }}>
                  Shared outcome
                </div>
              </div>
              {WORKFLOW.map((row, i) => (
                <div
                  key={row.step}
                  className="grid grid-cols-[3rem_1fr_1fr_1fr] text-sm"
                  style={{
                    backgroundColor: i % 2 === 0 ? 'var(--wk-card)' : 'var(--wk-bg-raised)',
                    borderBottom:
                      i < WORKFLOW.length - 1 ? '1px solid var(--wk-line)' : undefined,
                  }}
                >
                  <div
                    className="flex items-start px-4 py-4 font-mono text-xs font-bold"
                    style={{ color: 'var(--wk-accent)' }}
                  >
                    {row.step}
                  </div>
                  <div
                    className="border-l px-4 py-4"
                    style={{ borderColor: 'var(--wk-line)', color: 'var(--wk-text-soft)' }}
                  >
                    {row.vessel}
                  </div>
                  <div
                    className="border-l px-4 py-4"
                    style={{ borderColor: 'var(--wk-line)', color: 'var(--wk-text-soft)' }}
                  >
                    {row.crew}
                  </div>
                  <div
                    className="border-l px-4 py-4 font-medium"
                    style={{ borderColor: 'var(--wk-line)', color: 'var(--wk-text)' }}
                  >
                    {row.shared}
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-4 md:hidden">
              {WORKFLOW.map((row) => (
                <div
                  key={row.step}
                  className="rounded-2xl p-5"
                  style={{
                    backgroundColor: 'var(--wk-card)',
                    border: '1px solid var(--wk-line)',
                    boxShadow: 'var(--wk-shadow-sm)',
                  }}
                >
                  <span
                    className="font-mono text-xs font-bold"
                    style={{ color: 'var(--wk-accent)' }}
                  >
                    Step {row.step}
                  </span>
                  <p
                    className="mt-3 text-xs font-semibold uppercase tracking-wide"
                    style={{ color: 'var(--wk-text-muted)' }}
                  >
                    Vessel
                  </p>
                  <p className="mt-1 text-sm" style={{ color: 'var(--wk-text-soft)' }}>
                    {row.vessel}
                  </p>
                  <p
                    className="mt-3 text-xs font-semibold uppercase tracking-wide"
                    style={{ color: 'var(--wk-text-muted)' }}
                  >
                    Crew
                  </p>
                  <p className="mt-1 text-sm" style={{ color: 'var(--wk-text-soft)' }}>
                    {row.crew}
                  </p>
                  <p
                    className="mt-3 text-xs font-semibold uppercase tracking-wide"
                    style={{ color: 'var(--wk-accent)' }}
                  >
                    Shared
                  </p>
                  <p className="mt-1 text-sm font-medium" style={{ color: 'var(--wk-text)' }}>
                    {row.shared}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Split offers */}
      <section
        className="border-t pb-16 pt-16"
        style={{ borderColor: 'var(--wk-line)', backgroundColor: 'var(--wk-bg-subtle)' }}
      >
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
              <div>
                <span className="wk-chip">Vessel side</span>
                <h2
                  className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl"
                  style={{ color: 'var(--wk-text)' }}
                >
                  What managers{' '}
                  <span className="wk-gradient-text">run day to day</span>
                </h2>
                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  {VESSEL_OFFERS.map((o) => (
                    <OfferCard key={o.title} {...o} />
                  ))}
                </div>
              </div>
              <div>
                <span className="wk-chip">Crew side</span>
                <h2
                  className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl"
                  style={{ color: 'var(--wk-text)' }}
                >
                  What crew{' '}
                  <span className="wk-gradient-text">take with them</span>
                </h2>
                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  {CREW_OFFERS.map((o) => (
                    <OfferCard key={o.title} {...o} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* More platform */}
      <section className="pb-16 pt-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <div className="mb-10 max-w-3xl">
              <span className="wk-chip">And more</span>
              <h2
                className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl"
                style={{ color: 'var(--wk-text)' }}
              >
                The rest of the{' '}
                <span className="wk-gradient-text">platform stack</span>
              </h2>
              <p className="mt-3 text-base leading-relaxed" style={{ color: 'var(--wk-text-soft)' }}>
                Sync, career progress, and testimonials sit on top of the same operational tools —
                passages, certificates, documents, and watchkeeping.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {MORE_FEATURES.map((f) => (
                <div
                  key={f.title}
                  className="rounded-2xl p-5"
                  style={{
                    backgroundColor: 'var(--wk-card)',
                    border: '1px solid var(--wk-line)',
                    boxShadow: 'var(--wk-shadow-sm)',
                  }}
                >
                  <f.Icon className="h-5 w-5" style={{ color: 'var(--wk-accent)' }} />
                  <h3 className="mt-3 font-semibold" style={{ color: 'var(--wk-text)' }}>
                    {f.title}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed" style={{ color: 'var(--wk-text-soft)' }}>
                    {f.text}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/for-vessels" className="wk-btn wk-btn-ghost">
                Full vessel feature list
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/offers" className="wk-btn wk-btn-ghost">
                Compare plans
              </Link>
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
            <h3 className="text-3xl font-bold tracking-tight" style={{ color: 'var(--wk-text)' }}>
              Crew keeps the record. The vessel keeps it accurate.
            </h3>
            <p
              className="mx-auto mt-3 max-w-2xl text-base"
              style={{ color: 'var(--wk-text-soft)' }}
            >
              Start on either side. When you link on the same yacht, sea time syncs, testimonials
              get signed, and career progress reflects what actually happened onboard.
            </p>
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <Link href="/signup" className="wk-btn wk-btn-primary justify-center">
                Sign up as crew
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/signup/vessel" className="wk-btn wk-btn-ghost justify-center">
                Register a vessel
              </Link>
            </div>
            <p className="mt-6 text-sm" style={{ color: 'var(--wk-text-muted)' }}>
              <Link
                href="/request-demo"
                className="font-medium hover:underline"
                style={{ color: 'var(--wk-accent)' }}
              >
                Request a demo
              </Link>
              {' · '}
              <Link
                href="/offers"
                className="font-medium hover:underline"
                style={{ color: 'var(--wk-accent)' }}
              >
                Compare plans
              </Link>
            </p>
          </div>
        </div>
      </section>
    </WkPageShell>
  );
}
