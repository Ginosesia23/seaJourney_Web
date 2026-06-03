'use client';

/**
 * Shared visual shell for SeaJourney long-form public pages (legal, FAQ,
 * roadmap, marketing landing pages such as /for-vessels). Matches the
 * design language used on the /redesign landing page and the auth shell.
 *
 * The shell provides:
 *   - Scoped `.wk` CSS tokens (light + dark, with auto / manual override)
 *   - Sticky redesign-style header with logo + nav + theme toggle + CTA
 *   - Redesign-style footer
 *   - Reusable typography utility (`wk-prose`) for legal documents
 *
 * Each call site supplies the page hero + body content as children.
 */

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { ArrowRight, Menu, Moon, Sparkles, Sun, X } from 'lucide-react';
import Logo from '@/components/logo';
import { cn } from '@/lib/utils';

export type WkThemeMode = 'auto' | 'light' | 'dark';

const themeCss = `
.wk {
  --wk-bg:          #f5f8fd;
  --wk-bg-raised:  #ffffff;
  --wk-bg-subtle:  #eef3fb;
  --wk-bg-deep:    #e7edf7;
  --wk-card:        #ffffff;
  --wk-card-alt:   #f8fafc;

  --wk-text:        #0b1628;
  --wk-text-soft:   #3b4c64;
  --wk-text-muted:  #6b7b91;

  --wk-line:        rgba(11, 22, 40, 0.10);
  --wk-line-strong: rgba(11, 22, 40, 0.18);

  --wk-accent:        #0ea5e9;
  --wk-accent-strong: #0284c7;
  --wk-accent-soft:   rgba(14, 165, 233, 0.10);
  --wk-accent-ring:   rgba(14, 165, 233, 0.28);

  --wk-accent-2:      #14b8a6;
  --wk-accent-2-soft: rgba(20, 184, 166, 0.12);

  --wk-bad:        #ef4444;
  --wk-bad-soft:   rgba(239, 68, 68, 0.12);
  --wk-good:       #16a34a;
  --wk-good-soft:  rgba(22, 163, 74, 0.12);
  --wk-warn:       #d97706;
  --wk-warn-soft:  rgba(217, 119, 6, 0.14);

  --wk-shadow-sm: 0 1px 2px rgba(11, 22, 40, 0.04);
  --wk-shadow-md: 0 8px 24px -12px rgba(11, 22, 40, 0.18);
  --wk-shadow-lg: 0 24px 60px -32px rgba(11, 22, 40, 0.22);
  --wk-glow:      0 20px 60px -20px rgba(99, 102, 241, 0.35);

  --wk-btn-from:    #0ea5e9;
  --wk-btn-to:      #6366f1;
  --wk-grad-btn:    linear-gradient(135deg, var(--wk-btn-from) 0%, var(--wk-btn-to) 100%);
  --wk-grad-accent: linear-gradient(135deg, var(--wk-accent) 0%, var(--wk-btn-to) 100%);
  --wk-grad-text:   linear-gradient(120deg, var(--wk-accent) 0%, var(--wk-btn-to) 50%, var(--wk-accent) 100%);

  color: var(--wk-text);
  background-color: var(--wk-bg);
}

@media (prefers-color-scheme: dark) {
  .wk:not([data-wk-force="light"]) {
    --wk-bg:          #060b17;
    --wk-bg-raised:  #0a1324;
    --wk-bg-subtle:  #070d1c;
    --wk-bg-deep:    #03070f;
    --wk-card:        #0e1a2e;
    --wk-card-alt:   #111f38;

    --wk-text:        #e7eef9;
    --wk-text-soft:  #a8b6ca;
    --wk-text-muted: #6f8097;

    --wk-line:        rgba(255, 255, 255, 0.08);
    --wk-line-strong: rgba(255, 255, 255, 0.16);

    --wk-accent:        #38bdf8;
    --wk-accent-strong: #0ea5e9;
    --wk-accent-soft:   rgba(56, 189, 248, 0.14);
    --wk-accent-ring:   rgba(56, 189, 248, 0.35);

    --wk-accent-2:      #2dd4bf;
    --wk-accent-2-soft: rgba(45, 212, 191, 0.16);

    --wk-bad:        #f87171;
    --wk-bad-soft:   rgba(248, 113, 113, 0.14);
    --wk-good:       #4ade80;
    --wk-good-soft:  rgba(74, 222, 128, 0.14);
    --wk-warn:       #fbbf24;
    --wk-warn-soft:  rgba(251, 191, 36, 0.16);

    --wk-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
    --wk-shadow-md: 0 10px 30px -12px rgba(0, 0, 0, 0.6);
    --wk-shadow-lg: 0 30px 80px -40px rgba(0, 0, 0, 0.8);
    --wk-glow:      0 20px 60px -20px rgba(129, 140, 248, 0.45);

    --wk-btn-from: #38bdf8;
    --wk-btn-to:   #818cf8;
  }
}

.wk[data-wk-force="dark"] {
  --wk-bg:          #060b17;
  --wk-bg-raised:  #0a1324;
  --wk-bg-subtle:  #070d1c;
  --wk-bg-deep:    #03070f;
  --wk-card:        #0e1a2e;
  --wk-card-alt:   #111f38;

  --wk-text:        #e7eef9;
  --wk-text-soft:  #a8b6ca;
  --wk-text-muted: #6f8097;

  --wk-line:        rgba(255, 255, 255, 0.08);
  --wk-line-strong: rgba(255, 255, 255, 0.16);

  --wk-accent:        #38bdf8;
  --wk-accent-strong: #0ea5e9;
  --wk-accent-soft:   rgba(56, 189, 248, 0.14);
  --wk-accent-ring:   rgba(56, 189, 248, 0.35);

  --wk-accent-2:      #2dd4bf;
  --wk-accent-2-soft: rgba(45, 212, 191, 0.16);

  --wk-bad:        #f87171;
  --wk-bad-soft:   rgba(248, 113, 113, 0.14);
  --wk-good:       #4ade80;
  --wk-good-soft:  rgba(74, 222, 128, 0.14);
  --wk-warn:       #fbbf24;
  --wk-warn-soft:  rgba(251, 191, 36, 0.16);

  --wk-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
  --wk-shadow-md: 0 10px 30px -12px rgba(0, 0, 0, 0.6);
  --wk-shadow-lg: 0 30px 80px -40px rgba(0, 0, 0, 0.8);
  --wk-glow:      0 20px 60px -20px rgba(129, 140, 248, 0.45);

  --wk-btn-from: #38bdf8;
  --wk-btn-to:   #818cf8;
}

/* ---- Page background -------------------------------------------------- */
.wk-page-canvas {
  position: relative;
  isolation: isolate;
  background-color: var(--wk-bg);
  min-height: 100vh;
}
.wk-page-canvas::before {
  content: '';
  position: absolute;
  inset: 0 0 auto 0;
  height: 60vh;
  pointer-events: none;
  background:
    radial-gradient(60% 50% at 20% 0%, color-mix(in srgb, var(--wk-accent) 10%, transparent), transparent 60%),
    radial-gradient(50% 40% at 90% 0%, color-mix(in srgb, var(--wk-btn-to) 10%, transparent), transparent 60%);
  z-index: -1;
}
.wk-dot-grid {
  background-image: radial-gradient(circle at 1px 1px, var(--wk-line-strong) 1px, transparent 0);
  background-size: 22px 22px;
}

/* ---- Headline gradient text ----------------------------------------- */
.wk-gradient-text {
  background: var(--wk-grad-text);
  background-size: 200% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  -webkit-text-fill-color: transparent;
  animation: wk-gradient-shift 8s ease-in-out infinite;
}
@keyframes wk-gradient-shift {
  0%, 100% { background-position: 0% 50%; }
  50%      { background-position: 100% 50%; }
}

/* ---- Buttons --------------------------------------------------------- */
.wk-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  height: 44px;
  padding: 0 1.25rem;
  border-radius: 12px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: transform 0.25s, box-shadow 0.25s, filter 0.25s,
              border-color 0.2s, background-color 0.2s, color 0.2s;
}
.wk-btn-primary {
  color: #fff;
  background: var(--wk-grad-btn);
  box-shadow: var(--wk-glow);
}
.wk-btn-primary:hover { transform: translateY(-1px); filter: saturate(1.08); }
.wk-btn-ghost {
  background-color: var(--wk-bg-raised);
  color: var(--wk-text);
  border: 1px solid var(--wk-line-strong);
}
.wk-btn-ghost:hover {
  transform: translateY(-1px);
  border-color: var(--wk-accent-ring);
  color: var(--wk-accent);
}

/* ---- Chip (small pill) ---------------------------------------------- */
.wk-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  background-color: var(--wk-accent-soft);
  color: var(--wk-accent);
  border: 1px solid var(--wk-accent-ring);
}

/* ---- Cards ----------------------------------------------------------- */
.wk-card {
  background-color: var(--wk-card);
  border: 1px solid var(--wk-line);
  border-radius: 16px;
  box-shadow: var(--wk-shadow-md);
}

/* ---- Section heading helpers --------------------------------------- */
.wk-eyebrow {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--wk-accent);
}

/* ---- Long-form prose ------------------------------------------------- */
.wk-prose {
  color: var(--wk-text-soft);
  font-size: 0.95rem;
  line-height: 1.7;
}
.wk-prose h2 {
  font-size: 1.4rem;
  font-weight: 700;
  color: var(--wk-text);
  margin-top: 2.25rem;
  margin-bottom: 0.75rem;
  letter-spacing: -0.005em;
}
.wk-prose h3 {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--wk-text);
  margin-top: 1.5rem;
  margin-bottom: 0.5rem;
}
.wk-prose p { margin-top: 0.75rem; margin-bottom: 0.75rem; }
.wk-prose ul, .wk-prose ol {
  padding-left: 1.5rem;
  margin-top: 0.5rem;
  margin-bottom: 0.75rem;
}
.wk-prose ul { list-style: disc; }
.wk-prose ol { list-style: decimal; }
.wk-prose li { margin-top: 0.35rem; margin-bottom: 0.35rem; }
.wk-prose a {
  color: var(--wk-accent);
  text-decoration: none;
  border-bottom: 1px solid color-mix(in srgb, var(--wk-accent) 40%, transparent);
  transition: color 0.2s, border-color 0.2s;
}
.wk-prose a:hover {
  color: var(--wk-accent-strong);
  border-bottom-color: var(--wk-accent);
}
.wk-prose strong { color: var(--wk-text); font-weight: 600; }
.wk-prose blockquote {
  border-left: 3px solid var(--wk-accent);
  padding: 0.5rem 1rem;
  margin: 1rem 0;
  background-color: var(--wk-accent-soft);
  border-radius: 0 8px 8px 0;
  color: var(--wk-text);
}
.wk-prose hr {
  border: none;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--wk-line), transparent);
  margin: 2rem 0;
}
.wk-prose code {
  background-color: var(--wk-bg-subtle);
  border: 1px solid var(--wk-line);
  border-radius: 6px;
  padding: 1px 6px;
  font-size: 0.85em;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  color: var(--wk-text);
}

/* ---- Callouts (info / warn / danger) -------------------------------- */
.wk-callout {
  border-radius: 12px;
  padding: 14px 16px;
  border: 1px solid var(--wk-line);
  background-color: var(--wk-bg-subtle);
  color: var(--wk-text);
  font-size: 0.9rem;
  line-height: 1.55;
  margin: 1rem 0;
}
.wk-callout[data-tone="warn"] {
  background-color: var(--wk-warn-soft);
  border-color: color-mix(in srgb, var(--wk-warn) 35%, transparent);
}
.wk-callout[data-tone="bad"] {
  background-color: var(--wk-bad-soft);
  border-color: color-mix(in srgb, var(--wk-bad) 35%, transparent);
}
.wk-callout[data-tone="good"] {
  background-color: var(--wk-good-soft);
  border-color: color-mix(in srgb, var(--wk-good) 35%, transparent);
}
.wk-callout[data-tone="info"] {
  background-color: var(--wk-accent-soft);
  border-color: var(--wk-accent-ring);
}
.wk-callout strong { color: var(--wk-text); }

/* ---- Reduced motion ------------------------------------------------- */
@media (prefers-reduced-motion: reduce) {
  .wk-gradient-text { animation: none; background-position: 0% 50%; }
  .wk-btn { transition: none; }
}
`;

// ---------------------------------------------------------------------------
// Theme persistence + toggle
// ---------------------------------------------------------------------------

export function useWkThemeMode(): [WkThemeMode, (m: WkThemeMode) => void] {
  const [mode, setMode] = useState<WkThemeMode>('auto');
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('wk-theme-mode') as WkThemeMode | null;
      if (saved === 'light' || saved === 'dark' || saved === 'auto') setMode(saved);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem('wk-theme-mode', mode);
    } catch {}
  }, [mode]);
  return [mode, setMode];
}

export function WkThemeToggle({
  mode,
  setMode,
}: {
  mode: WkThemeMode;
  setMode: (m: WkThemeMode) => void;
}) {
  const cycle: Record<WkThemeMode, WkThemeMode> = {
    auto: 'light',
    light: 'dark',
    dark: 'auto',
  };
  const label =
    mode === 'auto' ? 'System theme' : mode === 'light' ? 'Light theme' : 'Dark theme';
  const Icon = mode === 'dark' ? Moon : mode === 'light' ? Sun : Sparkles;
  return (
    <button
      type="button"
      onClick={() => setMode(cycle[mode])}
      className="inline-flex h-9 w-9 items-center justify-center rounded-full"
      style={{
        color: 'var(--wk-text-soft)',
        border: '1px solid var(--wk-line)',
        backgroundColor: 'var(--wk-bg-raised)',
      }}
      title={`${label} · click to switch`}
      aria-label={label}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

const NAV_LINKS: Array<{ href: string; label: string }> = [
  { href: '/how-to-use', label: 'How it works' },
  { href: '/for-vessels', label: 'For vessels' },
  { href: '/request-demo', label: 'Request demo' },
  { href: '/roadmap', label: 'Roadmap' },
  { href: '/faq', label: 'FAQ' },
];

function WkPageHeader({
  mode,
  setMode,
}: {
  mode: WkThemeMode;
  setMode: (m: WkThemeMode) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <header
      className="sticky top-0 z-40 backdrop-blur-xl"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--wk-bg) 80%, transparent)',
        borderBottom: '1px solid var(--wk-line)',
      }}
    >
      <div className="container mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" aria-label="SeaJourney home">
          <Logo className="!text-[color:var(--wk-text)]" />
        </Link>

        <nav className="hidden items-center gap-7 md:flex">
          {NAV_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-sm font-medium transition-opacity hover:opacity-80"
              style={{ color: 'var(--wk-text-soft)' }}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <WkThemeToggle mode={mode} setMode={setMode} />
          <Link
            href="/login"
            className="hidden text-sm font-medium md:inline-block"
            style={{ color: 'var(--wk-text-soft)' }}
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-white shadow-sm"
            style={{
              background: 'linear-gradient(135deg, var(--wk-accent) 0%, var(--wk-accent-strong) 100%)',
              boxShadow: 'var(--wk-glow)',
            }}
          >
            Start free
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <button
            className="ml-1 inline-flex h-9 w-9 items-center justify-center rounded-md md:hidden"
            style={{ color: 'var(--wk-text)', border: '1px solid var(--wk-line)' }}
            onClick={() => setOpen((o) => !o)}
            aria-label="Toggle menu"
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="md:hidden" style={{ borderTop: '1px solid var(--wk-line)' }}>
          <div className="container mx-auto flex flex-col gap-1 px-4 py-3">
            {NAV_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="rounded-lg px-3 py-2 text-sm font-medium"
                style={{ color: 'var(--wk-text)' }}
                onClick={() => setOpen(false)}
              >
                {l.label}
              </Link>
            ))}
            <Link
              href="/login"
              className="rounded-lg px-3 py-2 text-sm font-medium"
              style={{ color: 'var(--wk-text)' }}
              onClick={() => setOpen(false)}
            >
              Sign in
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------

function WkFooterCol({
  title,
  links,
}: {
  title: string;
  links: Array<{ href: string; label: string }>;
}) {
  return (
    <div>
      <h4
        className="text-[11px] font-bold uppercase tracking-widest"
        style={{ color: 'var(--wk-accent)' }}
      >
        {title}
      </h4>
      <ul className="mt-4 space-y-2 text-sm">
        {links.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              className="transition-opacity hover:opacity-75"
              style={{ color: 'var(--wk-text-soft)' }}
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function WkPageFooter() {
  return (
    <footer
      style={{
        backgroundColor: 'var(--wk-bg-raised)',
        borderTop: '1px solid var(--wk-line)',
      }}
    >
      <div className="container mx-auto px-4 py-14 sm:px-6 lg:px-8">
        <div className="flex flex-col justify-between gap-10 md:flex-row md:items-start">
          <div className="max-w-md">
            <Logo className="!text-[color:var(--wk-text)]" />
            <p
              className="mt-4 text-sm"
              style={{ color: 'var(--wk-text-soft)' }}
            >
              SeaJourney is the essential app for yacht crew and maritime
              professionals — log sea time, track certificates, and submit
              career paperwork without the spreadsheet.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-8 sm:grid-cols-3 sm:gap-12 lg:gap-16 md:ml-auto">
            <WkFooterCol
              title="Product"
              links={[
                { href: '/how-to-use', label: 'How it works' },
                { href: '/for-vessels', label: 'For vessels' },
                { href: '/roadmap', label: 'Roadmap' },
                { href: '/verify', label: 'Verify records' },
              ]}
            />
            <WkFooterCol
              title="Company"
              links={[
                { href: '/request-demo', label: 'Request demo' },
                { href: '/faq', label: 'FAQ' },
              ]}
            />
            <WkFooterCol
              title="Legal"
              links={[
                { href: '/privacy-policy', label: 'Privacy' },
                { href: '/terms-of-service', label: 'Terms' },
                { href: '/cookie-policy', label: 'Cookies' },
              ]}
            />
          </div>
        </div>

        <div
          className="mt-12 flex flex-col items-center justify-between gap-3 border-t pt-6 text-xs sm:flex-row"
          style={{ borderColor: 'var(--wk-line)', color: 'var(--wk-text-muted)' }}
        >
          <p>&copy; {new Date().getFullYear()} SeaJourney. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}

// ---------------------------------------------------------------------------
// Page hero (optional)
// ---------------------------------------------------------------------------

export function WkPageHero({
  eyebrow,
  icon,
  title,
  description,
  meta,
}: {
  eyebrow?: string;
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden">
      <div className="container mx-auto px-4 pb-10 pt-14 sm:px-6 sm:pb-14 sm:pt-20 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          {icon ? (
            <div
              className="mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl"
              style={{
                backgroundColor: 'var(--wk-accent-soft)',
                color: 'var(--wk-accent)',
                border: '1px solid var(--wk-accent-ring)',
              }}
              aria-hidden="true"
            >
              {icon}
            </div>
          ) : null}
          {eyebrow ? <span className="wk-chip">{eyebrow}</span> : null}
          <h1
            className="mt-5 text-4xl font-bold tracking-tight sm:text-5xl"
            style={{ color: 'var(--wk-text)' }}
          >
            {title}
          </h1>
          {description ? (
            <p
              className="mx-auto mt-4 max-w-2xl text-base sm:text-lg"
              style={{ color: 'var(--wk-text-soft)' }}
            >
              {description}
            </p>
          ) : null}
          {meta ? (
            <div
              className="mt-4 text-xs"
              style={{ color: 'var(--wk-text-muted)' }}
            >
              {meta}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Section card with icon-led header (used for legal / info pages)
// ---------------------------------------------------------------------------

export function WkSectionCard({
  icon,
  title,
  children,
  compact,
  className,
}: {
  icon?: ReactNode;
  title?: ReactNode;
  children: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn('wk-card overflow-hidden', className)}
      style={{ borderRadius: '16px' }}
    >
      <div className={compact ? 'p-6' : 'p-7 sm:p-8'}>
        {title || icon ? (
          <div className="mb-5 flex items-center gap-3">
            {icon ? (
              <span
                className="inline-flex h-10 w-10 flex-none items-center justify-center rounded-xl"
                style={{
                  backgroundColor: 'var(--wk-accent-soft)',
                  color: 'var(--wk-accent)',
                  border: '1px solid var(--wk-accent-ring)',
                }}
                aria-hidden="true"
              >
                {icon}
              </span>
            ) : null}
            {title ? (
              <h2
                className={cn(
                  'font-semibold tracking-tight',
                  compact ? 'text-lg' : 'text-xl sm:text-2xl',
                )}
                style={{ color: 'var(--wk-text)' }}
              >
                {title}
              </h2>
            ) : null}
          </div>
        ) : null}
        <div className="wk-prose">{children}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

export type WkPageShellProps = {
  children: ReactNode;
  /** Additional classes to apply to the <main> wrapper. */
  mainClassName?: string;
  /** Hide the sticky header (e.g. for embedded pages). */
  hideHeader?: boolean;
  /** Hide the global footer. */
  hideFooter?: boolean;
};

export function WkPageShell({
  children,
  mainClassName,
  hideHeader,
  hideFooter,
}: WkPageShellProps) {
  const [mode, setMode] = useWkThemeMode();
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: themeCss }} />
      <div
        className="wk wk-page-canvas font-sans antialiased"
        data-wk-force={mode === 'auto' ? undefined : mode}
      >
        <div className="flex min-h-screen flex-col">
          {!hideHeader ? <WkPageHeader mode={mode} setMode={setMode} /> : null}
          <main className={cn('flex-1', mainClassName)}>{children}</main>
          {!hideFooter ? <WkPageFooter /> : null}
        </div>
      </div>
    </>
  );
}
