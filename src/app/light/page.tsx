'use client';

/**
 * Light-mode landing page preview.
 *
 * Self-contained alternative to the dark landing page at `/`. Mirrors the same
 * narrative (hero → crew benefits → features → AI scanner → forms →
 * certificates → watch → AIS → verification → membership → footer) but with a
 * warm off-white palette and cyan/emerald brand accents. The existing dark
 * page is left unchanged so the two designs can be compared side-by-side.
 */

import Link from 'next/link';
import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Award,
  Anchor,
  Bell,
  Briefcase,
  Building,
  Calendar,
  CalendarRange,
  CheckCircle2,
  ChevronRight,
  Clock,
  Compass,
  Download,
  FileCheck,
  FileText,
  Globe,
  Layers,
  Radar,
  Radio,
  ScanSearch,
  ShieldCheck,
  Ship,
  Smartphone,
  Sparkles,
  Star,
  TrendingUp,
  Users,
  Waves,
  Watch as WatchIcon,
  Wrench,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import Logo from '@/components/logo';
import { AppStoreIcon } from '@/components/sections/cta';
import { cn } from '@/lib/utils';
import { Facebook, Instagram, Twitter } from 'lucide-react';

/**
 * Palette tokens. Kept local so this page doesn't affect the rest of the app.
 *
 * - `base` / `raised` give pure-white and a very soft cool grey for alternating
 *   section bands (stays clean / editorial, no warm tint).
 * - `ink` / `inkSoft` / `line` are shared typography + border tokens.
 * - `SECTION` maps each landing section to its own accent pair so each
 *   stripe of the page carries its own color identity, mirroring the
 *   multi-color feel of the dark landing page.
 */
const PALETTE = {
  base: '#ffffff',
  raised: '#f6f8fb',      // very subtle cool slate-50
  card: '#ffffff',
  ink: '#0b2235',
  inkSoft: '#415a72',
  line: 'rgba(11, 34, 53, 0.10)',
  warm: '#b45309',        // amber-700 for beta/coming-soon accents
};

interface SectionAccent {
  /** Primary brand color for eyebrow badges, icons, primary buttons. */
  primary: string;
  /** Secondary color used for gradients and secondary icons. */
  secondary: string;
  /** Translucent background used for soft-tint chips / icon wells. */
  tint: string;
  /** Translucent border used alongside `tint` for chips. */
  tintBorder: string;
  /** Deep textual shade of `primary` suitable for text on tint. */
  ink: string;
}

const SECTION: Record<
  'hero' | 'crew' | 'visa' | 'scanner' | 'forms' | 'certs' | 'watch' | 'ais' | 'verify' | 'pricing',
  SectionAccent
> = {
  hero:    { primary: '#2563eb', secondary: '#7c3aed', tint: 'rgba(37, 99, 235, 0.08)',  tintBorder: 'rgba(37, 99, 235, 0.22)',  ink: '#1d4ed8' },
  crew:    { primary: '#0ea5e9', secondary: '#2563eb', tint: 'rgba(14, 165, 233, 0.08)', tintBorder: 'rgba(14, 165, 233, 0.22)', ink: '#0369a1' },
  visa:    { primary: '#8b5cf6', secondary: '#ec4899', tint: 'rgba(139, 92, 246, 0.08)', tintBorder: 'rgba(139, 92, 246, 0.22)', ink: '#6d28d9' },
  scanner: { primary: '#0891b2', secondary: '#059669', tint: 'rgba(8, 145, 178, 0.08)',  tintBorder: 'rgba(8, 145, 178, 0.22)',  ink: '#0e7490' },
  forms:   { primary: '#4f46e5', secondary: '#0ea5e9', tint: 'rgba(79, 70, 229, 0.08)',  tintBorder: 'rgba(79, 70, 229, 0.22)',  ink: '#4338ca' },
  certs:   { primary: '#d97706', secondary: '#dc2626', tint: 'rgba(217, 119, 6, 0.10)',  tintBorder: 'rgba(217, 119, 6, 0.25)',  ink: '#b45309' },
  watch:   { primary: '#0f172a', secondary: '#0d9488', tint: 'rgba(15, 23, 42, 0.06)',   tintBorder: 'rgba(15, 23, 42, 0.15)',   ink: '#0f172a' },
  ais:     { primary: '#0d9488', secondary: '#0284c7', tint: 'rgba(13, 148, 136, 0.08)', tintBorder: 'rgba(13, 148, 136, 0.22)', ink: '#0f766e' },
  verify:  { primary: '#059669', secondary: '#10b981', tint: 'rgba(5, 150, 105, 0.08)',  tintBorder: 'rgba(5, 150, 105, 0.22)',  ink: '#047857' },
  pricing: { primary: '#7c3aed', secondary: '#2563eb', tint: 'rgba(124, 58, 237, 0.08)', tintBorder: 'rgba(124, 58, 237, 0.22)', ink: '#6d28d9' },
};

function gradient(a: SectionAccent) {
  return `linear-gradient(135deg, ${a.primary} 0%, ${a.secondary} 100%)`;
}

export default function LightLandingPage() {
  return (
    <div
      className="min-h-screen font-sans antialiased"
      style={{ backgroundColor: PALETTE.base, color: PALETTE.ink }}
    >
      <LightHeader />
      <main>
        <Hero />
        <CrewBenefits />
        <VisaTrackerPreview />
        <AIScannerPromo />
        <OfficialForms />
        <CertificateTracking />
        <WatchComingSoon />
        <AISImport />
        <VerificationCTA />
        <Pricing />
        <AndroidSignup />
      </main>
      <LightFooter />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function LightHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header
      className="sticky top-0 z-50 backdrop-blur-xl"
      style={{
        backgroundColor: 'rgba(255, 255, 255, 0.85)',
        borderBottom: `1px solid ${PALETTE.line}`,
      }}
    >
      <div className="container mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
        <Logo className="!text-[#0b2235]" />

        <nav className="hidden items-center gap-8 md:flex">
          <a href="#features" className="text-sm font-medium transition-colors hover:opacity-80" style={{ color: PALETTE.inkSoft }}>
            Features
          </a>
          <a href="#scanner" className="text-sm font-medium transition-colors hover:opacity-80" style={{ color: PALETTE.inkSoft }}>
            AI Scanner
          </a>
          <a href="#forms" className="text-sm font-medium transition-colors hover:opacity-80" style={{ color: PALETTE.inkSoft }}>
            Forms
          </a>
          <a href="#pricing" className="text-sm font-medium transition-colors hover:opacity-80" style={{ color: PALETTE.inkSoft }}>
            Pricing
          </a>
          <Link href="/roadmap" className="text-sm font-medium transition-colors hover:opacity-80" style={{ color: PALETTE.inkSoft }}>
            Roadmap
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="hidden rounded-full px-3 py-1.5 text-xs font-medium md:inline-flex"
            style={{ color: PALETTE.inkSoft, border: `1px solid ${PALETTE.line}` }}
            title="Switch back to the live dark landing page"
          >
            View dark theme
          </Link>
          <Link
            href="/login"
            className="hidden text-sm font-medium md:inline-block"
            style={{ color: PALETTE.inkSoft }}
          >
            Sign in
          </Link>
          <Button
            asChild
            className="rounded-full text-white shadow-sm"
            style={{ backgroundImage: gradient(SECTION.hero) }}
          >
            <Link href="/signup">Get started</Link>
          </Button>
          <button
            className="ml-1 rounded-md p-2 md:hidden"
            style={{ color: PALETTE.ink }}
            onClick={() => setOpen((o) => !o)}
            aria-label="Toggle menu"
          >
            <Layers className="h-5 w-5" />
          </button>
        </div>
      </div>
      {open && (
        <div className="md:hidden" style={{ borderTop: `1px solid ${PALETTE.line}` }}>
          <div className="container mx-auto flex flex-col gap-1 px-4 py-3">
            {[
              { label: 'Features', href: '#features' },
              { label: 'AI Scanner', href: '#scanner' },
              { label: 'Forms', href: '#forms' },
              { label: 'Pricing', href: '#pricing' },
            ].map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="rounded-lg px-3 py-2 text-sm font-medium"
                style={{ color: PALETTE.ink }}
                onClick={() => setOpen(false)}
              >
                {l.label}
              </a>
            ))}
            <Link href="/" className="rounded-lg px-3 py-2 text-sm font-medium" style={{ color: PALETTE.inkSoft }}>
              View dark theme
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

function Hero() {
  const a = SECTION.hero;
  return (
    <section className="relative overflow-hidden py-20 sm:py-28" style={{ backgroundColor: PALETTE.base }}>
      <DecorativeWaves accent={a} />
      <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <span
              className="inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider"
              style={{ backgroundColor: a.tint, color: a.ink, border: `1px solid ${a.tintBorder}` }}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Mobile app + web portal
            </span>
            <h1 className="font-headline mt-6 text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl" style={{ color: PALETTE.ink }}>
              Log on Mobile.{' '}
              <span className="bg-clip-text text-transparent" style={{ backgroundImage: gradient(a) }}>
                Manage on Web.
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-3xl text-lg leading-relaxed sm:text-xl" style={{ color: PALETTE.inkSoft }}>
              Use the iOS app to log your sea time anywhere, anytime. Then step up to
              the web portal for digital testimonials, professional exports, and
              complete maritime career management.
            </p>

            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button
                asChild
                size="lg"
                className="h-12 rounded-xl px-6 text-base font-semibold text-white shadow-lg"
                style={{
                  backgroundImage: gradient(a),
                  boxShadow: '0 12px 32px -12px rgba(37, 99, 235, 0.55)',
                }}
              >
                <Link href="https://apps.apple.com/gb/app/seajourney/id6751553072" target="_blank" rel="noopener noreferrer">
                  <AppStoreIcon className="mr-2 h-4 w-4" />
                  Download iOS app
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="h-12 rounded-xl border-2 px-6 text-base font-semibold"
                style={{ borderColor: PALETTE.line, color: PALETTE.ink, backgroundColor: 'white' }}
              >
                <Link href="#pricing" className="flex items-center gap-2">
                  Explore web portal
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>

            <div className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm" style={{ color: PALETTE.inkSoft }}>
              <TrustPill icon={ShieldCheck} label="MCA compliant" color={a.primary} />
              <TrustPill icon={Globe} label="Works on every vessel" color={a.primary} />
              <TrustPill icon={Zap} label="Sync iOS & Web" color={a.primary} />
            </div>
          </motion.div>
        </div>

        <HeroShowcase />
      </div>
    </section>
  );
}

function TrustPill({ icon: Icon, label, color }: { icon: any; label: string; color?: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Icon className="h-4 w-4" style={{ color: color ?? PALETTE.ink }} />
      <span className="font-medium" style={{ color: PALETTE.ink }}>{label}</span>
    </span>
  );
}

function HeroShowcase() {
  // Lightweight editorial mockup: a soft card with vessel-state chips + a row
  // of "today" stats. Deliberately simpler than the dark hero's iPhone mockup.
  const states = [
    { key: 'underway', name: 'Underway', icon: Waves, c: '#2563eb' },
    { key: 'at-anchor', name: 'At Anchor', icon: Anchor, c: '#ea580c' },
    { key: 'in-port', name: 'In Port', icon: Building, c: '#059669', active: true },
    { key: 'on-leave', name: 'On Leave', icon: Briefcase, c: '#64748b' },
    { key: 'in-yard', name: 'In Yard', icon: Wrench, c: '#b91c1c' },
  ];
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay: 0.25 }}
      className="mx-auto mt-16 max-w-5xl"
    >
      <div
        className="rounded-3xl p-3 sm:p-4"
        style={{
          backgroundColor: 'rgba(255, 255, 255, 0.6)',
          border: `1px solid ${PALETTE.line}`,
          boxShadow: '0 30px 80px -40px rgba(11, 34, 53, 0.25)',
        }}
      >
        <div
          className="rounded-2xl p-6 sm:p-8"
          style={{ backgroundColor: 'white', border: `1px solid ${PALETTE.line}` }}
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: PALETTE.inkSoft }}>
                M/Y Sea Journey · Today
              </p>
              <h3 className="mt-1 text-2xl font-bold" style={{ color: PALETTE.ink }}>
                Mallorca, Spain · 38°N
              </h3>
            </div>
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
              style={{ backgroundColor: 'rgba(5, 150, 105, 0.1)', color: '#047857' }}
            >
              <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ backgroundColor: '#059669' }} />
              Live log
            </span>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            {states.map((s) => (
              <span
                key={s.key}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium',
                  s.active ? 'text-white shadow-sm' : '',
                )}
                style={
                  s.active
                    ? { backgroundColor: s.c }
                    : { backgroundColor: PALETTE.raised, color: PALETTE.inkSoft, border: `1px solid ${PALETTE.line}` }
                }
              >
                <s.icon className="h-3.5 w-3.5" />
                {s.name}
              </span>
            ))}
          </div>

          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Days logged" value="427" icon={Calendar} />
            <Stat label="Sea time" value="312d" icon={Ship} />
            <Stat label="Testimonials" value="6" icon={FileCheck} />
            <Stat label="Vessels" value="4" icon={Anchor} />
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function Stat({ label, value, icon: Icon }: { label: string; value: string; icon: any }) {
  return (
    <div
      className="rounded-xl p-4"
      style={{ backgroundColor: PALETTE.raised, border: `1px solid ${PALETTE.line}` }}
    >
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider" style={{ color: PALETTE.inkSoft }}>
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold" style={{ color: PALETTE.ink }}>{value}</div>
    </div>
  );
}

function DecorativeWaves({ accent }: { accent: SectionAccent }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-[520px] overflow-hidden">
      <div
        className="absolute -left-20 top-10 h-[360px] w-[360px] rounded-full blur-3xl"
        style={{ backgroundColor: accent.tint }}
      />
      <div
        className="absolute -right-20 top-40 h-[420px] w-[420px] rounded-full blur-3xl"
        style={{ backgroundColor: accent.tint, opacity: 0.7 }}
      />
      <svg
        className="absolute inset-x-0 bottom-0 w-full"
        viewBox="0 0 1440 120"
        fill="none"
        preserveAspectRatio="none"
        style={{ height: 120 }}
      >
        <path
          d="M0 80 C 240 40 480 120 720 80 C 960 40 1200 120 1440 80 L 1440 120 L 0 120 Z"
          fill={PALETTE.raised}
        />
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Crew Benefits
// ---------------------------------------------------------------------------

// Each benefit card gets its own hue so the grid reads as "multi-color" like
// the dark page's benefits grid.
const benefits = [
  { icon: Clock,         title: 'Accurate sea time tracking',      desc: 'Log unlimited vessel states with precision and build a complete record of your maritime experience.', color: '#2563eb', tint: 'rgba(37, 99, 235, 0.10)' },
  { icon: FileCheck,     title: 'Digital captain testimonials',    desc: 'Request and receive digital testimonials directly from captains. Instant sign-offs, no paperwork delays.', color: '#059669', tint: 'rgba(5, 150, 105, 0.10)' },
  { icon: TrendingUp,    title: 'Career advancement made easy',    desc: 'Export professional PDFs and multi-format documents (Excel, CSV) for job applications and certification requests.', color: '#8b5cf6', tint: 'rgba(139, 92, 246, 0.10)' },
  { icon: ShieldCheck,   title: 'MCA compliant calculations',       desc: 'Automatic sea time calculations that meet MCA requirements. Know exactly where you stand on your certification journey.', color: '#ea580c', tint: 'rgba(234, 88, 12, 0.10)' },
  { icon: CalendarRange, title: 'Visual career timeline',          desc: 'See your entire service history at a glance with the year calendar view. Track progress across multiple vessels.', color: '#0891b2', tint: 'rgba(8, 145, 178, 0.10)' },
  { icon: Globe,         title: 'Work anywhere',                    desc: 'Log on your phone, manage on the web. Data syncs seamlessly across every device you use.', color: '#4f46e5', tint: 'rgba(79, 70, 229, 0.10)' },
];

function CrewBenefits() {
  return (
    <section className="py-20 sm:py-28" style={{ backgroundColor: PALETTE.raised }}>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <SectionEyebrow icon={Users} accent={SECTION.crew}>Built for yacht crew</SectionEyebrow>
          <h2 className="font-headline mt-4 text-3xl font-bold tracking-tight sm:text-4xl" style={{ color: PALETTE.ink }}>
            Everything you need to prove your sea time.
          </h2>
          <p className="mt-4 text-lg" style={{ color: PALETTE.inkSoft }}>
            From your first day on deck to your next certification, SeaJourney keeps
            your career record complete, accurate, and ready to submit.
          </p>
        </div>

        <div className="mx-auto mt-14 grid max-w-6xl gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {benefits.map((b, i) => (
            <motion.div
              key={b.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.05 }}
              className="group rounded-2xl p-6 transition-all hover:-translate-y-0.5"
              style={{
                backgroundColor: PALETTE.card,
                border: `1px solid ${PALETTE.line}`,
                boxShadow: '0 1px 0 rgba(11, 34, 53, 0.02)',
              }}
            >
              <div
                className="inline-flex h-11 w-11 items-center justify-center rounded-xl"
                style={{ backgroundColor: b.tint, color: b.color }}
              >
                <b.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-lg font-semibold" style={{ color: PALETTE.ink }}>{b.title}</h3>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: PALETTE.inkSoft }}>{b.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function SectionEyebrow({
  icon: Icon,
  accent,
  children,
}: {
  icon: any;
  accent: SectionAccent;
  children: React.ReactNode;
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider"
      style={{ backgroundColor: accent.tint, color: accent.ink, border: `1px solid ${accent.tintBorder}` }}
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Visa Tracker preview
// ---------------------------------------------------------------------------

const mockVisas = [
  { country: 'United States', flag: '🇺🇸', type: 'B1/B2 Tourist', expires: '2029-01-14', remaining: '1,785 days', status: 'valid' as const },
  { country: 'Schengen Area', flag: '🇪🇺', type: 'Schengen Visa', expires: '2024-09-01', remaining: '45 days', status: 'expiring' as const },
  { country: 'Australia', flag: '🇦🇺', type: 'eVisitor', expires: '2024-11-19', remaining: '30 days overdue', status: 'expired' as const },
  { country: 'United Kingdom', flag: '🇬🇧', type: 'Standard Visitor', expires: '2027-02-09', remaining: '1,095 days', status: 'valid' as const },
];

function VisaTrackerPreview() {
  const [selected, setSelected] = useState(0);
  const a = SECTION.visa;
  return (
    <section id="features" className="py-20 sm:py-28" style={{ backgroundColor: PALETTE.base }}>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <SectionEyebrow icon={Globe} accent={a}>Premium Feature</SectionEyebrow>
          <h2 className="font-headline mt-4 text-3xl font-bold tracking-tight sm:text-4xl" style={{ color: PALETTE.ink }}>
            Visa tracker — never miss an expiration.
          </h2>
          <p className="mt-4 text-lg" style={{ color: PALETTE.inkSoft }}>
            Track every visa in one place. Get automatic reminders 30, 14, and 7
            days out, and stay compliant with international travel requirements.
          </p>
        </div>

        <div className="mx-auto mt-14 grid max-w-6xl gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold" style={{ color: PALETTE.ink }}>Your visas</span>
              <span className="inline-flex items-center gap-1.5" style={{ color: PALETTE.inkSoft }}>
                <Bell className="h-4 w-4" />
                Auto-reminders on
              </span>
            </div>
            {mockVisas.map((v, idx) => {
              const isSelected = selected === idx;
              const statusColor =
                v.status === 'valid'
                  ? { bg: 'rgba(5, 150, 105, 0.10)', fg: '#047857', label: 'Valid' }
                  : v.status === 'expiring'
                  ? { bg: 'rgba(234, 179, 8, 0.15)', fg: '#a16207', label: 'Expiring soon' }
                  : { bg: 'rgba(220, 38, 38, 0.10)', fg: '#b91c1c', label: 'Expired' };
              return (
                <button
                  key={v.country}
                  onClick={() => setSelected(idx)}
                  className="w-full rounded-xl p-4 text-left transition-all hover:-translate-y-0.5"
                  style={{
                    backgroundColor: PALETTE.card,
                    border: `1px solid ${isSelected ? a.primary : PALETTE.line}`,
                    boxShadow: isSelected ? `0 8px 20px -12px ${a.primary}59` : 'none',
                  }}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl leading-none">{v.flag}</span>
                      <div>
                        <div className="font-semibold" style={{ color: PALETTE.ink }}>{v.country}</div>
                        <div className="text-xs" style={{ color: PALETTE.inkSoft }}>{v.type}</div>
                      </div>
                    </div>
                    <span
                      className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                      style={{ backgroundColor: statusColor.bg, color: statusColor.fg }}
                    >
                      {statusColor.label}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 border-t pt-3 text-xs" style={{ borderColor: PALETTE.line }}>
                    <div>
                      <div className="uppercase tracking-wider" style={{ color: PALETTE.inkSoft }}>Expires</div>
                      <div className="mt-0.5 font-semibold" style={{ color: PALETTE.ink }}>{v.expires}</div>
                    </div>
                    <div>
                      <div className="uppercase tracking-wider" style={{ color: PALETTE.inkSoft }}>
                        {v.status === 'expired' ? 'Overdue' : 'Remaining'}
                      </div>
                      <div className="mt-0.5 font-semibold" style={{ color: statusColor.fg }}>{v.remaining}</div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div
            className="rounded-2xl p-6 sm:p-7"
            style={{
              backgroundColor: PALETTE.card,
              border: `1px solid ${PALETTE.line}`,
              boxShadow: '0 30px 60px -40px rgba(11, 34, 53, 0.2)',
            }}
          >
            <div className="flex items-center gap-3">
              <span className="text-4xl leading-none">{mockVisas[selected].flag}</span>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: PALETTE.inkSoft }}>
                  Visa details
                </div>
                <div className="text-xl font-bold" style={{ color: PALETTE.ink }}>{mockVisas[selected].country}</div>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-4 text-sm">
              <Field label="Visa type" value={mockVisas[selected].type} />
              <Field label="Expiry date" value={mockVisas[selected].expires} />
              <Field label="Entry type" value="Multiple entry" />
              <Field label="Max stay" value="6 months" />
            </div>

            <div
              className="mt-6 flex items-start gap-3 rounded-xl p-4"
              style={{ backgroundColor: a.tint, border: `1px solid ${a.tintBorder}` }}
            >
              <Bell className="mt-0.5 h-4 w-4 flex-shrink-0" style={{ color: a.primary }} />
              <p className="text-sm" style={{ color: PALETTE.inkSoft }}>
                We'll email and push-notify you <strong style={{ color: PALETTE.ink }}>30, 14, and 7 days</strong> before
                this visa expires, so you always have time to renew.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider" style={{ color: PALETTE.inkSoft }}>{label}</div>
      <div className="mt-1 font-semibold" style={{ color: PALETTE.ink }}>{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AI Scanner promo (Beta)
// ---------------------------------------------------------------------------

function AIScannerPromo() {
  const a = SECTION.scanner;
  return (
    <section id="scanner" className="py-20 sm:py-28" style={{ backgroundColor: PALETTE.raised }}>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider"
                style={{ backgroundColor: a.tint, color: a.ink, border: `1px solid ${a.tintBorder}` }}
              >
                <Sparkles className="h-3.5 w-3.5" />
                AI-Powered
              </span>
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wider"
                style={{ backgroundColor: 'rgba(180, 83, 9, 0.10)', color: PALETTE.warm, border: '1px solid rgba(180, 83, 9, 0.2)' }}
              >
                <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ backgroundColor: PALETTE.warm }} />
                Beta
              </span>
            </div>

            <h2 className="font-headline mt-5 text-3xl font-bold tracking-tight sm:text-4xl" style={{ color: PALETTE.ink }}>
              Scan any form. Fill it with your{' '}
              <span className="bg-clip-text text-transparent" style={{ backgroundImage: gradient(a) }}>
                vessel &amp; crew data
              </span>
              .
            </h2>

            <p className="mt-3 text-sm" style={{ color: PALETTE.warm }}>
              This feature is in active beta — expect rapid improvements. Auto-fill
              accuracy and overlay positioning are still being refined.
            </p>

            <p className="mt-4 text-base leading-relaxed" style={{ color: PALETTE.inkSoft }}>
              Upload any MCA, AMSA, USCG, or discharge-book form. Our scanner
              extracts every field and bounding box, matches it to your profile,
              vessel, and crew data, and pre-fills the document — ready to review,
              overlay on the original, and submit.
            </p>

            <ul className="mt-6 space-y-2.5 text-sm" style={{ color: PALETTE.ink }}>
              <BulletLine color={a.secondary}>Exhaustive field + table extraction via vision AI</BulletLine>
              <BulletLine color={a.secondary}>Smart alias matching for dates, names, discharge book #</BulletLine>
              <BulletLine color={a.secondary}>Saveable scan templates with manual box adjustments</BulletLine>
              <BulletLine color={a.secondary}>Visual overlay of extracted data on the original PDF</BulletLine>
            </ul>

            <div className="mt-7 flex flex-wrap gap-3">
              <Button asChild className="h-11 rounded-xl text-white" style={{ backgroundImage: gradient(a) }}>
                <Link href="/dashboard/documents">Try the scanner</Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className="h-11 rounded-xl border-2"
                style={{ borderColor: PALETTE.line, color: PALETTE.ink, backgroundColor: 'white' }}
              >
                <Link href="#pricing">See pricing</Link>
              </Button>
            </div>
          </div>

          <ScannerMockup accent={a} />
        </div>
      </div>
    </section>
  );
}

function BulletLine({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <li className="flex items-start gap-2.5">
      <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" style={{ color: color ?? '#059669' }} />
      <span>{children}</span>
    </li>
  );
}

function ScannerMockup({ accent }: { accent: SectionAccent }) {
  // Simulated scanner result card.
  const fields = [
    { label: 'Full name', value: 'Gino Sesia', ok: true },
    { label: 'Date of birth', value: '15 Mar 1996', ok: true },
    { label: 'Discharge book #', value: 'GB-SJ-00483291', ok: true },
    { label: 'Nationality', value: 'United Kingdom', ok: true },
    { label: 'Standby days', value: '42', ok: true },
    { label: 'Sea service (MCA)', value: '312 days', ok: true },
  ];
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
      className="rounded-3xl p-3"
      style={{
        backgroundColor: 'rgba(255, 255, 255, 0.7)',
        border: `1px solid ${PALETTE.line}`,
        boxShadow: '0 30px 80px -40px rgba(11, 34, 53, 0.25)',
      }}
    >
      <div className="rounded-2xl" style={{ backgroundColor: 'white', border: `1px solid ${PALETTE.line}` }}>
        <div className="flex items-center justify-between border-b px-5 py-3" style={{ borderColor: PALETTE.line }}>
          <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: PALETTE.ink }}>
            <ScanSearch className="h-4 w-4" style={{ color: accent.primary }} />
            AMSA_Form_771.pdf
          </div>
          <span
            className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
            style={{ backgroundColor: 'rgba(5, 150, 105, 0.1)', color: '#047857' }}
          >
            6 / 6 fields matched
          </span>
        </div>
        <div className="divide-y" style={{ borderColor: PALETTE.line }}>
          {fields.map((f) => (
            <div key={f.label} className="flex items-center justify-between px-5 py-3">
              <div className="text-xs font-medium uppercase tracking-wider" style={{ color: PALETTE.inkSoft }}>
                {f.label}
              </div>
              <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: PALETTE.ink }}>
                {f.value}
                <CheckCircle2 className="h-3.5 w-3.5" style={{ color: accent.secondary }} />
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between gap-3 border-t px-5 py-3" style={{ borderColor: PALETTE.line }}>
          <span className="text-xs" style={{ color: PALETTE.inkSoft }}>
            Source: crew profile · vessel data · sea-time logs
          </span>
          <span
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold"
            style={{ backgroundColor: PALETTE.raised, color: PALETTE.ink }}
          >
            <Download className="h-3 w-3" />
            Download filled
          </span>
        </div>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Official Forms
// ---------------------------------------------------------------------------

const forms = [
  { code: 'MCA', name: 'Testimonial of Sea Service', country: 'UK' },
  { code: 'MCA', name: 'Application for Certificate of Competency', country: 'UK' },
  { code: 'AMSA', name: 'Form 771 — Sea Service', country: 'AU' },
  { code: 'USCG', name: 'Sea Service Form CG-719S', country: 'US' },
  { code: 'RYA', name: 'Mileage Log / Skipper\'s Assessment', country: 'UK' },
  { code: 'ENG1', name: 'Medical Certificate Tracker', country: 'Global' },
];

// Agency badge colors — each maritime authority gets its own recognisable hue.
const AGENCY_COLORS: Record<string, { tint: string; fg: string }> = {
  MCA:    { tint: 'rgba(37, 99, 235, 0.10)',  fg: '#1d4ed8' }, // UK — blue
  AMSA:   { tint: 'rgba(5, 150, 105, 0.10)',  fg: '#047857' }, // AU — green
  USCG:   { tint: 'rgba(220, 38, 38, 0.10)',  fg: '#b91c1c' }, // US — red
  RYA:    { tint: 'rgba(139, 92, 246, 0.10)', fg: '#6d28d9' }, // purple
  ENG1:   { tint: 'rgba(217, 119, 6, 0.12)',  fg: '#b45309' }, // amber
};

function OfficialForms() {
  const a = SECTION.forms;
  return (
    <section id="forms" className="py-20 sm:py-28" style={{ backgroundColor: PALETTE.base }}>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <SectionEyebrow icon={FileText} accent={a}>Official Forms</SectionEyebrow>
          <h2 className="font-headline mt-4 text-3xl font-bold tracking-tight sm:text-4xl" style={{ color: PALETTE.ink }}>
            Pre-filled, ready to submit.
          </h2>
          <p className="mt-4 text-lg" style={{ color: PALETTE.inkSoft }}>
            SeaJourney generates the forms maritime authorities actually ask for —
            with your profile, vessel data, and sea-time calculations already filled in.
          </p>
        </div>

        <div className="mx-auto mt-12 grid max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {forms.map((f) => {
            const badge = AGENCY_COLORS[f.code] ?? { tint: a.tint, fg: a.ink };
            return (
              <div
                key={`${f.code}-${f.name}`}
                className="group rounded-2xl p-5 transition-all hover:-translate-y-0.5"
                style={{ backgroundColor: PALETTE.card, border: `1px solid ${PALETTE.line}` }}
              >
                <div className="flex items-start justify-between">
                  <span
                    className="rounded-md px-2 py-1 text-[11px] font-bold uppercase tracking-wider"
                    style={{ backgroundColor: badge.tint, color: badge.fg }}
                  >
                    {f.code}
                  </span>
                  <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: PALETTE.inkSoft }}>
                    {f.country}
                  </span>
                </div>
                <h3 className="mt-3 text-base font-semibold" style={{ color: PALETTE.ink }}>{f.name}</h3>
                <div
                  className="mt-4 inline-flex items-center gap-1 text-sm font-medium"
                  style={{ color: a.primary }}
                >
                  Pre-fill & export
                  <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Certificate Tracking
// ---------------------------------------------------------------------------

function CertificateTracking() {
  const a = SECTION.certs;
  const certs = [
    { name: 'STCW Basic Safety', expires: 'Aug 2027', status: 'Valid' as const },
    { name: 'ENG1 Medical', expires: 'Nov 2025', status: 'Renewing' as const },
    { name: 'PDSD', expires: 'Jun 2028', status: 'Valid' as const },
    { name: 'RYA Yachtmaster', expires: '—', status: 'Lifetime' as const },
  ];
  const color: Record<typeof certs[number]['status'], { bg: string; fg: string }> = {
    Valid: { bg: 'rgba(5, 150, 105, 0.10)', fg: '#047857' },
    Renewing: { bg: 'rgba(234, 179, 8, 0.15)', fg: '#a16207' },
    Lifetime: { bg: a.tint, fg: a.ink },
  };
  return (
    <section className="py-20 sm:py-28" style={{ backgroundColor: PALETTE.raised }}>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <SectionEyebrow icon={Award} accent={a}>Certificates</SectionEyebrow>
            <h2 className="font-headline mt-4 text-3xl font-bold tracking-tight sm:text-4xl" style={{ color: PALETTE.ink }}>
              Every certificate in one place.
            </h2>
            <p className="mt-4 text-lg" style={{ color: PALETTE.inkSoft }}>
              Upload your STCW, ENG1, PDSD, and country-specific certifications.
              SeaJourney tracks expirations, reminds you to renew, and keeps a
              verified copy ready for any submission.
            </p>
            <div className="mt-6 flex flex-wrap gap-3 text-sm" style={{ color: PALETTE.inkSoft }}>
              <TrustPill icon={Bell} label="Renewal reminders" color={a.primary} />
              <TrustPill icon={ShieldCheck} label="Verified copies" color={a.primary} />
              <TrustPill icon={Download} label="One-click export" color={a.primary} />
            </div>
          </div>

          <div
            className="rounded-2xl p-3"
            style={{ backgroundColor: 'rgba(255, 255, 255, 0.7)', border: `1px solid ${PALETTE.line}` }}
          >
            <div className="rounded-xl" style={{ backgroundColor: 'white', border: `1px solid ${PALETTE.line}` }}>
              <div className="flex items-center justify-between border-b px-5 py-3" style={{ borderColor: PALETTE.line }}>
                <span className="text-sm font-semibold" style={{ color: PALETTE.ink }}>Your certificates</span>
                <span className="text-xs" style={{ color: PALETTE.inkSoft }}>4 active</span>
              </div>
              {certs.map((c) => (
                <div key={c.name} className="flex items-center justify-between border-b px-5 py-4 last:border-b-0" style={{ borderColor: PALETTE.line }}>
                  <div>
                    <div className="text-sm font-semibold" style={{ color: PALETTE.ink }}>{c.name}</div>
                    <div className="text-xs" style={{ color: PALETTE.inkSoft }}>Expires {c.expires}</div>
                  </div>
                  <span
                    className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                    style={{ backgroundColor: color[c.status].bg, color: color[c.status].fg }}
                  >
                    {c.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Watch Coming Soon
// ---------------------------------------------------------------------------

function WatchComingSoon() {
  const a = SECTION.watch;
  return (
    <section className="py-20 sm:py-28" style={{ backgroundColor: PALETTE.base }}>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div
          className="mx-auto max-w-5xl overflow-hidden rounded-3xl p-10 sm:p-14"
          style={{
            background: `linear-gradient(135deg, ${PALETTE.card} 0%, ${PALETTE.raised} 100%)`,
            border: `1px solid ${PALETTE.line}`,
          }}
        >
          <div className="grid gap-10 lg:grid-cols-[1.3fr_1fr] lg:items-center">
            <div>
              <SectionEyebrow icon={WatchIcon} accent={a}>Coming soon</SectionEyebrow>
              <h2 className="font-headline mt-4 text-3xl font-bold tracking-tight sm:text-4xl" style={{ color: PALETTE.ink }}>
                Apple Watch companion.
              </h2>
              <p className="mt-4 text-lg" style={{ color: PALETTE.inkSoft }}>
                Change vessel state from your wrist. Start and stop watches with a
                tap. Get alerts when your state log goes stale — without breaking
                out your phone on the bridge.
              </p>
              <div className="mt-6">
                <Button
                  asChild
                  variant="outline"
                  className="h-11 rounded-xl border-2"
                  style={{ borderColor: PALETTE.line, color: PALETTE.ink, backgroundColor: 'white' }}
                >
                  <Link href="#android">Join the waitlist</Link>
                </Button>
              </div>
            </div>
            <div className="relative flex justify-center">
              <div
                className="relative h-56 w-56 rounded-[3rem] p-2"
                style={{
                  backgroundColor: PALETTE.ink,
                  boxShadow: '0 30px 60px -20px rgba(11, 34, 53, 0.35)',
                }}
              >
                <div
                  className="h-full w-full rounded-[2.5rem] p-3"
                  style={{ backgroundColor: '#000' }}
                >
                  <div className="flex h-full flex-col justify-between text-white">
                    <div className="flex items-center justify-between text-[10px] font-semibold">
                      <span>09:42</span>
                      <span style={{ color: '#34d399' }}>● Live</span>
                    </div>
                    <div className="text-center">
                      <div className="text-[10px] uppercase tracking-widest opacity-60">Current state</div>
                      <div className="mt-1 text-lg font-bold">Underway</div>
                    </div>
                    <div className="grid grid-cols-2 gap-1 text-[10px]">
                      <div className="rounded-lg bg-white/10 px-2 py-1.5 text-center">Anchor</div>
                      <div className="rounded-lg bg-white/10 px-2 py-1.5 text-center">Port</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// AIS Import
// ---------------------------------------------------------------------------

function AISImport() {
  const a = SECTION.ais;
  return (
    <section className="py-20 sm:py-28" style={{ backgroundColor: PALETTE.raised }}>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <SectionEyebrow icon={Radio} accent={a}>Pro Feature</SectionEyebrow>
          <h2 className="font-headline mt-4 text-3xl font-bold tracking-tight sm:text-4xl" style={{ color: PALETTE.ink }}>
            AIS auto-tracking for your vessel.
          </h2>
          <p className="mt-4 text-lg" style={{ color: PALETTE.inkSoft }}>
            Let SeaJourney listen to your vessel's AIS feed. States update
            automatically — underway, at anchor, in port — and your sea time log
            stays accurate without lifting a finger.
          </p>
        </div>

        <div className="mx-auto mt-12 grid max-w-5xl gap-5 sm:grid-cols-3">
          <AISCard accent={a} icon={Radar} title="Real-time position" desc="Continuous AIS polling keeps your vessel state fresh, even offshore." />
          <AISCard accent={a} icon={Compass} title="Smart state detection" desc="Speed and heading are translated into vessel states you can override anytime." />
          <AISCard accent={a} icon={ShieldCheck} title="Verified by AIS" desc="MCA and AMSA reviewers trust AIS-backed sea time — no more 'whose word is it'." />
        </div>
      </div>
    </section>
  );
}

function AISCard({
  icon: Icon,
  title,
  desc,
  accent,
}: {
  icon: any;
  title: string;
  desc: string;
  accent: SectionAccent;
}) {
  return (
    <div
      className="rounded-2xl p-6"
      style={{ backgroundColor: PALETTE.card, border: `1px solid ${PALETTE.line}` }}
    >
      <div
        className="inline-flex h-11 w-11 items-center justify-center rounded-xl"
        style={{ backgroundColor: accent.tint, color: accent.primary }}
      >
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="mt-4 font-semibold" style={{ color: PALETTE.ink }}>{title}</h3>
      <p className="mt-2 text-sm leading-relaxed" style={{ color: PALETTE.inkSoft }}>{desc}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Verification CTA
// ---------------------------------------------------------------------------

function VerificationCTA() {
  const a = SECTION.verify;
  return (
    <section className="py-20 sm:py-28" style={{ backgroundColor: PALETTE.base }}>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div
          className="mx-auto flex max-w-4xl flex-col items-center gap-6 rounded-3xl p-10 text-center sm:p-14"
          style={{
            background: `linear-gradient(135deg, ${a.tint} 0%, rgba(16, 185, 129, 0.08) 100%)`,
            border: `1px solid ${PALETTE.line}`,
          }}
        >
          <SectionEyebrow icon={ShieldCheck} accent={a}>For Officials</SectionEyebrow>
          <h2 className="font-headline text-3xl font-bold tracking-tight sm:text-4xl" style={{ color: PALETTE.ink }}>
            Verify a seafarer's record in seconds.
          </h2>
          <p className="max-w-2xl text-lg" style={{ color: PALETTE.inkSoft }}>
            MCA, AMSA, USCG and recruitment agents can verify digital testimonials,
            sea-service records, and captain sign-offs using a single secure link.
            No paperwork. No back-and-forth. Instant authenticity.
          </p>
          <Button asChild className="h-11 rounded-xl text-white" style={{ backgroundImage: gradient(a) }}>
            <Link href="/verify">
              Verify records
              <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

// Each plan gets its own hue so the pricing row feels colorful, not uniform.
const crewPlans: Array<{
  name: string;
  price: string;
  suffix: string;
  desc: string;
  features: string[];
  icon: any;
  highlight: boolean;
  badge?: string;
  color: string;
  secondary: string;
  tint: string;
}> = [
  {
    name: 'Crew Standard',
    price: '£4.99',
    suffix: '/ month',
    desc: 'Essential sea time tracking for maritime professionals.',
    features: [
      'Unlimited sea time logging',
      'Up to 3 vessels',
      'MCA compliant calculations',
      'PDF testimonial exports',
      'Direct digital sign-offs',
    ],
    icon: ShieldCheck,
    highlight: false,
    color: '#2563eb',
    secondary: '#0ea5e9',
    tint: 'rgba(37, 99, 235, 0.10)',
  },
  {
    name: 'Crew Premium',
    price: '£9.99',
    suffix: '/ month',
    desc: 'Advanced logging and documentation for career progression.',
    features: [
      'All Crew Standard features',
      'Unlimited vessels',
      'Passage log book',
      'Bridge watch log book',
      'Export to Excel / CSV',
      'Visa tracker',
      'Request sea time',
    ],
    icon: Zap,
    highlight: true,
    color: '#8b5cf6',
    secondary: '#ec4899',
    tint: 'rgba(139, 92, 246, 0.10)',
  },
  {
    name: 'Crew Professional',
    price: '£14.99',
    suffix: '/ month',
    desc: 'Complete maritime career management and certification tracking.',
    features: [
      'All Crew Premium features',
      'Advanced analytics',
      'GPS passage tracking',
      'AIS state auto-tracking (add-on)',
      'Direct MCA submissions',
    ],
    icon: TrendingUp,
    highlight: false,
    badge: 'Coming 2026',
    color: '#059669',
    secondary: '#0d9488',
    tint: 'rgba(5, 150, 105, 0.10)',
  },
];

function Pricing() {
  const a = SECTION.pricing;
  return (
    <section id="pricing" className="py-20 sm:py-28" style={{ backgroundColor: PALETTE.raised }}>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <SectionEyebrow icon={Star} accent={a}>Pricing</SectionEyebrow>
          <h2 className="font-headline mt-4 text-3xl font-bold tracking-tight sm:text-4xl" style={{ color: PALETTE.ink }}>
            Start free. Upgrade when you need more.
          </h2>
          <p className="mt-4 text-lg" style={{ color: PALETTE.inkSoft }}>
            Every plan includes the iOS app, web portal, and unlimited sea-time
            logging. Cancel or change plans anytime.
          </p>
        </div>

        <div className="mx-auto mt-14 grid max-w-6xl gap-5 lg:grid-cols-3">
          {crewPlans.map((p) => (
            <div
              key={p.name}
              className={cn('relative flex flex-col rounded-2xl p-7 transition-all')}
              style={{
                backgroundColor: PALETTE.card,
                border: `${p.highlight ? '2px' : '1px'} solid ${p.highlight ? p.color : PALETTE.line}`,
                boxShadow: p.highlight ? `0 30px 80px -40px ${p.color}59` : 'none',
                transform: p.highlight ? 'translateY(-4px)' : undefined,
              }}
            >
              {p.highlight && (
                <span
                  className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white"
                  style={{ backgroundImage: `linear-gradient(135deg, ${p.color} 0%, ${p.secondary} 100%)` }}
                >
                  Most popular
                </span>
              )}
              <div className="flex items-center gap-3">
                <div
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl"
                  style={{ backgroundColor: p.tint, color: p.color }}
                >
                  <p.icon className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-xl font-bold" style={{ color: PALETTE.ink }}>{p.name}</div>
                  {p.badge && (
                    <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: PALETTE.warm }}>
                      {p.badge}
                    </div>
                  )}
                </div>
              </div>
              <p className="mt-3 text-sm" style={{ color: PALETTE.inkSoft }}>{p.desc}</p>
              <div className="mt-4 flex items-baseline gap-1.5">
                <span className="text-4xl font-bold" style={{ color: PALETTE.ink }}>{p.price}</span>
                <span className="text-sm" style={{ color: PALETTE.inkSoft }}>{p.suffix}</span>
              </div>
              <ul className="mt-6 space-y-2.5 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5" style={{ color: PALETTE.ink }}>
                    <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" style={{ color: p.color }} />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-auto pt-7">
                <Button
                  asChild
                  className={cn('w-full h-11 rounded-xl', p.highlight ? 'text-white' : '')}
                  variant={p.highlight ? 'default' : 'outline'}
                  style={
                    p.highlight
                      ? { backgroundImage: `linear-gradient(135deg, ${p.color} 0%, ${p.secondary} 100%)` }
                      : { borderColor: PALETTE.line, color: PALETTE.ink, backgroundColor: 'white' }
                  }
                >
                  <Link href="/signup">Get started</Link>
                </Button>
              </div>
            </div>
          ))}
        </div>

        <p className="mt-10 text-center text-sm" style={{ color: PALETTE.inkSoft }}>
          Managing a fleet? Vessel plans start at £24.99 / month.{' '}
          <Link href="/pricing" className="font-semibold underline" style={{ color: a.primary }}>
            See vessel plans
          </Link>
        </p>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Android Signup
// ---------------------------------------------------------------------------

function AndroidSignup() {
  return (
    <section id="android" className="py-16" style={{ backgroundColor: PALETTE.base }}>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div
          className="mx-auto flex max-w-3xl flex-col items-center gap-4 rounded-2xl p-8 text-center"
          style={{ backgroundColor: PALETTE.card, border: `1px solid ${PALETTE.line}` }}
        >
          <div
            className="inline-flex h-12 w-12 items-center justify-center rounded-xl"
            style={{ backgroundColor: 'rgba(5, 150, 105, 0.10)', color: '#047857' }}
          >
            <Smartphone className="h-5 w-5" />
          </div>
          <h3 className="text-xl font-bold" style={{ color: PALETTE.ink }}>Android tester signup</h3>
          <p className="max-w-xl text-sm" style={{ color: PALETTE.inkSoft }}>
            We're rolling out our Android beta. Join the tester program and be
            among the first crew to run SeaJourney on Pixel, Samsung, and more.
          </p>
          <Button
            asChild
            variant="outline"
            className="rounded-xl border-2"
            style={{ borderColor: PALETTE.line, color: PALETTE.ink, backgroundColor: 'white' }}
          >
            <Link href="mailto:hello@seajourneyapp.com?subject=Android%20beta%20tester">
              Join the beta
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------

function LightFooter() {
  return (
    <footer style={{ backgroundColor: PALETTE.raised, borderTop: `1px solid ${PALETTE.line}` }}>
      <div className="container mx-auto px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
          <div>
            <Logo className="!text-[#0b2235]" />
            <p className="mt-4 max-w-xs text-sm" style={{ color: PALETTE.inkSoft }}>
              The essential app for yacht crew and maritime professionals.
            </p>
            <div className="mt-4 flex gap-4">
              {[Facebook, Twitter, Instagram].map((Icon, i) => (
                <Link key={i} href="#" aria-label="Social">
                  <Icon className="h-5 w-5 transition-colors hover:opacity-70" style={{ color: PALETTE.inkSoft }} />
                </Link>
              ))}
            </div>
          </div>
          <FooterCol
            title="Explore"
            links={[
              { href: '/how-to-use', label: 'Guide' },
              { href: '/roadmap', label: 'Roadmap' },
            ]}
          />
          <FooterCol
            title="Company"
            links={[
              { href: '/faq', label: 'FAQ' },
              { href: '/privacy-policy', label: 'Privacy Policy' },
              { href: '/terms-of-service', label: 'Terms of Service' },
              { href: '/cookie-policy', label: 'Cookie Policy' },
            ]}
          />
          <FooterCol
            title="Officials"
            links={[{ href: '/verify', label: 'Verify records' }]}
          />
        </div>
        <div
          className="mt-10 flex flex-col items-center justify-between gap-3 border-t pt-6 text-xs sm:flex-row"
          style={{ borderColor: PALETTE.line, color: PALETTE.inkSoft }}
        >
          <p>&copy; {new Date().getFullYear()} SeaJourney. All rights reserved.</p>
          <Link href="/" className="font-semibold" style={{ color: SECTION.hero.primary }}>
            View dark theme →
          </Link>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: Array<{ href: string; label: string }> }) {
  return (
    <div>
      <h4 className="font-headline text-sm font-bold uppercase tracking-wider" style={{ color: SECTION.hero.primary }}>
        {title}
      </h4>
      <ul className="mt-4 space-y-2 text-sm">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="transition-colors hover:opacity-70" style={{ color: PALETTE.inkSoft }}>
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
