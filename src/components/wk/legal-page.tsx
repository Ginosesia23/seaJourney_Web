'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowRight, Mail } from 'lucide-react';

export type LegalDoc = 'privacy' | 'terms' | 'cookies';

const LEGAL_LINKS: Array<{ id: LegalDoc; href: string; label: string }> = [
  { id: 'privacy', href: '/privacy-policy', label: 'Privacy' },
  { id: 'terms', href: '/terms-of-service', label: 'Terms' },
  { id: 'cookies', href: '/cookie-policy', label: 'Cookies' },
];

export function legalUpdatedOn() {
  return new Date().toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function LegalPageHeader({
  title,
  description,
  current,
  extras,
}: {
  title: string;
  description: string;
  current: LegalDoc;
  extras?: string[];
}) {
  const date = legalUpdatedOn();
  const otherLinks = LEGAL_LINKS.filter((link) => link.id !== current);

  return (
    <div
      className="mx-auto mb-10 max-w-6xl border-b pb-8 sm:mb-12 sm:pb-10"
      style={{ borderColor: 'var(--wk-line)' }}
    >
      <p className="wk-eyebrow">Legal</p>
      <h1
        className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl"
        style={{ color: 'var(--wk-text)' }}
      >
        {title}
      </h1>
      <p
        className="mt-3 max-w-2xl text-base leading-relaxed sm:text-lg"
        style={{ color: 'var(--wk-text-soft)' }}
      >
        {description}
      </p>
      <p
        className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"
        style={{ color: 'var(--wk-text-muted)' }}
      >
        <span>
          Last updated <span style={{ color: 'var(--wk-text)' }}>{date}</span>
        </span>
        {(extras ?? []).map((extra) => (
          <span key={extra} className="inline-flex items-center gap-x-3">
            <span aria-hidden="true">·</span>
            <span>{extra}</span>
          </span>
        ))}
        {otherLinks.map((link) => (
          <span key={link.id} className="inline-flex items-center gap-x-3">
            <span aria-hidden="true">·</span>
            <Link
              href={link.href}
              className="transition-opacity hover:opacity-75"
              style={{ color: 'var(--wk-text)' }}
            >
              {link.label}
            </Link>
          </span>
        ))}
      </p>
    </div>
  );
}

export function LegalToc({
  sections,
}: {
  sections: readonly { id: string; label: string }[];
}) {
  return (
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
          {sections.map((section, index) => (
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
  );
}

export function LegalSection({
  id,
  kicker,
  title,
  children,
  featured,
}: {
  id: string;
  kicker: string;
  title: string;
  children: ReactNode;
  featured?: boolean;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-28 rounded-3xl p-6 sm:p-8"
      style={{
        backgroundColor: 'var(--wk-card)',
        border: featured
          ? '1px solid var(--wk-accent-ring)'
          : '1px solid var(--wk-line)',
        boxShadow: featured ? 'var(--wk-shadow-md)' : undefined,
      }}
    >
      <p className="wk-eyebrow">{kicker}</p>
      <h2
        className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl"
        style={{ color: 'var(--wk-text)' }}
      >
        {title}
      </h2>
      <div className="mt-5 space-y-3 text-sm leading-relaxed sm:text-base" style={{ color: 'var(--wk-text-soft)' }}>
        {children}
      </div>
    </section>
  );
}

export function LegalContact({
  kicker,
  title,
  body,
}: {
  kicker: string;
  title: string;
  body: string;
}) {
  return (
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
          <p className="wk-eyebrow">{kicker}</p>
          <h2
            className="mt-2 text-2xl font-bold tracking-tight"
            style={{ color: 'var(--wk-text)' }}
          >
            {title}
          </h2>
          <p className="mt-2 max-w-xl text-sm sm:text-base" style={{ color: 'var(--wk-text-soft)' }}>
            {body}
          </p>
        </div>
        <a href="mailto:team@seajourney.co.uk" className="wk-btn wk-btn-primary">
          <Mail className="h-4 w-4" />
          team@seajourney.co.uk
          <ArrowRight className="h-4 w-4" />
        </a>
      </div>
    </section>
  );
}

export function LegalPageFrame({
  header,
  toc,
  children,
}: {
  header: ReactNode;
  toc: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="pb-24 pt-10 sm:pt-14">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {header}
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-14">
          {toc}
          <div className="space-y-8">{children}</div>
        </div>
      </div>
    </section>
  );
}
