'use client';

import Link from 'next/link';
import {
  User,
  Ship,
  CalendarDays,
  FileSignature,
  FileText,
  PlusCircle,
  ArrowRight,
  Star,
  ShieldCheck,
  Compass,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { WkPageShell, WkPageHero } from '@/components/wk/wk-page-shell';

// ---------------------------------------------------------------------------
// Step preview tiles — built with wk theme variables so they auto light/dark
// ---------------------------------------------------------------------------

function PreviewShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="w-full max-w-sm rounded-2xl p-5"
      style={{
        backgroundColor: 'var(--wk-card)',
        border: '1px solid var(--wk-line)',
        boxShadow: 'var(--wk-shadow-md)',
      }}
    >
      {children}
    </div>
  );
}

function ProfilePreview() {
  return (
    <PreviewShell>
      <div className="flex items-center gap-4">
        <div
          className="flex h-14 w-14 items-center justify-center rounded-2xl text-lg font-bold text-white"
          style={{ background: 'var(--wk-grad-btn)' }}
        >
          JD
        </div>
        <div>
          <div className="text-base font-semibold" style={{ color: 'var(--wk-text)' }}>
            Jane Doe
          </div>
          <div className="text-xs" style={{ color: 'var(--wk-text-muted)' }}>
            @janedoe
          </div>
        </div>
      </div>
      <div className="mt-5 space-y-2">
        <div
          className="flex items-center justify-between rounded-lg px-3 py-2 text-sm"
          style={{ backgroundColor: 'var(--wk-bg-subtle)' }}
        >
          <span style={{ color: 'var(--wk-text-muted)' }}>Email</span>
          <span className="font-medium" style={{ color: 'var(--wk-text)' }}>
            j.doe@sea.com
          </span>
        </div>
        <div
          className="flex items-center justify-between rounded-lg px-3 py-2 text-sm"
          style={{ backgroundColor: 'var(--wk-bg-subtle)' }}
        >
          <span style={{ color: 'var(--wk-text-muted)' }}>Subscription</span>
          <span className="wk-chip">Premium</span>
        </div>
      </div>
    </PreviewShell>
  );
}

function VesselsPreview() {
  return (
    <PreviewShell>
      <div className="flex items-center justify-between">
        <div className="text-base font-semibold" style={{ color: 'var(--wk-text)' }}>
          Your vessels
        </div>
        <span
          className="inline-flex h-8 w-8 items-center justify-center rounded-full"
          style={{
            backgroundColor: 'var(--wk-accent-soft)',
            color: 'var(--wk-accent)',
            border: '1px solid var(--wk-accent-ring)',
          }}
          aria-hidden="true"
        >
          <PlusCircle className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-4 divide-y" style={{ borderColor: 'var(--wk-line)' }}>
        {[
          { name: 'M/Y Odyssey', status: 'Current', tone: 'good' },
          { name: 'S/Y Wanderer', status: 'Past', tone: 'muted' },
        ].map((row, i) => (
          <div
            key={i}
            className="flex items-center justify-between py-3 text-sm"
            style={{ borderColor: 'var(--wk-line)' }}
          >
            <span className="font-medium" style={{ color: 'var(--wk-text)' }}>
              {row.name}
            </span>
            <span
              className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
              style={
                row.tone === 'good'
                  ? {
                      backgroundColor: 'var(--wk-good-soft)',
                      color: 'var(--wk-good)',
                      border: '1px solid color-mix(in srgb, var(--wk-good) 35%, transparent)',
                    }
                  : {
                      backgroundColor: 'var(--wk-bg-subtle)',
                      color: 'var(--wk-text-muted)',
                      border: '1px solid var(--wk-line)',
                    }
              }
            >
              {row.status}
            </span>
          </div>
        ))}
      </div>
    </PreviewShell>
  );
}

function CalendarPreview() {
  const seaDays = [3, 4, 5, 10, 11, 12, 13, 14, 18, 19, 25, 26, 27];
  const portDays = [
    1, 2, 6, 7, 8, 9, 15, 16, 17, 20, 21, 22, 23, 24, 28, 29, 30, 31,
  ];
  return (
    <PreviewShell>
      <div
        className="mb-3 text-center text-sm font-semibold"
        style={{ color: 'var(--wk-text)' }}
      >
        May 2024
      </div>
      <div
        className="mb-2 grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase"
        style={{ color: 'var(--wk-text-muted)' }}
      >
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs">
        {Array.from({ length: 31 }).map((_, i) => {
          const day = i + 1;
          const isSea = seaDays.includes(day);
          const isPort = portDays.includes(day);
          return (
            <div
              key={i}
              className="flex h-7 items-center justify-center rounded-md font-medium"
              style={{
                backgroundColor: isSea
                  ? 'var(--wk-accent)'
                  : isPort
                    ? 'var(--wk-good-soft)'
                    : 'transparent',
                color: isSea
                  ? '#fff'
                  : isPort
                    ? 'var(--wk-good)'
                    : 'var(--wk-text-muted)',
                border: isPort
                  ? '1px solid color-mix(in srgb, var(--wk-good) 35%, transparent)'
                  : 'none',
              }}
            >
              {day}
            </div>
          );
        })}
      </div>
      <div
        className="mt-4 flex items-center justify-center gap-4 text-[11px]"
        style={{ color: 'var(--wk-text-muted)' }}
      >
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: 'var(--wk-accent)' }}
          />
          Sea day
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: 'var(--wk-good)' }}
          />
          Port day
        </span>
      </div>
    </PreviewShell>
  );
}

function SignatureRequestPreview() {
  return (
    <PreviewShell>
      <div className="flex flex-col items-center text-center">
        <span
          className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl"
          style={{
            backgroundColor: 'var(--wk-accent-soft)',
            color: 'var(--wk-accent)',
            border: '1px solid var(--wk-accent-ring)',
          }}
        >
          <FileSignature className="h-6 w-6" />
        </span>
        <div className="text-base font-semibold" style={{ color: 'var(--wk-text)' }}>
          Request signature
        </div>
        <p
          className="mt-2 text-xs leading-relaxed"
          style={{ color: 'var(--wk-text-soft)' }}
        >
          Generate a secure link for Capt. Smith to sign off your sea time on M/Y
          Odyssey.
        </p>
        <button className="wk-btn wk-btn-primary mt-4 w-full" type="button">
          Generate &amp; send
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </PreviewShell>
  );
}

function ExportPreview() {
  return (
    <PreviewShell>
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4" style={{ color: 'var(--wk-accent)' }} />
        <div className="text-sm font-semibold" style={{ color: 'var(--wk-text)' }}>
          Export center
        </div>
      </div>
      <div
        className="mb-4 mt-1 text-xs"
        style={{ color: 'var(--wk-text-muted)' }}
      >
        One-click professional documents.
      </div>
      <div className="space-y-2">
        {[
          { Icon: FileText, label: 'Full Sea Time Report.pdf' },
          { Icon: Star, label: 'Testimonial_Capt_Smith.pdf' },
        ].map(({ Icon, label }, i) => (
          <div
            key={i}
            className="flex items-center justify-between rounded-lg p-3 text-sm"
            style={{
              backgroundColor: 'var(--wk-bg-subtle)',
              border: '1px solid var(--wk-line)',
            }}
          >
            <span className="inline-flex items-center gap-2.5">
              <Icon className="h-4 w-4" style={{ color: 'var(--wk-text-muted)' }} />
              <span style={{ color: 'var(--wk-text)' }}>{label}</span>
            </span>
            <ArrowRight className="h-4 w-4" style={{ color: 'var(--wk-text-muted)' }} />
          </div>
        ))}
      </div>
    </PreviewShell>
  );
}

function ApprovalPreview() {
  return (
    <PreviewShell>
      <div className="flex flex-col items-center text-center">
        <span
          className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl"
          style={{
            backgroundColor: 'var(--wk-accent-soft)',
            color: 'var(--wk-accent)',
            border: '1px solid var(--wk-accent-ring)',
          }}
        >
          <ShieldCheck className="h-6 w-6" />
        </span>
        <div className="text-base font-semibold" style={{ color: 'var(--wk-text)' }}>
          Submit to MCA
        </div>
        <p
          className="mt-2 text-xs leading-relaxed"
          style={{ color: 'var(--wk-text-soft)' }}
        >
          Send your verified documents for official review.
        </p>
        <button className="wk-btn wk-btn-primary mt-4 w-full opacity-60" disabled>
          Submit for approval
        </button>
      </div>
    </PreviewShell>
  );
}

// ---------------------------------------------------------------------------
// Step list
// ---------------------------------------------------------------------------

type Step = {
  Icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  preview: React.ReactNode;
  comingSoon?: boolean;
};

const steps: Step[] = [
  {
    Icon: User,
    title: '1. Set up your profile',
    description:
      'Create your account and fill in your professional details to get started. This information will be used for your official documents.',
    preview: <ProfilePreview />,
  },
  {
    Icon: Ship,
    title: '2. Add your vessels',
    description:
      "Easily add the vessels you've worked on. Include details like the vessel name, type, and official number for accurate record-keeping.",
    preview: <VesselsPreview />,
  },
  {
    Icon: CalendarDays,
    title: '3. Log your sea time',
    description:
      'Log your sea days with our intuitive calendar. Just select the dates, and the app will calculate your time for you.',
    preview: <CalendarPreview />,
  },
  {
    Icon: FileSignature,
    title: '4. Request digital testimonials',
    description:
      'Generate a sea time testimonial and send a secure link to your captain or superior to get it digitally signed.',
    preview: <SignatureRequestPreview />,
  },
  {
    Icon: FileText,
    title: '5. Export your documents',
    description:
      "When you're ready to apply for a new certificate, export all your logged sea time and signed testimonials into a single, professional PDF.",
    preview: <ExportPreview />,
  },
  {
    Icon: ShieldCheck,
    title: '6. Request official approval',
    description:
      'Submit your digitally signed and verified documents to maritime authorities for official review and certificate issuance.',
    preview: <ApprovalPreview />,
    comingSoon: true,
  },
];

function StepRow({ step, index }: { step: Step; index: number }) {
  const isOdd = index % 2 === 1;
  const { Icon } = step;
  return (
    <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-14">
      <div
        className={cn(
          'text-center lg:text-left',
          isOdd ? 'lg:order-2' : 'lg:order-1',
        )}
      >
        <div className="mb-4 flex items-center justify-center gap-3 lg:justify-start">
          <span
            className="inline-flex h-12 w-12 items-center justify-center rounded-xl"
            style={{
              backgroundColor: 'var(--wk-accent-soft)',
              color: 'var(--wk-accent)',
              border: '1px solid var(--wk-accent-ring)',
            }}
          >
            <Icon className="h-6 w-6" />
          </span>
          {step.comingSoon ? (
            <span
              className="inline-flex items-center rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider"
              style={{
                backgroundColor: 'var(--wk-warn-soft)',
                color: 'var(--wk-warn)',
                border:
                  '1px solid color-mix(in srgb, var(--wk-warn) 40%, transparent)',
              }}
            >
              Coming soon
            </span>
          ) : null}
        </div>
        <h2
          className="text-3xl font-bold tracking-tight sm:text-4xl"
          style={{ color: 'var(--wk-text)' }}
        >
          {step.title}
        </h2>
        <p
          className="mt-4 text-base leading-relaxed sm:text-lg"
          style={{ color: 'var(--wk-text-soft)' }}
        >
          {step.description}
        </p>
      </div>
      <div
        className={cn(
          'flex justify-center',
          isOdd ? 'lg:order-1' : 'lg:order-2',
        )}
      >
        <div
          className="w-full max-w-md rounded-3xl p-3"
          style={{
            backgroundColor: 'var(--wk-bg-subtle)',
            border: '1px solid var(--wk-line)',
          }}
        >
          <div
            className="flex aspect-[4/3] w-full items-center justify-center rounded-2xl p-4"
            style={{
              backgroundColor: 'var(--wk-bg-deep)',
              border: '1px solid var(--wk-line)',
            }}
          >
            {step.preview}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HowToUsePage() {
  return (
    <WkPageShell>
      <WkPageHero
        eyebrow="Guide"
        icon={<Compass className="h-7 w-7" />}
        title={
          <>
            How to use <span className="wk-gradient-text">SeaJourney</span>
          </>
        }
        description="Follow these simple steps to start tracking your sea time like a pro and accelerate your career."
      />

      <section className="pb-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl space-y-20">
            {steps.map((step, index) => (
              <StepRow key={index} step={step} index={index} />
            ))}
          </div>

          <div className="mx-auto mt-24 max-w-3xl text-center">
            <h3
              className="text-2xl font-bold tracking-tight"
              style={{ color: 'var(--wk-text)' }}
            >
              Ready to start?
            </h3>
            <p
              className="mx-auto mt-3 max-w-xl text-base"
              style={{ color: 'var(--wk-text-soft)' }}
            >
              Create your free account in under a minute and begin logging your
              sea time today.
            </p>
            <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="/signup" className="wk-btn wk-btn-primary">
                Create your account
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/login" className="wk-btn wk-btn-ghost">
                Sign in
              </Link>
            </div>
          </div>
        </div>
      </section>
    </WkPageShell>
  );
}
