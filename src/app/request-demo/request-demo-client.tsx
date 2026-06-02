'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import {
  CalendarClock,
  CheckCircle2,
  MonitorPlay,
  Ship,
  Users,
} from 'lucide-react';

import {
  WkPageShell,
  WkPageHero,
  WkSectionCard,
} from '@/components/wk/wk-page-shell';
import {
  WkPrimarySubmit,
  wkInputCls,
  wkLabelCls,
} from '@/components/wk/wk-auth-shell';
import { cn } from '@/lib/utils';

const demoRequestSchema = z.object({
  name: z.string().trim().min(2, 'Please enter your name.').max(120),
  email: z.string().trim().email('Please enter a valid email address.').max(254),
  company: z.string().trim().max(160).optional(),
  audience: z.enum(['crew', 'vessel', 'fleet', 'other'], {
    required_error: 'Please tell us who you are.',
  }),
  interest: z.enum(['crew', 'vessel', 'both', 'not_sure'], {
    required_error: 'Please select what you are interested in.',
  }),
  message: z.string().trim().max(4000).optional(),
  website: z.string().optional(),
});

type DemoRequestFormValues = z.infer<typeof demoRequestSchema>;

const DEMO_HIGHLIGHTS = [
  {
    icon: MonitorPlay,
    title: 'Live walkthrough',
    description: 'See sea time logging, calendar sync, testimonials, and vessel tools in action.',
  },
  {
    icon: Users,
    title: 'Crew or vessel',
    description: 'Whether you are building your career or running a yacht, we tailor the demo to you.',
  },
  {
    icon: Ship,
    title: 'No pressure',
    description: 'Ask questions, explore plans, and decide if SeaJourney fits your workflow.',
  },
];

export default function RequestDemoPage() {
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm<DemoRequestFormValues>({
    resolver: zodResolver(demoRequestSchema),
    defaultValues: {
      name: '',
      email: '',
      company: '',
      message: '',
      website: '',
    },
  });

  const onSubmit = async (values: DemoRequestFormValues) => {
    setSubmitError(null);
    try {
      const res = await fetch('/api/demo-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error || 'Could not submit your request.');
      }
      setSubmitted(true);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    }
  };

  return (
    <WkPageShell>
      <WkPageHero
        eyebrow="Book a demo"
        icon={<CalendarClock className="h-7 w-7" />}
        title={
          <>
            See SeaJourney{' '}
            <span className="wk-gradient-text">in action</span>
          </>
        }
        description="Request a personalised walkthrough for crew members, vessel managers, or fleet operators. We will get back to you to arrange a time that works."
      />

      <section className="pb-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1fr_1.1fr] lg:items-start">
            <div className="space-y-4">
              {DEMO_HIGHLIGHTS.map(({ icon: Icon, title, description }) => (
                <div key={title} className="wk-card p-5">
                  <div className="flex items-start gap-4">
                    <span
                      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                      style={{
                        backgroundColor: 'var(--wk-accent-soft)',
                        color: 'var(--wk-accent)',
                        border: '1px solid var(--wk-accent-ring)',
                      }}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <div>
                      <h3
                        className="text-base font-semibold"
                        style={{ color: 'var(--wk-text)' }}
                      >
                        {title}
                      </h3>
                      <p className="mt-1 text-sm" style={{ color: 'var(--wk-text-soft)' }}>
                        {description}
                      </p>
                    </div>
                  </div>
                </div>
              ))}

              <div className="wk-callout" data-tone="info">
                <strong>Prefer to explore on your own?</strong> Start a free trial on the web
                portal or download the iOS app — no demo required.
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link href="/signup" className="wk-btn wk-btn-primary !h-9 !px-4 !text-sm">
                    Start free trial
                  </Link>
                  <Link href="/offers" className="wk-btn wk-btn-ghost !h-9 !px-4 !text-sm">
                    View plans
                  </Link>
                </div>
              </div>
            </div>

            <WkSectionCard
              icon={<CalendarClock className="h-5 w-5" />}
              title="Request a demo"
              compact
            >
              {submitted ? (
                <div className="py-4 text-center">
                  <div
                    className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full"
                    style={{
                      backgroundColor: 'var(--wk-good-soft)',
                      color: 'var(--wk-good)',
                      border: '1px solid color-mix(in srgb, var(--wk-good) 35%, transparent)',
                    }}
                  >
                    <CheckCircle2 className="h-7 w-7" />
                  </div>
                  <h3
                    className="text-xl font-semibold"
                    style={{ color: 'var(--wk-text)' }}
                  >
                    Request received
                  </h3>
                  <p className="mx-auto mt-3 max-w-md text-sm" style={{ color: 'var(--wk-text-soft)' }}>
                    Thanks — we have your details and will email you shortly to arrange a demo.
                    Check your inbox for a confirmation message.
                  </p>
                  <Link
                    href="/"
                    className="wk-btn wk-btn-ghost mt-6 inline-flex !h-10"
                  >
                    Back to home
                  </Link>
                </div>
              ) : (
                <form
                  className="space-y-5"
                  onSubmit={form.handleSubmit(onSubmit)}
                  noValidate
                >
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field label="Full name" error={form.formState.errors.name?.message}>
                      <input
                        {...form.register('name')}
                        className={wkInputCls}
                        placeholder="Alex Morgan"
                        autoComplete="name"
                      />
                    </Field>
                    <Field label="Work email" error={form.formState.errors.email?.message}>
                      <input
                        {...form.register('email')}
                        type="email"
                        className={wkInputCls}
                        placeholder="you@example.com"
                        autoComplete="email"
                      />
                    </Field>
                  </div>

                  <Field
                    label="Company or vessel name"
                    hint="Optional"
                    error={form.formState.errors.company?.message}
                  >
                    <input
                      {...form.register('company')}
                      className={wkInputCls}
                      placeholder="M/Y Example"
                      autoComplete="organization"
                    />
                  </Field>

                  <Field label="I am a…" error={form.formState.errors.audience?.message}>
                    <select {...form.register('audience')} className={wkInputCls} defaultValue="">
                      <option value="" disabled>
                        Select one
                      </option>
                      <option value="crew">Crew member</option>
                      <option value="vessel">Vessel / yacht manager</option>
                      <option value="fleet">Fleet operator</option>
                      <option value="other">Other</option>
                    </select>
                  </Field>

                  <Field
                    label="Interested in"
                    error={form.formState.errors.interest?.message}
                  >
                    <select {...form.register('interest')} className={wkInputCls} defaultValue="">
                      <option value="" disabled>
                        Select one
                      </option>
                      <option value="crew">Crew plans</option>
                      <option value="vessel">Vessel plans</option>
                      <option value="both">Both crew and vessel</option>
                      <option value="not_sure">Not sure yet</option>
                    </select>
                  </Field>

                  <Field
                    label="Anything we should know?"
                    hint="Optional — goals, fleet size, timeline, etc."
                    error={form.formState.errors.message?.message}
                  >
                    <textarea
                      {...form.register('message')}
                      className={cn(wkInputCls, 'min-h-[120px] resize-y py-3')}
                      placeholder="Tell us what you would like to see in the demo…"
                    />
                  </Field>

                  {/* Honeypot — hidden from users */}
                  <input
                    {...form.register('website')}
                    type="text"
                    tabIndex={-1}
                    autoComplete="off"
                    className="hidden"
                    aria-hidden="true"
                  />

                  {submitError ? (
                    <div className="wk-callout" data-tone="bad">
                      {submitError}
                    </div>
                  ) : null}

                  <WkPrimarySubmit
                    type="submit"
                    loading={form.formState.isSubmitting}
                    className="w-full"
                  >
                    Request demo
                  </WkPrimarySubmit>

                  <p className="text-center text-xs" style={{ color: 'var(--wk-text-muted)' }}>
                    By submitting, you agree we may contact you about SeaJourney. See our{' '}
                    <Link href="/privacy-policy" className="underline underline-offset-2">
                      Privacy Policy
                    </Link>
                    .
                  </p>
                </form>
              )}
            </WkSectionCard>
          </div>
        </div>
      </section>
    </WkPageShell>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <label className={wkLabelCls} style={{ color: 'var(--wk-text-soft)' }}>
          {label}
        </label>
        {hint ? (
          <span className="text-[11px]" style={{ color: 'var(--wk-text-muted)' }}>
            {hint}
          </span>
        ) : null}
      </div>
      {children}
      {error ? (
        <p className="text-xs" style={{ color: 'var(--wk-bad)' }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
