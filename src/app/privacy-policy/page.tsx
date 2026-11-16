'use client';

import type { LucideIcon } from 'lucide-react';
import {
  Shield,
  Lock,
  Database,
  Mail,
  Globe,
  FileText,
  CheckCircle2,
  MapPin,
  User,
  CreditCard,
  Smartphone,
  Scale,
  Clock,
  Radio,
  ArrowRight,
} from 'lucide-react';
import { WkPageShell } from '@/components/wk/wk-page-shell';
import { LegalPageHeader } from '@/components/wk/legal-page';

const SECTIONS = [
  { id: 'collect', label: 'What we collect' },
  { id: 'use', label: 'How we use it' },
  { id: 'legal-basis', label: 'Legal basis' },
  { id: 'storage', label: 'Storage & security' },
  { id: 'third-parties', label: 'Third parties' },
  { id: 'location', label: 'Mobile location' },
  { id: 'rights', label: 'Your rights' },
  { id: 'retention', label: 'Retention' },
  { id: 'contact', label: 'Contact' },
] as const;

const COLLECTED = [
  {
    icon: User,
    title: 'Personal',
    items: ['Name', 'Email address', 'Position / role', 'Nationality (if provided)', 'Account credentials'],
  },
  {
    icon: FileText,
    title: 'Usage & service',
    items: ['Sea time logs', 'Vessel assignments', 'Testimonials & sign-off records', 'App usage activity'],
  },
  {
    icon: MapPin,
    title: 'Location (mobile)',
    items: [
      'Precise GPS, only with permission',
      'Passage tracks, distance, start / end',
      'Separate from vessel AIS',
    ],
  },
  {
    icon: CreditCard,
    title: 'Payment',
    items: ['Processed securely via Stripe', 'We do not store your card details'],
  },
  {
    icon: Smartphone,
    title: 'Technical',
    items: ['IP address', 'Device type', 'Browser information', 'Login timestamps'],
  },
  {
    icon: Radio,
    title: 'Vessel AIS',
    items: ['Public AIS position and status when AIS tracking is enabled on a linked vessel'],
  },
] as const;

const USES = [
  'Create and manage user accounts',
  'Track sea service and vessel assignments',
  'Record GPS passage tracks and distances on the mobile app, when you allow location',
  'Generate professional testimonials',
  'Communicate with users',
  'Process subscriptions',
  'Improve platform functionality',
  'Meet legal obligations',
] as const;

const BASES = [
  { title: 'Contract', body: 'To provide the SeaJourney service you signed up for.' },
  { title: 'Legitimate interests', body: 'To keep the platform secure and running.' },
  { title: 'Legal obligation', body: 'Where the law requires us to keep or share records.' },
  { title: 'Consent', body: 'Where we ask — including mobile location permission.' },
] as const;

const RIGHTS = [
  { title: 'Access', body: 'Ask for a copy of the personal data we hold.' },
  { title: 'Correct', body: 'Fix details that are wrong — most of this is on your Profile.' },
  { title: 'Delete', body: 'Request deletion of your account and personal data.' },
  { title: 'Export', body: 'Download records from your account, or email us for a copy.' },
  { title: 'Withdraw consent', body: 'Turn off optional processing such as location tracking.' },
  { title: 'Complain', body: 'File a complaint with the ICO or your local data authority.' },
] as const;

function SectionHeading({
  id,
  kicker,
  title,
}: {
  id: string;
  kicker: string;
  title: string;
}) {
  return (
    <div id={id} className="scroll-mt-28">
      <p className="wk-eyebrow">{kicker}</p>
      <h2
        className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl"
        style={{ color: 'var(--wk-text)' }}
      >
        {title}
      </h2>
    </div>
  );
}

function DataTile({
  icon: Icon,
  title,
  items,
}: {
  icon: LucideIcon;
  title: string;
  items: readonly string[];
}) {
  return (
    <div
      className="rounded-2xl p-5"
      style={{
        backgroundColor: 'var(--wk-bg-subtle)',
        border: '1px solid var(--wk-line)',
      }}
    >
      <span
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg"
        style={{
          backgroundColor: 'var(--wk-accent-soft)',
          color: 'var(--wk-accent)',
        }}
      >
        <Icon className="h-4 w-4" />
      </span>
      <h3 className="mt-3 text-sm font-semibold" style={{ color: 'var(--wk-text)' }}>
        {title}
      </h3>
      <ul className="mt-2 space-y-1.5 text-sm" style={{ color: 'var(--wk-text-soft)' }}>
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span
              className="mt-2 h-1 w-1 flex-none rounded-full"
              style={{ backgroundColor: 'var(--wk-accent)' }}
            />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function PrivacyPolicyPage() {
  return (
    <WkPageShell>
      <section className="pb-24 pt-10 sm:pt-14">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <LegalPageHeader
            current="privacy"
            title="Privacy Policy"
            description="How SeaJourney collects, uses, and protects your personal data under the UK GDPR and EU GDPR."
            extras={['UK GDPR', 'EU GDPR']}
          />

          <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-14">
            <aside className="lg:pt-1">
              <nav
                aria-label="On this page"
                className="rounded-2xl p-4 lg:sticky lg:top-24"
                style={{
                  backgroundColor: 'var(--wk-card)',
                  border: '1px solid var(--wk-line)',
                  boxShadow: 'var(--wk-shadow-sm)',
                }}
              >
                <p className="wk-eyebrow">On this page</p>
                <ul className="mt-3 flex gap-2 overflow-x-auto pb-1 lg:block lg:space-y-1 lg:overflow-visible lg:pb-0">
                  {SECTIONS.map((section, index) => (
                    <li key={section.id} className="flex-none">
                      <a
                        href={`#${section.id}`}
                        className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-colors hover:bg-[color:var(--wk-accent-soft)]"
                        style={{ color: 'var(--wk-text-soft)' }}
                      >
                        <span
                          className="hidden font-mono text-[11px] tabular-nums lg:inline"
                          style={{ color: 'var(--wk-text-muted)' }}
                        >
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        {section.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            </aside>

            <div className="space-y-8">
              <div
                className="rounded-3xl p-6 sm:p-8"
                style={{
                  backgroundColor: 'var(--wk-card)',
                  border: '1px solid var(--wk-line)',
                  boxShadow: 'var(--wk-shadow-md)',
                }}
              >
                <p className="text-base leading-relaxed sm:text-lg" style={{ color: 'var(--wk-text)' }}>
                  <strong>SeaJourney</strong> (“we”, “our”, “us”) operates a digital
                  platform for maritime crew and vessels to track sea time, vessel
                  assignments, and professional testimonials.
                </p>
                <p className="mt-3 text-sm leading-relaxed sm:text-base" style={{ color: 'var(--wk-text-soft)' }}>
                  We only process what we need to run your account. We do not sell
                  personal data. Location on the mobile app is optional and
                  permission-based.
                </p>
                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                  {[
                    { icon: Shield, label: 'Not sold or used for ads' },
                    { icon: MapPin, label: 'Location is opt-in' },
                    { icon: Scale, label: 'You can export or delete' },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                      style={{
                        backgroundColor: 'var(--wk-bg-subtle)',
                        border: '1px solid var(--wk-line)',
                      }}
                    >
                      <item.icon className="h-4 w-4 flex-none" style={{ color: 'var(--wk-accent)' }} />
                      <span className="text-sm font-medium" style={{ color: 'var(--wk-text)' }}>
                        {item.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <section
                className="rounded-3xl p-6 sm:p-8"
                style={{
                  backgroundColor: 'var(--wk-card)',
                  border: '1px solid var(--wk-line)',
                }}
              >
                <SectionHeading id="collect" kicker="01" title="Information we collect" />
                <p className="mt-3 text-sm sm:text-base" style={{ color: 'var(--wk-text-soft)' }}>
                  We may collect the following information when you use SeaJourney
                  on the web or in the mobile app.
                </p>
                <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {COLLECTED.map((group) => (
                    <DataTile key={group.title} {...group} />
                  ))}
                </div>
              </section>

              <section
                className="rounded-3xl p-6 sm:p-8"
                style={{
                  backgroundColor: 'var(--wk-card)',
                  border: '1px solid var(--wk-line)',
                }}
              >
                <SectionHeading id="use" kicker="02" title="How we use your data" />
                <ul className="mt-6 grid gap-2 sm:grid-cols-2">
                  {USES.map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-3 rounded-xl px-3 py-2.5"
                      style={{
                        backgroundColor: 'var(--wk-bg-subtle)',
                        border: '1px solid var(--wk-line)',
                      }}
                    >
                      <CheckCircle2
                        className="mt-0.5 h-4 w-4 flex-none"
                        style={{ color: 'var(--wk-accent)' }}
                      />
                      <span className="text-sm" style={{ color: 'var(--wk-text)' }}>
                        {item}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>

              <section
                className="rounded-3xl p-6 sm:p-8"
                style={{
                  backgroundColor: 'var(--wk-card)',
                  border: '1px solid var(--wk-line)',
                }}
              >
                <SectionHeading id="legal-basis" kicker="03" title="Legal basis for processing" />
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {BASES.map((basis) => (
                    <div
                      key={basis.title}
                      className="rounded-2xl p-4"
                      style={{
                        backgroundColor: 'var(--wk-bg-subtle)',
                        border: '1px solid var(--wk-line)',
                      }}
                    >
                      <h3 className="text-sm font-semibold" style={{ color: 'var(--wk-text)' }}>
                        {basis.title}
                      </h3>
                      <p className="mt-1 text-sm" style={{ color: 'var(--wk-text-soft)' }}>
                        {basis.body}
                      </p>
                    </div>
                  ))}
                </div>
              </section>

              <div className="grid gap-8 lg:grid-cols-2">
                <section
                  className="rounded-3xl p-6 sm:p-8"
                  style={{
                    backgroundColor: 'var(--wk-card)',
                    border: '1px solid var(--wk-line)',
                  }}
                >
                  <SectionHeading id="storage" kicker="04" title="Storage & security" />
                  <ul className="mt-5 space-y-3">
                    {[
                      { icon: Database, text: 'Supabase for database and authentication' },
                      { icon: Lock, text: 'Encrypted connections' },
                      { icon: Shield, text: 'Role-based access controls' },
                    ].map((row) => (
                      <li key={row.text} className="flex items-start gap-3">
                        <row.icon className="mt-0.5 h-4 w-4 flex-none" style={{ color: 'var(--wk-accent)' }} />
                        <span className="text-sm" style={{ color: 'var(--wk-text-soft)' }}>
                          {row.text}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-4 text-sm" style={{ color: 'var(--wk-text-muted)' }}>
                    We take reasonable measures to protect your information.
                  </p>
                </section>

                <section
                  className="rounded-3xl p-6 sm:p-8"
                  style={{
                    backgroundColor: 'var(--wk-card)',
                    border: '1px solid var(--wk-line)',
                  }}
                >
                  <SectionHeading id="third-parties" kicker="05" title="Third-party services" />
                  <ul className="mt-5 space-y-3 text-sm" style={{ color: 'var(--wk-text-soft)' }}>
                    <li>Supabase — authentication &amp; database</li>
                    <li>Stripe — payments</li>
                    <li>Resend / email providers — communication</li>
                    <li>Hosting providers — infrastructure</li>
                    <li>AIS providers — vessel position when tracking is on</li>
                  </ul>
                  <p className="mt-4 text-sm" style={{ color: 'var(--wk-text-muted)' }}>
                    Each provider receives only what they need, with GDPR-compliant safeguards.
                  </p>
                </section>
              </div>

              <section
                id="location"
                className="scroll-mt-28 rounded-3xl p-6 sm:p-8"
                style={{
                  backgroundColor: 'var(--wk-card)',
                  border: '1px solid var(--wk-accent-ring)',
                  boxShadow: 'var(--wk-shadow-md)',
                }}
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span
                    className="inline-flex h-11 w-11 items-center justify-center rounded-xl"
                    style={{
                      backgroundColor: 'var(--wk-accent-soft)',
                      color: 'var(--wk-accent)',
                      border: '1px solid var(--wk-accent-ring)',
                    }}
                  >
                    <MapPin className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="wk-eyebrow">06 · Mobile app</p>
                    <h2
                      className="text-2xl font-bold tracking-tight sm:text-3xl"
                      style={{ color: 'var(--wk-text)' }}
                    >
                      Location tracking
                    </h2>
                  </div>
                </div>

                <p className="mt-5 text-base leading-relaxed" style={{ color: 'var(--wk-text-soft)' }}>
                  The SeaJourney iOS and Android apps may use your device’s
                  location. We only collect it if you grant permission. Manual
                  sea-time logging, documents, and your account still work if
                  you refuse or later turn location off.
                </p>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {[
                    {
                      title: 'What we collect',
                      body: 'Precise GPS coordinates and timestamps. We derive speed, course, distance, and a passage track from them.',
                    },
                    {
                      title: 'Background collection',
                      body: 'If GPS passage tracking is running, the app may keep collecting location in the background or while the phone is locked, so a passage is not cut short.',
                    },
                    {
                      title: 'Why we use it',
                      body: 'To record GPS passage tracks and sea miles, set start and end positions, and keep your sea-time record accurate while you are underway.',
                    },
                    {
                      title: 'Who can see it',
                      body: 'Tracks sit in your sea-service records. A vessel or captain sees them only if you have already granted access. Hosting providers store what they need to run the feature.',
                    },
                  ].map((block) => (
                    <div
                      key={block.title}
                      className="rounded-2xl p-4"
                      style={{
                        backgroundColor: 'var(--wk-bg-subtle)',
                        border: '1px solid var(--wk-line)',
                      }}
                    >
                      <h3 className="text-sm font-semibold" style={{ color: 'var(--wk-text)' }}>
                        {block.title}
                      </h3>
                      <p className="mt-1.5 text-sm leading-relaxed" style={{ color: 'var(--wk-text-soft)' }}>
                        {block.body}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="wk-callout mt-6" data-tone="info">
                  <strong>Vessel AIS is different.</strong> If a linked vessel
                  has AIS tracking enabled, we receive that vessel’s public AIS
                  position from our AIS provider. That is the vessel’s
                  broadcast, not your phone’s GPS. The mobile app may show the
                  live vessel position so you can see where the boat is.
                </div>

                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--wk-text-soft)' }}>
                    We do not use device location for advertising or marketing,
                    and we do not sell it.
                  </p>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--wk-text-soft)' }}>
                    Turn location off for SeaJourney in iOS or Android Settings,
                    or stop an active GPS passage in the app. Saved tracks stay
                    in your log unless you delete them or ask us to erase your
                    data.
                  </p>
                </div>
                <p className="mt-4 text-xs" style={{ color: 'var(--wk-text-muted)' }}>
                  Legal bases: your consent (the permission you grant) and
                  contractual necessity (providing GPS passage tracking).
                </p>
              </section>

              <section
                className="rounded-3xl p-6 sm:p-8"
                style={{
                  backgroundColor: 'var(--wk-card)',
                  border: '1px solid var(--wk-line)',
                }}
              >
                <SectionHeading id="rights" kicker="07" title="Your rights" />
                <p className="mt-3 text-sm sm:text-base" style={{ color: 'var(--wk-text-soft)' }}>
                  You can exercise these at any time. Email{' '}
                  <a
                    href="mailto:team@seajourney.co.uk"
                    className="font-medium"
                    style={{ color: 'var(--wk-accent)' }}
                  >
                    team@seajourney.co.uk
                  </a>
                  .
                </p>
                <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {RIGHTS.map((right) => (
                    <div
                      key={right.title}
                      className="rounded-2xl p-4"
                      style={{
                        backgroundColor: 'var(--wk-bg-subtle)',
                        border: '1px solid var(--wk-line)',
                      }}
                    >
                      <h3 className="text-sm font-semibold" style={{ color: 'var(--wk-text)' }}>
                        {right.title}
                      </h3>
                      <p className="mt-1 text-sm" style={{ color: 'var(--wk-text-soft)' }}>
                        {right.body}
                      </p>
                    </div>
                  ))}
                </div>
              </section>

              <div id="retention" className="grid scroll-mt-28 gap-4 md:grid-cols-3">
                {[
                  {
                    icon: Clock,
                    title: 'Data retention',
                    body: 'We keep your data only as long as necessary to provide the service or meet legal obligations.',
                  },
                  {
                    icon: Globe,
                    title: 'International transfers',
                    body: 'Some data may be processed outside the UK / EU, but always with GDPR-compliant safeguards.',
                  },
                  {
                    icon: FileText,
                    title: 'Changes to this policy',
                    body: 'We may update this policy. Users will be notified of significant changes.',
                  },
                ].map((card) => (
                  <div
                    key={card.title}
                    className="rounded-3xl p-5"
                    style={{
                      backgroundColor: 'var(--wk-card)',
                      border: '1px solid var(--wk-line)',
                    }}
                  >
                    <card.icon className="h-4 w-4" style={{ color: 'var(--wk-accent)' }} />
                    <h3 className="mt-3 text-sm font-semibold" style={{ color: 'var(--wk-text)' }}>
                      {card.title}
                    </h3>
                    <p className="mt-1.5 text-sm leading-relaxed" style={{ color: 'var(--wk-text-soft)' }}>
                      {card.body}
                    </p>
                  </div>
                ))}
              </div>

              <section
                id="contact"
                className="scroll-mt-28 overflow-hidden rounded-3xl p-6 sm:p-8"
                style={{
                  background:
                    'linear-gradient(135deg, color-mix(in srgb, var(--wk-accent) 12%, var(--wk-card)) 0%, var(--wk-card) 55%)',
                  border: '1px solid var(--wk-accent-ring)',
                }}
              >
                <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="wk-eyebrow">09 · Contact</p>
                    <h2
                      className="mt-2 text-2xl font-bold tracking-tight"
                      style={{ color: 'var(--wk-text)' }}
                    >
                      Questions about your data
                    </h2>
                    <p className="mt-2 max-w-xl text-sm sm:text-base" style={{ color: 'var(--wk-text-soft)' }}>
                      SeaJourney · Email us for access, correction, or deletion.
                      We respond as soon as we can, and within one month.
                    </p>
                  </div>
                  <a href="mailto:team@seajourney.co.uk" className="wk-btn wk-btn-primary">
                    <Mail className="h-4 w-4" />
                    team@seajourney.co.uk
                    <ArrowRight className="h-4 w-4" />
                  </a>
                </div>
              </section>
            </div>
          </div>
        </div>
      </section>
    </WkPageShell>
  );
}
