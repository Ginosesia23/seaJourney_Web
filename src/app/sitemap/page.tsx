'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Award,
  Calendar,
  Compass,
  FileText,
  HelpCircle,
  KeyRound,
  LayoutDashboard,
  Map,
  Route,
  Search,
  Shield,
  Ship,
} from 'lucide-react';
import {
  WkPageShell,
  WkPageHero,
} from '@/components/wk/wk-page-shell';
import { cn } from '@/lib/utils';

type SitemapLink = {
  href: string;
  label: string;
  description?: string;
  /** Requires an authenticated session */
  signedIn?: boolean;
};

type SitemapSection = {
  id: string;
  title: string;
  blurb: string;
  icon: React.ComponentType<{ className?: string }>;
  links: SitemapLink[];
};

const SITEMAP_SECTIONS: SitemapSection[] = [
  {
    id: 'explore',
    title: 'Explore',
    blurb: 'Public marketing and product pages.',
    icon: Compass,
    links: [
      { href: '/', label: 'Home', description: 'Main landing page' },
      { href: '/how-to-use', label: 'How it works', description: 'Guide to using SeaJourney' },
      { href: '/voyage-map', label: 'Voyage map', description: 'Sample AIS passage tracks on a world map' },
      { href: '/for-vessels', label: 'For vessels', description: 'Vessel features, AIS, and crew management' },
      { href: '/offers', label: 'Plans & pricing', description: 'Crew and vessel subscription plans' },
      { href: '/roadmap', label: 'Roadmap', description: 'Shipped, in progress, and planned work' },
      { href: '/request-demo', label: 'Request a demo', description: 'Talk to us about SeaJourney for your fleet' },
      { href: '/faq', label: 'FAQ', description: 'Common questions about the platform' },
      { href: '/shop', label: 'Shop', description: 'SeaJourney merch and storefront' },
      { href: '/sitemap', label: 'Sitemap', description: 'This page' },
    ],
  },
  {
    id: 'verification',
    title: 'Verification',
    blurb: 'Tools for officials and record checks.',
    icon: Shield,
    links: [
      { href: '/verify', label: 'Verify records', description: 'Look up and verify sea-time documentation' },
      { href: '/verify/result', label: 'Verification result', description: 'Outcome of a verification lookup' },
      { href: '/how-verification-works', label: 'How verification works', description: 'Overview of the verification model' },
      { href: '/verification-process', label: 'Verification process', description: 'Step-by-step verification flow' },
      { href: '/testimonials/signoff', label: 'Testimonial sign-off', description: 'Captain / officer digital sign-off link' },
      { href: '/documents/view', label: 'View document', description: 'Shared document viewing link' },
    ],
  },
  {
    id: 'account',
    title: 'Account',
    blurb: 'Sign in, registration, and account recovery.',
    icon: KeyRound,
    links: [
      { href: '/login', label: 'Log in' },
      { href: '/signup', label: 'Sign up — crew' },
      { href: '/signup/vessel', label: 'Sign up — vessel' },
      { href: '/forgot-password', label: 'Forgot password' },
      { href: '/reset-password', label: 'Reset password' },
      { href: '/payment-success', label: 'Payment success', description: 'Confirmation after checkout' },
    ],
  },
  {
    id: 'dashboard-overview',
    title: 'Dashboard — overview',
    blurb: 'Signed-in home and account surfaces.',
    icon: LayoutDashboard,
    links: [
      { href: '/dashboard', label: 'Home', description: 'Signed-in dashboard summary', signedIn: true },
      { href: '/dashboard/inbox', label: 'Inbox', description: 'Incoming requests and sent items awaiting response', signedIn: true },
      { href: '/dashboard/profile', label: 'Profile', description: 'Account and vessel profile settings', signedIn: true },
      { href: '/dashboard/subscription', label: 'Subscription', description: 'Plan and billing status', signedIn: true },
      { href: '/dashboard/feedback', label: 'Feedback', description: 'Send feedback to SeaJourney', signedIn: true },
    ],
  },
  {
    id: 'sea-time',
    title: 'Sea time',
    blurb: 'Daily logging, calendar, and exports.',
    icon: Calendar,
    links: [
      { href: '/dashboard/current', label: 'Daily log', description: 'Log today’s vessel state and activity', signedIn: true },
      { href: '/dashboard/calendar', label: 'Calendar', description: 'Month view of vessel states', signedIn: true },
      { href: '/dashboard/vessel-history', label: 'Past vessels', description: 'Assignment history across vessels', signedIn: true },
      { href: '/dashboard/sea-time-request', label: 'Request access', description: 'Ask a vessel for sea-time access', signedIn: true },
      { href: '/dashboard/export', label: 'Export reports', description: 'Download sea-time and report PDFs', signedIn: true },
      { href: '/dashboard/calculations', label: 'Calculations', description: 'Sea-time calculation helpers', signedIn: true },
    ],
  },
  {
    id: 'voyages',
    title: 'Voyages & AIS',
    blurb: 'Passages, tracks, watch logs, and AIS tools.',
    icon: Route,
    links: [
      { href: '/dashboard/passage-logbook', label: 'Passage log', description: 'Documentary voyage logbook', signedIn: true },
      { href: '/dashboard/passages-map', label: 'Passage tracks', description: 'AIS passage map across vessels', signedIn: true },
      { href: '/dashboard/bridge-watch-log', label: 'Bridge watch', description: 'Bridge watch hours log', signedIn: true },
      { href: '/dashboard/visa-tracker', label: 'Visa tracker', description: 'Schengen / visa day tracking', signedIn: true },
      { href: '/dashboard/ais-import', label: 'AIS history', description: 'Import historical AIS into the calendar', signedIn: true },
      { href: '/dashboard/world-map', label: 'World map', description: 'Map overview in the dashboard', signedIn: true },
    ],
  },
  {
    id: 'career',
    title: 'Career & documents',
    blurb: 'Career documents, tickets, certificates, and watch roster.',
    icon: Award,
    links: [
      { href: '/dashboard/career-documents', label: 'Career documents', description: 'Testimonials, proof of service, and vessel-issued docs', signedIn: true },
      { href: '/dashboard/apply', label: 'Apply for tickets', description: 'Certificate / ticket application templates', signedIn: true },
      { href: '/dashboard/certificates', label: 'Certificates', description: 'Certificate vault', signedIn: true },
      { href: '/dashboard/my-watch-schedule', label: 'My watch roster', description: 'Personal watch schedule view', signedIn: true },
      { href: '/dashboard/settings/signature', label: 'Signature', description: 'Digital signature for captains', signedIn: true },
    ],
  },
  {
    id: 'vessel',
    title: 'Vessel tools',
    blurb: 'Management surfaces for vessel accounts.',
    icon: Ship,
    links: [
      { href: '/dashboard/vessels', label: 'My vessels', description: 'Vessels you manage or belong to', signedIn: true },
      { href: '/dashboard/crew', label: 'Manage crew', description: 'Active and past crew on your vessel', signedIn: true },
      { href: '/dashboard/watch-schedule', label: 'Nav Watch', description: 'Build and publish watch schedules', signedIn: true },
      { href: '/dashboard/crew-rotation', label: 'Onboard crew', description: 'Who is onboard and rotation status', signedIn: true },
      { href: '/dashboard/documents', label: 'Document generator', description: 'Vessel form builder / docs', signedIn: true },
      { href: '/dashboard/vessel-roles', label: 'Team accounts', description: 'Linked captain / officer accounts', signedIn: true },
      { href: '/dashboard/requests', label: 'Sea-time requests', description: 'Incoming crew access requests', signedIn: true },
    ],
  },
  {
    id: 'legal',
    title: 'Legal',
    blurb: 'Policies and terms.',
    icon: FileText,
    links: [
      { href: '/privacy-policy', label: 'Privacy Policy' },
      { href: '/terms-of-service', label: 'Terms of Service' },
      { href: '/cookie-policy', label: 'Cookie Policy' },
    ],
  },
];

function countLinks(sections: SitemapSection[]) {
  return sections.reduce((n, s) => n + s.links.length, 0);
}

export default function SitemapPage() {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();

  const filteredSections = useMemo(() => {
    if (!q) return SITEMAP_SECTIONS;
    return SITEMAP_SECTIONS.map((section) => ({
      ...section,
      links: section.links.filter((link) => {
        const hay = `${link.label} ${link.description || ''} ${link.href}`.toLowerCase();
        return hay.includes(q);
      }),
    })).filter((section) => section.links.length > 0);
  }, [q]);

  const totalVisible = countLinks(filteredSections);
  const totalAll = countLinks(SITEMAP_SECTIONS);

  return (
    <WkPageShell>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            .sj-sitemap-link {
              display: grid;
              grid-template-columns: minmax(0, 1fr) auto;
              gap: 12px 16px;
              align-items: center;
              padding: 14px 16px;
              border-radius: 14px;
              border: 1px solid transparent;
              transition: background-color 0.15s ease, border-color 0.15s ease, transform 0.15s ease;
            }
            .sj-sitemap-link:hover {
              background-color: var(--wk-bg-subtle);
              border-color: var(--wk-line);
            }
            .sj-sitemap-link:hover .sj-sitemap-arrow {
              color: var(--wk-accent);
              transform: translateX(2px);
            }
            .sj-sitemap-arrow {
              transition: transform 0.15s ease, color 0.15s ease;
              color: var(--wk-text-muted);
            }
            .sj-sitemap-toc a:hover {
              color: var(--wk-accent) !important;
              background-color: var(--wk-accent-soft);
            }
          `,
        }}
      />

      <WkPageHero
        eyebrow="Directory"
        icon={<Map className="h-7 w-7" />}
        title="Sitemap"
        description="Browse every public page and the main signed-in areas of SeaJourney."
        meta={`${totalAll} links across ${SITEMAP_SECTIONS.length} sections`}
      />

      <section className="pb-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            {/* Search */}
            <div
              className="mb-8 flex flex-col gap-3 rounded-2xl border p-3 sm:flex-row sm:items-center sm:gap-4 sm:p-4"
              style={{
                backgroundColor: 'var(--wk-card)',
                borderColor: 'var(--wk-line)',
                boxShadow: 'var(--wk-shadow-sm)',
              }}
            >
              <div className="relative flex-1">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
                  style={{ color: 'var(--wk-text-muted)' }}
                />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search pages by name, path, or description…"
                  className="h-11 w-full rounded-xl border bg-transparent pl-10 pr-3 text-sm outline-none focus:ring-2"
                  style={{
                    borderColor: 'var(--wk-line)',
                    color: 'var(--wk-text)',
                  }}
                />
              </div>
              <p className="shrink-0 px-1 text-xs sm:px-0" style={{ color: 'var(--wk-text-muted)' }}>
                Showing {totalVisible} of {totalAll}
              </p>
            </div>

            <div className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-10">
              {/* TOC */}
              <aside className="lg:sticky lg:top-24 lg:self-start">
                <p
                  className="mb-3 text-[11px] font-bold uppercase tracking-widest"
                  style={{ color: 'var(--wk-accent)' }}
                >
                  Jump to
                </p>
                <nav className="sj-sitemap-toc flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
                  {SITEMAP_SECTIONS.map((section) => {
                    const Icon = section.icon;
                    const matchCount = filteredSections.find((s) => s.id === section.id)?.links.length;
                    const dimmed = q.length > 0 && !matchCount;
                    return (
                      <a
                        key={section.id}
                        href={`#${section.id}`}
                        className={cn(
                          'inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors',
                          dimmed && 'opacity-40',
                        )}
                        style={{ color: 'var(--wk-text-soft)' }}
                      >
                        <Icon className="h-3.5 w-3.5 opacity-70" />
                        <span className="whitespace-nowrap">{section.title}</span>
                      </a>
                    );
                  })}
                </nav>
              </aside>

              {/* Sections */}
              <div className="space-y-6">
                {filteredSections.length === 0 ? (
                  <div
                    className="rounded-2xl border px-6 py-16 text-center"
                    style={{
                      backgroundColor: 'var(--wk-card)',
                      borderColor: 'var(--wk-line)',
                    }}
                  >
                    <HelpCircle
                      className="mx-auto mb-3 h-8 w-8"
                      style={{ color: 'var(--wk-text-muted)' }}
                    />
                    <p className="text-sm font-medium" style={{ color: 'var(--wk-text)' }}>
                      No pages match “{query.trim()}”
                    </p>
                    <button
                      type="button"
                      className="mt-3 text-sm font-medium"
                      style={{ color: 'var(--wk-accent)' }}
                      onClick={() => setQuery('')}
                    >
                      Clear search
                    </button>
                  </div>
                ) : (
                  filteredSections.map((section) => {
                    const Icon = section.icon;
                    return (
                      <section
                        key={section.id}
                        id={section.id}
                        className="scroll-mt-28 overflow-hidden rounded-2xl border"
                        style={{
                          backgroundColor: 'var(--wk-card)',
                          borderColor: 'var(--wk-line)',
                          boxShadow: 'var(--wk-shadow-sm)',
                        }}
                      >
                        <div
                          className="flex items-start gap-3 border-b px-5 py-4 sm:px-6"
                          style={{ borderColor: 'var(--wk-line)' }}
                        >
                          <span
                            className="inline-flex h-10 w-10 flex-none items-center justify-center rounded-xl"
                            style={{
                              backgroundColor: 'var(--wk-accent-soft)',
                              color: 'var(--wk-accent)',
                              border: '1px solid var(--wk-accent-ring)',
                            }}
                          >
                            <Icon className="h-5 w-5" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h2
                                className="text-lg font-semibold tracking-tight sm:text-xl"
                                style={{ color: 'var(--wk-text)' }}
                              >
                                {section.title}
                              </h2>
                              <span
                                className="rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums"
                                style={{
                                  backgroundColor: 'var(--wk-bg-subtle)',
                                  color: 'var(--wk-text-muted)',
                                }}
                              >
                                {section.links.length}
                              </span>
                            </div>
                            <p className="mt-0.5 text-sm" style={{ color: 'var(--wk-text-soft)' }}>
                              {section.blurb}
                            </p>
                          </div>
                        </div>

                        <ul className="divide-y px-2 py-2 sm:px-3" style={{ borderColor: 'var(--wk-line)' }}>
                          {section.links.map((link) => (
                            <li key={link.href} style={{ borderColor: 'var(--wk-line)' }}>
                              <Link href={link.href} className="sj-sitemap-link group">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span
                                      className="text-sm font-semibold transition-colors group-hover:text-[color:var(--wk-accent)]"
                                      style={{ color: 'var(--wk-text)' }}
                                    >
                                      {link.label}
                                    </span>
                                    {link.signedIn ? (
                                      <span
                                        className="rounded-full px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide"
                                        style={{
                                          backgroundColor: 'var(--wk-accent-soft)',
                                          color: 'var(--wk-accent)',
                                        }}
                                      >
                                        Sign in
                                      </span>
                                    ) : null}
                                  </div>
                                  {link.description ? (
                                    <p
                                      className="mt-0.5 text-xs leading-snug sm:text-[13px]"
                                      style={{ color: 'var(--wk-text-muted)' }}
                                    >
                                      {link.description}
                                    </p>
                                  ) : null}
                                  <p
                                    className="mt-1 font-mono text-[11px] sm:hidden"
                                    style={{ color: 'var(--wk-text-muted)' }}
                                  >
                                    {link.href}
                                  </p>
                                </div>
                                <div className="hidden items-center gap-2 sm:flex">
                                  <span
                                    className="max-w-[220px] truncate font-mono text-[11px]"
                                    style={{ color: 'var(--wk-text-muted)' }}
                                  >
                                    {link.href}
                                  </span>
                                  <ArrowRight className="sj-sitemap-arrow h-4 w-4 shrink-0" />
                                </div>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </section>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
    </WkPageShell>
  );
}
