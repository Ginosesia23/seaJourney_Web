'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  Clock,
  Sparkles,
  Rocket,
  Target,
  Zap,
  Shield,
  Globe,
  Users,
  BarChart3,
  FileText,
  Calendar,
  Bell,
  MapPin,
  Ship,
  ArrowRight,
  Lightbulb,
  Code,
  Play,
  Layers,
} from 'lucide-react';
import {
  WkPageShell,
  WkPageHero,
} from '@/components/wk/wk-page-shell';

interface RoadmapItem {
  title: string;
  description: string;
  status: 'completed' | 'in-progress' | 'planned' | 'upcoming';
  quarter?: string;
  category: 'platform' | 'features' | 'integrations' | 'mobile';
  icon: React.ComponentType<{ className?: string }>;
  progress?: number;
  priority?: 'high' | 'medium' | 'low';
}

const roadmapItems: RoadmapItem[] = [
  { title: 'Digital Testimonials', description: 'Secure, verifiable digital testimonials with unique verification codes', status: 'completed', category: 'features', icon: FileText },
  { title: 'Sea Time Tracking', description: 'Comprehensive sea service logging with vessel state management', status: 'completed', category: 'features', icon: Ship },
  { title: 'Vessel Management', description: 'Vessel profiles, assignments, and state tracking for captains', status: 'completed', category: 'platform', icon: Ship },
  { title: 'Public Verification System', description: 'Public verification portal for testimonial authenticity', status: 'completed', category: 'features', icon: Shield },
  { title: 'Certificate Tracking', description: 'Track certifications, licenses, and expiration dates', status: 'completed', category: 'features', icon: Shield },
  { title: 'MCA Application Forms', description: 'Auto-populated MCA Watch Rating Certificate applications (Nav Watch, OOW)', status: 'completed', category: 'features', icon: FileText },
  { title: 'iOS Mobile App', description: 'Native iOS application for iPhone and iPad', status: 'completed', category: 'mobile', icon: Rocket },

  { title: 'Watch Logging', description: 'Officer watch time tracking and logging system', status: 'in-progress', category: 'features', icon: Clock, progress: 75, priority: 'high' },
  { title: 'Position History', description: 'Career progression tracking with position history management', status: 'in-progress', category: 'features', icon: BarChart3, progress: 90, priority: 'high' },
  { title: 'Android Mobile App', description: 'Native Android application for smartphones and tablets', status: 'in-progress', quarter: 'Q1 2026', category: 'mobile', icon: Rocket, progress: 40, priority: 'high' },

  { title: 'Advanced Analytics Dashboard', description: 'Detailed sea time analytics, trends, and career insights', status: 'planned', quarter: 'Q2 2026', category: 'features', icon: BarChart3 },
  { title: 'Document Export & Sharing', description: 'Export sea service records, testimonials, and certificates as PDF', status: 'planned', quarter: 'Q2 2026', category: 'features', icon: FileText },
  { title: 'Visa Tracker Enhancements', description: 'Advanced visa day calculations and multi-country tracking', status: 'planned', quarter: 'Q2 2026', category: 'features', icon: Calendar },
  { title: 'Notification System', description: 'Email and push notifications for certificate expirations, testimonials, and updates', status: 'planned', quarter: 'Q2 2026', category: 'platform', icon: Bell },
  { title: 'AIS Integration', description: 'Automatic vessel tracking and position updates via AIS data', status: 'planned', quarter: 'Q3 2026', category: 'integrations', icon: MapPin },
  { title: 'Fleet Management', description: 'Multi-vessel management tools for fleet operators', status: 'planned', quarter: 'Q3 2026', category: 'platform', icon: Ship },
  { title: 'Crew Scheduling', description: 'Advanced crew scheduling and rotation management', status: 'planned', quarter: 'Q3 2026', category: 'features', icon: Calendar },
  { title: 'API Access', description: 'RESTful API for third-party integrations and custom solutions', status: 'planned', quarter: 'Q3 2026', category: 'integrations', icon: Zap },

  { title: 'International Port Database', description: 'Comprehensive database of ports worldwide with entry/exit logging', status: 'upcoming', quarter: 'Q4 2026', category: 'features', icon: Globe },
  { title: 'Social Features', description: 'Crew networking, recommendations, and professional connections', status: 'upcoming', quarter: 'Q4 2026', category: 'platform', icon: Users },
  { title: 'Training & Certification Tracking', description: 'Track STCW courses, medical certificates, and training records', status: 'upcoming', quarter: 'Q4 2026', category: 'features', icon: Shield },
  { title: 'Payroll Integration', description: 'Integration with payroll systems for automated sea time verification', status: 'upcoming', quarter: '2026', category: 'integrations', icon: Zap },
];

const STATUS_TONES: Record<
  RoadmapItem['status'],
  { label: string; color: string; bg: string; ring: string; iconLabel: string }
> = {
  completed: { label: 'Done', color: '#16a34a', bg: 'rgba(22, 163, 74, 0.10)', ring: 'rgba(22, 163, 74, 0.32)', iconLabel: 'Completed' },
  'in-progress': { label: 'Building', color: '#0ea5e9', bg: 'rgba(14, 165, 233, 0.12)', ring: 'rgba(14, 165, 233, 0.32)', iconLabel: 'In progress' },
  planned: { label: 'Planned', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.12)', ring: 'rgba(139, 92, 246, 0.32)', iconLabel: 'Planned' },
  upcoming: { label: 'Future', color: '#f97316', bg: 'rgba(249, 115, 22, 0.12)', ring: 'rgba(249, 115, 22, 0.32)', iconLabel: 'Upcoming' },
};

const CATEGORY_LABELS: Record<RoadmapItem['category'], string> = {
  platform: 'Platform',
  features: 'Features',
  integrations: 'Integrations',
  mobile: 'Mobile',
};

function StatTile({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone: { color: string; bg: string; ring: string };
}) {
  return (
    <div
      className="rounded-2xl p-6 text-center"
      style={{
        backgroundColor: 'var(--wk-card)',
        border: `1px solid ${tone.ring}`,
        boxShadow: 'var(--wk-shadow-md)',
      }}
    >
      <div
        className="mb-2 text-4xl font-bold"
        style={{ color: tone.color }}
      >
        {value}
      </div>
      <div
        className="text-xs font-semibold uppercase tracking-wider"
        style={{ color: 'var(--wk-text-muted)' }}
      >
        {label}
      </div>
    </div>
  );
}

function RoadmapCard({ item }: { item: RoadmapItem }) {
  const tone = STATUS_TONES[item.status];
  const Icon = item.icon;
  return (
    <div
      className="group flex h-full flex-col overflow-hidden rounded-2xl p-6 transition-all hover:-translate-y-0.5"
      style={{
        backgroundColor: 'var(--wk-card)',
        border: `1px solid ${tone.ring}`,
        boxShadow: 'var(--wk-shadow-md)',
      }}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <span
          className="inline-flex h-12 w-12 flex-none items-center justify-center rounded-xl"
          style={{
            backgroundColor: tone.bg,
            color: tone.color,
            border: `1px solid ${tone.ring}`,
          }}
        >
          <Icon className="h-6 w-6" />
        </span>
        <span
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider"
          style={{
            backgroundColor: tone.bg,
            color: tone.color,
            border: `1px solid ${tone.ring}`,
          }}
        >
          {tone.label}
        </span>
      </div>
      <h3
        className="text-lg font-bold tracking-tight"
        style={{ color: 'var(--wk-text)' }}
      >
        {item.title}
      </h3>
      <p
        className="mt-2 text-sm leading-relaxed"
        style={{ color: 'var(--wk-text-soft)' }}
      >
        {item.description}
      </p>

      {item.progress !== undefined && (
        <div className="mt-5 space-y-2">
          <div
            className="flex items-center justify-between text-xs font-medium"
            style={{ color: 'var(--wk-text-muted)' }}
          >
            <span>Progress</span>
            <span style={{ color: tone.color }}>{item.progress}%</span>
          </div>
          <div
            className="h-2 w-full overflow-hidden rounded-full"
            style={{ backgroundColor: 'var(--wk-bg-subtle)' }}
          >
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${item.progress}%`,
                backgroundColor: tone.color,
              }}
            />
          </div>
        </div>
      )}

      <div
        className="mt-auto flex items-center justify-between gap-2 border-t pt-4 text-xs"
        style={{ borderColor: 'var(--wk-line)', color: 'var(--wk-text-muted)' }}
      >
        <span className="font-medium">{CATEGORY_LABELS[item.category]}</span>
        {item.quarter ? (
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold"
            style={{
              backgroundColor: 'var(--wk-bg-subtle)',
              color: 'var(--wk-text-soft)',
              border: '1px solid var(--wk-line)',
            }}
          >
            <Calendar className="h-3 w-3" />
            {item.quarter}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function StatusGroup({
  status,
  title,
  subtitle,
  items,
  Icon,
  cols = 3,
}: {
  status: RoadmapItem['status'];
  title: string;
  subtitle: string;
  items: RoadmapItem[];
  Icon: React.ComponentType<{ className?: string }>;
  cols?: 2 | 3;
}) {
  const tone = STATUS_TONES[status];
  return (
    <div>
      <div className="mb-7 flex items-center gap-3">
        <span
          className="inline-flex h-12 w-12 items-center justify-center rounded-xl"
          style={{
            backgroundColor: tone.bg,
            color: tone.color,
            border: `1px solid ${tone.ring}`,
          }}
        >
          <Icon className="h-6 w-6" />
        </span>
        <div>
          <h2
            className="text-2xl font-bold tracking-tight"
            style={{ color: 'var(--wk-text)' }}
          >
            {title}
          </h2>
          <p className="text-sm" style={{ color: 'var(--wk-text-muted)' }}>
            {subtitle}
          </p>
        </div>
      </div>
      <div
        className={`grid gap-5 sm:grid-cols-2 ${cols === 3 ? 'lg:grid-cols-3' : ''}`}
      >
        {items.map((item, i) => (
          <RoadmapCard key={i} item={item} />
        ))}
      </div>
    </div>
  );
}

const TIMELINE: Array<{
  title: string;
  date: string;
  description: string;
  Icon: React.ComponentType<{ className?: string }>;
  color: string;
  ring: string;
  done: boolean;
}> = [
  { title: 'The Idea', date: 'Q1 2024', description: 'Conceptualizing SeaJourney - a platform to revolutionise maritime career management and sea time tracking.', Icon: Lightbulb, color: '#eab308', ring: 'rgba(234, 179, 8, 0.32)', done: true },
  { title: 'Development Begins', date: 'Q2 - Q3 2024', description: 'Building the core platform - user authentication, vessel management, and sea time tracking systems.', Icon: Code, color: '#0ea5e9', ring: 'rgba(14, 165, 233, 0.32)', done: true },
  { title: 'Beta Launch', date: 'Q4 2025', description: 'Beta release with early adopters - testing core features, gathering feedback, and refining the platform.', Icon: Rocket, color: '#06b6d4', ring: 'rgba(6, 182, 212, 0.32)', done: true },
  { title: 'Public Launch', date: 'Q1 2026', description: "SeaJourney officially launches! Core features including digital testimonials, sea time tracking, and vessel management are available to all users.", Icon: Play, color: '#16a34a', ring: 'rgba(22, 163, 74, 0.32)', done: true },
  { title: 'Feature Expansion', date: 'Q2 2026 — Present', description: 'Continuous innovation — iOS launch, watch logging, position history, MCA applications, Android app, and many more features.', Icon: Layers, color: '#8b5cf6', ring: 'rgba(139, 92, 246, 0.32)', done: false },
  { title: 'Future Growth', date: '2027+', description: 'Advanced analytics, AIS integration, fleet management, social features, and more exciting innovations on the horizon.', Icon: Rocket, color: '#f97316', ring: 'rgba(249, 115, 22, 0.32)', done: false },
];

export default function RoadmapPage() {
  const grouped = useMemo(() => {
    return roadmapItems.reduce((acc, item) => {
      (acc[item.status] ||= []).push(item);
      return acc;
    }, {} as Record<RoadmapItem['status'], RoadmapItem[]>);
  }, []);

  const stats = useMemo(
    () => ({
      completed: roadmapItems.filter((i) => i.status === 'completed').length,
      inProgress: roadmapItems.filter((i) => i.status === 'in-progress').length,
      planned: roadmapItems.filter((i) => i.status === 'planned').length,
      upcoming: roadmapItems.filter((i) => i.status === 'upcoming').length,
    }),
    [],
  );

  return (
    <WkPageShell>
      <WkPageHero
        eyebrow="Product roadmap"
        icon={<Rocket className="h-7 w-7" />}
        title={
          <>
            Our journey <span className="wk-gradient-text">ahead</span>
          </>
        }
        description="Explore what we're building next and the exciting features coming to SeaJourney. We're committed to continuously improving your maritime career management experience."
      />

      {/* Stats */}
      <section className="pb-10 sm:pb-14">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-5xl grid-cols-2 gap-4 md:grid-cols-4">
            <StatTile value={stats.completed} label="Completed" tone={STATUS_TONES.completed} />
            <StatTile value={stats.inProgress} label="In progress" tone={STATUS_TONES['in-progress']} />
            <StatTile value={stats.planned} label="Planned" tone={STATUS_TONES.planned} />
            <StatTile value={stats.upcoming} label="Upcoming" tone={STATUS_TONES.upcoming} />
          </div>
        </div>
      </section>

      {/* Timeline */}
      <section className="pb-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-5xl">
            <div className="mb-10 text-center">
              <h2
                className="text-3xl font-bold tracking-tight sm:text-4xl"
                style={{ color: 'var(--wk-text)' }}
              >
                Our development journey
              </h2>
              <p
                className="mx-auto mt-3 max-w-2xl text-base"
                style={{ color: 'var(--wk-text-soft)' }}
              >
                From concept to launch and beyond — tracking our growth and milestones.
              </p>
            </div>

            <ol className="relative space-y-6 pl-7 sm:pl-9">
              <span
                aria-hidden="true"
                className="absolute left-3 top-2 bottom-2 w-px sm:left-4"
                style={{
                  background:
                    'linear-gradient(to bottom, var(--wk-line) 0%, var(--wk-line-strong) 50%, var(--wk-line) 100%)',
                }}
              />
              {TIMELINE.map((m, i) => (
                <li key={i} className="relative">
                  <span
                    className="absolute -left-7 top-3 inline-flex h-6 w-6 items-center justify-center rounded-full sm:-left-9 sm:h-7 sm:w-7"
                    style={{
                      backgroundColor: m.done ? m.color : 'var(--wk-bg-raised)',
                      border: `2px solid ${m.color}`,
                      boxShadow: m.done ? `0 0 0 4px ${m.ring}` : `0 0 0 4px ${m.ring}`,
                      color: '#fff',
                    }}
                  >
                    {m.done ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
                  </span>
                  <div
                    className="rounded-2xl p-6"
                    style={{
                      backgroundColor: 'var(--wk-card)',
                      border: `1px solid ${m.ring}`,
                      boxShadow: 'var(--wk-shadow-md)',
                    }}
                  >
                    <div className="mb-3 flex items-center gap-3">
                      <span
                        className="inline-flex h-10 w-10 items-center justify-center rounded-xl"
                        style={{
                          backgroundColor: `color-mix(in srgb, ${m.color} 15%, transparent)`,
                          color: m.color,
                          border: `1px solid ${m.ring}`,
                        }}
                      >
                        <m.Icon className="h-5 w-5" />
                      </span>
                      <div>
                        <h3
                          className="text-lg font-bold"
                          style={{ color: 'var(--wk-text)' }}
                        >
                          {m.title}
                        </h3>
                        <p
                          className="text-xs font-medium"
                          style={{ color: 'var(--wk-text-muted)' }}
                        >
                          {m.date}
                        </p>
                      </div>
                    </div>
                    <p
                      className="text-sm leading-relaxed"
                      style={{ color: 'var(--wk-text-soft)' }}
                    >
                      {m.description}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* Status groups */}
      <section className="pb-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl space-y-14">
            {grouped.completed && (
              <StatusGroup
                status="completed"
                title="Completed"
                subtitle="Features we've shipped and you're using today"
                items={grouped.completed}
                Icon={CheckCircle2}
              />
            )}
            {grouped['in-progress'] && (
              <StatusGroup
                status="in-progress"
                title="In progress"
                subtitle="Currently being built — coming soon"
                items={grouped['in-progress']}
                Icon={Clock}
              />
            )}
            {grouped.planned && (
              <StatusGroup
                status="planned"
                title="Planned"
                subtitle="On our roadmap for 2026"
                items={grouped.planned}
                Icon={Target}
              />
            )}
            {grouped.upcoming && (
              <StatusGroup
                status="upcoming"
                title="Upcoming"
                subtitle="Future innovations we're exploring"
                items={grouped.upcoming}
                Icon={Sparkles}
              />
            )}
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
              <Rocket className="h-7 w-7" />
            </span>
            <h3
              className="mt-5 text-3xl font-bold tracking-tight"
              style={{ color: 'var(--wk-text)' }}
            >
              Have a feature request?
            </h3>
            <p
              className="mx-auto mt-3 max-w-2xl text-base"
              style={{ color: 'var(--wk-text-soft)' }}
            >
              We're always looking to improve SeaJourney. If you have ideas for
              features or improvements, we'd love to hear from you.
            </p>
            <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="/dashboard/feedback" className="wk-btn wk-btn-primary">
                Submit feedback
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/dashboard" className="wk-btn wk-btn-ghost">
                Get started
              </Link>
            </div>
          </div>
        </div>
      </section>
    </WkPageShell>
  );
}
