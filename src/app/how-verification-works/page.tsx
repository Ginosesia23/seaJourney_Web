'use client';

import Link from 'next/link';
import {
  Shield,
  CheckCircle2,
  Search,
  FileCheck,
  Lock,
  Globe,
  Clock,
  ArrowRight,
  Code,
  AlertCircle,
  XCircle,
  Users,
  Building2,
  Briefcase,
  Award,
  HelpCircle,
  ChevronDown,
} from 'lucide-react';
import { WkPageShell, WkPageHero } from '@/components/wk/wk-page-shell';

const STEPS: Array<{
  step: string;
  Icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  color: string;
  ring: string;
}> = [
  {
    step: '1',
    Icon: Code,
    title: 'Get your code',
    description:
      'Every approved testimonial includes a unique 8-character verification code (e.g. SJ-982F8484) in the PDF footer.',
    color: '#0ea5e9',
    ring: 'rgba(14, 165, 233, 0.30)',
  },
  {
    step: '2',
    Icon: Search,
    title: 'Enter the code',
    description:
      'Visit our verification page and enter the code. No account or login required — verification is completely public.',
    color: '#16a34a',
    ring: 'rgba(22, 163, 74, 0.30)',
  },
  {
    step: '3',
    Icon: CheckCircle2,
    title: 'View results',
    description:
      'Instantly see verified details including crew member info, service dates, vessel details, and captain approval.',
    color: '#8b5cf6',
    ring: 'rgba(139, 92, 246, 0.30)',
  },
];

const FEATURES = [
  {
    Icon: Lock,
    title: 'Tamper-proof',
    description:
      'Each verification code is cryptographically linked to the original approved testimonial. Any changes invalidate the code.',
  },
  {
    Icon: Globe,
    title: 'Worldwide access',
    description:
      'Verify records from anywhere in the world, 24/7. No regional restrictions or time-zone limitations.',
  },
  {
    Icon: Clock,
    title: 'Instant results',
    description:
      'Get verification results in seconds. No waiting periods or manual processing required.',
  },
  {
    Icon: FileCheck,
    title: 'Complete details',
    description:
      'View full testimonial information including crew details, service dates, vessel information, and captain approval.',
  },
];

const SHOWN = [
  { Icon: Users, title: 'Crew member details', items: ['Full name', 'Position / rank', 'Service dates'] },
  { Icon: Building2, title: 'Vessel information', items: ['Vessel name', 'IMO number (if available)', 'Service period'] },
  { Icon: Clock, title: 'Service breakdown', items: ['Total days', 'Sea days', 'Standby days'] },
  { Icon: Award, title: 'Captain approval', items: ['Captain name', 'License / certification', 'Approval date'] },
];

const AUDIENCES = [
  { Icon: Award, title: 'Maritime authorities', description: 'MCA, flag-state administrations, and certification bodies can instantly verify sea service records and testimonials submitted by applicants.', useCase: 'Verify sea service for certification applications' },
  { Icon: Briefcase, title: 'Employers & recruiters', description: 'Verify candidate credentials quickly and reliably before making hiring decisions. Ensure authenticity of sea service claims.', useCase: 'Background checks during recruitment' },
  { Icon: Users, title: 'Crew members', description: "Verify your own testimonials to ensure they're correctly recorded and accessible to authorities or employers when needed.", useCase: 'Confirm your records are properly stored' },
  { Icon: Building2, title: 'Vessel operators', description: "Verify testimonials issued by your vessels to confirm they're properly recorded and accessible for crew members.", useCase: 'Audit testimonial records' },
];

const FAQS = [
  { q: 'Do I need an account to verify records?', a: 'No, verification is completely public and requires no account or login. Anyone can verify a record using the verification code from the PDF footer.' },
  { q: 'Where do I find the verification code?', a: 'The verification code appears in the footer of every approved testimonial PDF. It follows the format SJ-XXXX-XXXX (e.g. SJ-982F8484). The code is unique to each testimonial.' },
  { q: 'What if the code is not found?', a: "If a code is not found, it may mean: (1) the code was entered incorrectly, (2) the testimonial hasn't been approved yet, or (3) the code is from an older system version. Please double-check the code from the PDF footer." },
  { q: 'Can verification codes be faked or tampered with?', a: 'No. Each verification code is cryptographically linked to the original approved testimonial in our secure database. Any modifications to the testimonial invalidate the code.' },
  { q: 'What information is shown in verification results?', a: 'Verification results show: crew member name and rank, vessel name and IMO number, service dates, service breakdown (total days, sea days, standby days), captain name and license, and approval date.' },
  { q: 'Can I verify multiple records at once?', a: 'Currently, you can verify one record at a time. Simply enter each verification code separately on the verification page.' },
  { q: 'How long are verification codes valid?', a: 'Verification codes remain valid as long as the testimonial exists in our system. Even if the original testimonial is later voided, the system will show the voided status, maintaining an audit trail.' },
  { q: 'Is verification available worldwide?', a: 'Yes, our verification system is accessible from anywhere in the world, 24/7. There are no regional restrictions, and the system works on any device with internet access.' },
];

function StepCard({ step }: { step: (typeof STEPS)[number] }) {
  const { Icon } = step;
  return (
    <div
      className="flex items-start gap-4 rounded-2xl p-6"
      style={{
        backgroundColor: 'var(--wk-card)',
        border: `1px solid ${step.ring}`,
        boxShadow: 'var(--wk-shadow-md)',
      }}
    >
      <span
        className="inline-flex h-12 w-12 flex-none items-center justify-center rounded-xl"
        style={{
          backgroundColor: `color-mix(in srgb, ${step.color} 15%, transparent)`,
          color: step.color,
          border: `1px solid ${step.ring}`,
        }}
      >
        <Icon className="h-6 w-6" />
      </span>
      <div className="flex-1">
        <div
          className="mb-1 text-[10px] font-bold uppercase tracking-widest"
          style={{ color: 'var(--wk-text-muted)' }}
        >
          Step {step.step}
        </div>
        <h3 className="text-lg font-bold" style={{ color: 'var(--wk-text)' }}>
          {step.title}
        </h3>
        <p
          className="mt-2 text-sm leading-relaxed"
          style={{ color: 'var(--wk-text-soft)' }}
        >
          {step.description}
        </p>
      </div>
    </div>
  );
}

function InfoCard({
  Icon,
  title,
  children,
}: {
  Icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-2xl p-6"
      style={{
        backgroundColor: 'var(--wk-card)',
        border: '1px solid var(--wk-line)',
        boxShadow: 'var(--wk-shadow-md)',
      }}
    >
      <div className="flex items-start gap-4">
        <span
          className="inline-flex h-12 w-12 flex-none items-center justify-center rounded-xl"
          style={{
            backgroundColor: 'var(--wk-accent-soft)',
            color: 'var(--wk-accent)',
            border: '1px solid var(--wk-accent-ring)',
          }}
        >
          <Icon className="h-6 w-6" />
        </span>
        <div className="flex-1">
          <h3
            className="text-lg font-bold"
            style={{ color: 'var(--wk-text)' }}
          >
            {title}
          </h3>
          <div
            className="mt-2 text-sm leading-relaxed"
            style={{ color: 'var(--wk-text-soft)' }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

function ResultExample({
  tone,
  Icon,
  title,
  children,
}: {
  tone: 'good' | 'bad' | 'warn';
  Icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  const palette = {
    good: { color: 'var(--wk-good)', bg: 'var(--wk-good-soft)', ring: 'color-mix(in srgb, var(--wk-good) 35%, transparent)' },
    bad: { color: 'var(--wk-bad)', bg: 'var(--wk-bad-soft)', ring: 'color-mix(in srgb, var(--wk-bad) 35%, transparent)' },
    warn: { color: 'var(--wk-warn)', bg: 'var(--wk-warn-soft)', ring: 'color-mix(in srgb, var(--wk-warn) 35%, transparent)' },
  }[tone];

  return (
    <div
      className="rounded-2xl p-6"
      style={{
        backgroundColor: 'var(--wk-card)',
        border: `1px solid ${palette.ring}`,
        boxShadow: 'var(--wk-shadow-md)',
      }}
    >
      <div className="mb-3 flex items-center gap-3">
        <span
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl"
          style={{
            backgroundColor: palette.bg,
            color: palette.color,
            border: `1px solid ${palette.ring}`,
          }}
        >
          <Icon className="h-5 w-5" />
        </span>
        <h3 className="text-lg font-bold" style={{ color: palette.color }}>
          {title}
        </h3>
      </div>
      <div
        className="text-sm leading-relaxed"
        style={{ color: 'var(--wk-text-soft)' }}
      >
        {children}
      </div>
    </div>
  );
}

export default function HowVerificationWorksPage() {
  return (
    <WkPageShell>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            .wk-faq-item {
              border: 1px solid var(--wk-line);
              background-color: var(--wk-card);
              border-radius: 14px;
              overflow: hidden;
              transition: border-color 0.2s ease, box-shadow 0.2s ease;
            }
            .wk-faq-item[open] {
              border-color: var(--wk-accent-ring);
              box-shadow: var(--wk-shadow-md);
            }
            .wk-faq-summary {
              cursor: pointer;
              list-style: none;
              padding: 16px 20px;
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 12px;
              font-weight: 600;
              color: var(--wk-text);
            }
            .wk-faq-summary::-webkit-details-marker { display: none; }
            .wk-faq-chevron {
              flex: none;
              transition: transform 0.25s ease, color 0.2s ease;
              color: var(--wk-text-muted);
            }
            .wk-faq-item[open] .wk-faq-chevron {
              transform: rotate(180deg);
              color: var(--wk-accent);
            }
            .wk-faq-body {
              padding: 0 20px 16px;
              color: var(--wk-text-soft);
              line-height: 1.65;
              font-size: 0.92rem;
            }
          `,
        }}
      />

      <WkPageHero
        eyebrow="Public verification"
        icon={<Shield className="h-7 w-7" />}
        title={
          <>
            How verification <span className="wk-gradient-text">works</span>
          </>
        }
        description="Instantly verify the authenticity of SeaJourney testimonials and sea service records using our secure, tamper-proof verification system."
      />

      {/* Steps */}
      <section className="pb-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-5xl gap-5 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <StepCard key={i} step={step} />
            ))}
          </div>
        </div>
      </section>

      {/* Why it matters */}
      <section className="pb-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-5xl">
            <div className="mb-10 text-center">
              <h2
                className="text-3xl font-bold tracking-tight sm:text-4xl"
                style={{ color: 'var(--wk-text)' }}
              >
                Why verification matters
              </h2>
              <p
                className="mx-auto mt-3 max-w-2xl text-base"
                style={{ color: 'var(--wk-text-soft)' }}
              >
                Our verification system provides instant, reliable proof of
                authenticity for maritime professionals.
              </p>
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              {FEATURES.map((f, i) => (
                <InfoCard key={i} Icon={f.Icon} title={f.title}>
                  {f.description}
                </InfoCard>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* What information */}
      <section className="pb-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-5xl">
            <div className="mb-10 text-center">
              <h2
                className="text-3xl font-bold tracking-tight sm:text-4xl"
                style={{ color: 'var(--wk-text)' }}
              >
                What information is verified?
              </h2>
              <p
                className="mx-auto mt-3 max-w-2xl text-base"
                style={{ color: 'var(--wk-text-soft)' }}
              >
                When you verify a record, you'll see complete details about the
                testimonial and sea service.
              </p>
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              {SHOWN.map((s, i) => (
                <InfoCard key={i} Icon={s.Icon} title={s.title}>
                  <ul className="space-y-2">
                    {s.items.map((item, idx) => (
                      <li key={idx} className="flex items-center gap-2">
                        <CheckCircle2
                          className="h-4 w-4 flex-none"
                          style={{ color: 'var(--wk-good)' }}
                        />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </InfoCard>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Examples */}
      <section className="pb-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl">
            <div className="mb-10 text-center">
              <h2
                className="text-3xl font-bold tracking-tight sm:text-4xl"
                style={{ color: 'var(--wk-text)' }}
              >
                Example verification results
              </h2>
              <p
                className="mt-3 text-base"
                style={{ color: 'var(--wk-text-soft)' }}
              >
                See what a verified record looks like.
              </p>
            </div>
            <div className="space-y-5">
              <ResultExample tone="good" Icon={CheckCircle2} title="Verified">
                <p>
                  Code{' '}
                  <code
                    className="rounded px-2 py-0.5 text-xs font-bold"
                    style={{
                      backgroundColor: 'var(--wk-good-soft)',
                      color: 'var(--wk-good)',
                      border: '1px solid color-mix(in srgb, var(--wk-good) 30%, transparent)',
                    }}
                  >
                    SJ-982F8484
                  </code>{' '}
                  matches an official record approved by Captain John Smith.
                </p>
                <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                  {[
                    ['Crew member', 'Jane Doe'],
                    ['Position', 'Second Officer'],
                    ['Vessel', 'MV Ocean Star'],
                    ['Service', '180 days'],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <div
                        className="text-[11px] font-semibold uppercase tracking-wider"
                        style={{ color: 'var(--wk-text-muted)' }}
                      >
                        {k}
                      </div>
                      <div className="font-semibold" style={{ color: 'var(--wk-text)' }}>
                        {v}
                      </div>
                    </div>
                  ))}
                </div>
              </ResultExample>

              <ResultExample tone="bad" Icon={XCircle} title="Code not found">
                The verification code you entered doesn't match any records in
                our system. Please double-check the code from the PDF footer.
              </ResultExample>

              <ResultExample tone="warn" Icon={AlertCircle} title="Voided">
                This record has been voided. The original testimonial is no
                longer valid or has been removed from the system.
              </ResultExample>
            </div>
          </div>
        </div>
      </section>

      {/* Audiences */}
      <section className="pb-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-5xl">
            <div className="mb-10 text-center">
              <h2
                className="text-3xl font-bold tracking-tight sm:text-4xl"
                style={{ color: 'var(--wk-text)' }}
              >
                Who can use verification?
              </h2>
              <p
                className="mx-auto mt-3 max-w-2xl text-base"
                style={{ color: 'var(--wk-text-soft)' }}
              >
                Our verification system is designed for anyone who needs to
                verify maritime credentials.
              </p>
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              {AUDIENCES.map((a, i) => (
                <InfoCard key={i} Icon={a.Icon} title={a.title}>
                  <p>{a.description}</p>
                  <p
                    className="mt-3 inline-flex items-center gap-2 text-xs font-semibold"
                    style={{ color: 'var(--wk-accent)' }}
                  >
                    <ArrowRight className="h-3 w-3" />
                    {a.useCase}
                  </p>
                </InfoCard>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="pb-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl">
            <div className="mb-10 text-center">
              <div className="mb-4 inline-flex items-center gap-2">
                <HelpCircle
                  className="h-7 w-7"
                  style={{ color: 'var(--wk-accent)' }}
                />
                <h2
                  className="text-3xl font-bold tracking-tight sm:text-4xl"
                  style={{ color: 'var(--wk-text)' }}
                >
                  Frequently asked questions
                </h2>
              </div>
              <p
                className="text-base"
                style={{ color: 'var(--wk-text-soft)' }}
              >
                Common questions about our verification system.
              </p>
            </div>
            <div className="space-y-3">
              {FAQS.map((faq, i) => (
                <details key={i} className="wk-faq-item">
                  <summary className="wk-faq-summary">
                    <span>{faq.q}</span>
                    <ChevronDown className="wk-faq-chevron h-4 w-4" />
                  </summary>
                  <div className="wk-faq-body">{faq.a}</div>
                </details>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="pb-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div
            className="mx-auto max-w-3xl rounded-3xl p-10 text-center sm:p-14"
            style={{
              background:
                'linear-gradient(135deg, var(--wk-good-soft) 0%, transparent 50%, var(--wk-accent-soft) 100%)',
              border: '1px solid color-mix(in srgb, var(--wk-good) 35%, transparent)',
              boxShadow: 'var(--wk-shadow-lg)',
            }}
          >
            <span
              className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl"
              style={{
                backgroundColor: 'var(--wk-good-soft)',
                color: 'var(--wk-good)',
                border: '1px solid color-mix(in srgb, var(--wk-good) 35%, transparent)',
              }}
            >
              <Shield className="h-7 w-7" />
            </span>
            <h2
              className="mt-5 text-3xl font-bold tracking-tight sm:text-4xl"
              style={{ color: 'var(--wk-text)' }}
            >
              Ready to verify a record?
            </h2>
            <p
              className="mx-auto mt-3 max-w-xl text-base"
              style={{ color: 'var(--wk-text-soft)' }}
            >
              Enter a verification code to instantly check the authenticity of
              any SeaJourney testimonial or sea service record.
            </p>
            <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="/verify" className="wk-btn wk-btn-primary">
                <Search className="h-4 w-4" />
                Verify a record
              </Link>
              <Link href="/" className="wk-btn wk-btn-ghost">
                Back to home
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </WkPageShell>
  );
}
