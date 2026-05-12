'use client';

/**
 * Shared visual shell for the SeaJourney onboarding / auth pages (login,
 * signup, forgot password, reset password, etc.). Matches the design
 * language used on the /redesign landing page:
 *
 *   - Soft-neutral canvas in light mode, deep-navy canvas in dark mode
 *   - Sky-blue / teal gradient accents
 *   - Floating card with hover accent stripe and subtle ambient glow
 *   - Auto-follows the OS colour scheme, with a manual override stored
 *     in localStorage so it's consistent across the auth flow
 *
 * The shell owns:
 *   - The <style> tag with scoped `.wk`-prefixed CSS tokens + primitives
 *   - The outer layout (header with logo + theme toggle, centered content,
 *     compact footer)
 *   - An optional hero-style sidebar for larger screens
 *
 * Call sites supply only the form card content as children.
 */

import Link from 'next/link';
import { useEffect, useState, type ReactNode, type ButtonHTMLAttributes } from 'react';
import { Loader2, Moon, Sparkles, Sun, ArrowLeft, ArrowRight } from 'lucide-react';
import Logo from '@/components/logo';
import { cn } from '@/lib/utils';

export type WkThemeMode = 'auto' | 'light' | 'dark';

// Shared class strings so auth pages stay visually consistent
export const wkInputCls =
  'wk-input block w-full rounded-lg px-3.5 py-2.5 text-sm outline-none';
export const wkLabelCls = 'wk-label text-xs font-semibold uppercase tracking-wide';

const themeCss = `
.wk {
  --wk-bg:          #f5f8fd;
  --wk-bg-raised:  #ffffff;
  --wk-bg-subtle:  #eef3fb;
  --wk-bg-deep:    #e7edf7;
  --wk-card:        #ffffff;
  --wk-card-alt:   #f8fafc;

  --wk-text:          #0b1628;
  --wk-text-soft:    #3b4c64;
  --wk-text-muted:  #6b7b91;

  --wk-line:         rgba(11, 22, 40, 0.10);
  --wk-line-strong: rgba(11, 22, 40, 0.18);

  --wk-accent:       #0ea5e9;
  --wk-accent-strong: #0284c7;
  --wk-accent-soft: rgba(14, 165, 233, 0.10);
  --wk-accent-ring: rgba(14, 165, 233, 0.28);

  --wk-accent-2:      #14b8a6;
  --wk-accent-2-soft: rgba(20, 184, 166, 0.12);

  --wk-bad:     #ef4444;
  --wk-bad-soft: rgba(239, 68, 68, 0.12);

  --wk-good:      #16a34a;
  --wk-good-soft: rgba(22, 163, 74, 0.12);
  --wk-good-ring: rgba(22, 163, 74, 0.30);

  --wk-warn:      #d97706;
  --wk-warn-soft: rgba(217, 119, 6, 0.14);
  --wk-warn-ring: rgba(217, 119, 6, 0.30);

  --wk-shadow-sm: 0 1px 2px rgba(11, 22, 40, 0.04);
  --wk-shadow-md: 0 8px 24px -12px rgba(11, 22, 40, 0.18);
  --wk-shadow-lg: 0 24px 60px -32px rgba(11, 22, 40, 0.22);
  --wk-glow:     0 20px 60px -20px rgba(99, 102, 241, 0.35);

  /* Primary CTA gradient — sky-blue → indigo, to stay in the cool/blue
     family while avoiding the teal. The landing page "sky" gradient text
     variant uses the same pair, so buttons and headlines visually rhyme. */
  --wk-btn-from:   #0ea5e9;
  --wk-btn-to:     #6366f1;
  --wk-grad-btn:   linear-gradient(135deg, var(--wk-btn-from) 0%, var(--wk-btn-to) 100%);

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

    --wk-accent:       #38bdf8;
    --wk-accent-strong: #0ea5e9;
    --wk-accent-soft:  rgba(56, 189, 248, 0.14);
    --wk-accent-ring: rgba(56, 189, 248, 0.35);

    --wk-accent-2:      #2dd4bf;
    --wk-accent-2-soft: rgba(45, 212, 191, 0.16);

    --wk-bad:         #f87171;
    --wk-bad-soft:   rgba(248, 113, 113, 0.14);

    --wk-good:       #4ade80;
    --wk-good-soft:  rgba(74, 222, 128, 0.14);
    --wk-good-ring:  rgba(74, 222, 128, 0.32);

    --wk-warn:       #fbbf24;
    --wk-warn-soft:  rgba(251, 191, 36, 0.16);
    --wk-warn-ring:  rgba(251, 191, 36, 0.32);

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

  --wk-accent:       #38bdf8;
  --wk-accent-strong: #0ea5e9;
  --wk-accent-soft:  rgba(56, 189, 248, 0.14);
  --wk-accent-ring: rgba(56, 189, 248, 0.35);

  --wk-accent-2:      #2dd4bf;
  --wk-accent-2-soft: rgba(45, 212, 191, 0.16);

  --wk-bad:         #f87171;
  --wk-bad-soft:   rgba(248, 113, 113, 0.14);

  --wk-good:       #4ade80;
  --wk-good-soft:  rgba(74, 222, 128, 0.14);
  --wk-good-ring:  rgba(74, 222, 128, 0.32);

  --wk-warn:       #fbbf24;
  --wk-warn-soft:  rgba(251, 191, 36, 0.16);
  --wk-warn-ring:  rgba(251, 191, 36, 0.32);

  --wk-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
  --wk-shadow-md: 0 10px 30px -12px rgba(0, 0, 0, 0.6);
  --wk-shadow-lg: 0 30px 80px -40px rgba(0, 0, 0, 0.8);
  --wk-glow:      0 20px 60px -20px rgba(129, 140, 248, 0.45);

  --wk-btn-from: #38bdf8;
  --wk-btn-to:   #818cf8;
}

/* ---- Background decor --------------------------------------------------- */
.wk-dot-grid {
  background-image: radial-gradient(circle at 1px 1px, var(--wk-line-strong) 1px, transparent 0);
  background-size: 22px 22px;
}

.wk-auth-canvas {
  position: relative;
  isolation: isolate;
  background-color: var(--wk-bg);
}

/* ---- Headline gradient text -------------------------------------------- */
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

/* ---- Card + hover accent stripe ---------------------------------------- */
.wk-auth-card {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  border-radius: 20px;
  background-color: var(--wk-card);
  border: 1px solid var(--wk-line);
  box-shadow: var(--wk-shadow-lg);
  transition: transform 0.35s cubic-bezier(0.22, 1, 0.36, 1),
              box-shadow 0.35s ease, border-color 0.35s ease;
}
.wk-auth-card::before {
  content: '';
  position: absolute;
  left: 0; right: 0; top: 0;
  height: 3px;
  background: var(--wk-grad-accent);
  opacity: 1;
  z-index: 1;
  transition: background 0.4s ease;
}

/* SJ (testimonial) tone — sky-blue → indigo (matches the brand). This is
   already the default, but we declare it explicitly so toggling between
   SJ and POS animates the stripe smoothly. */
.wk-auth-card[data-code-type="sj"] {
  --wk-accent: #0ea5e9;
  --wk-accent-strong: #0284c7;
  --wk-accent-soft: rgba(14, 165, 233, 0.10);
  --wk-accent-ring: rgba(14, 165, 233, 0.28);
  --wk-grad-accent: linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%);
}

/* POS (proof of service) tone — teal → cyan, distinct from the testimonial
   blue while staying in the cool / maritime family. */
.wk-auth-card[data-code-type="pos"] {
  --wk-accent: #14b8a6;
  --wk-accent-strong: #0d9488;
  --wk-accent-soft: rgba(20, 184, 166, 0.12);
  --wk-accent-ring: rgba(20, 184, 166, 0.32);
  --wk-grad-accent: linear-gradient(135deg, #14b8a6 0%, #06b6d4 100%);
}

/* Dark-mode tweaks so neither tone gets washed out on the deep navy canvas. */
@media (prefers-color-scheme: dark) {
  .wk:not([data-wk-force="light"]) .wk-auth-card[data-code-type="sj"] {
    --wk-accent: #38bdf8;
    --wk-accent-strong: #0ea5e9;
    --wk-accent-soft: rgba(56, 189, 248, 0.14);
    --wk-accent-ring: rgba(56, 189, 248, 0.35);
    --wk-grad-accent: linear-gradient(135deg, #38bdf8 0%, #818cf8 100%);
  }
  .wk:not([data-wk-force="light"]) .wk-auth-card[data-code-type="pos"] {
    --wk-accent: #2dd4bf;
    --wk-accent-strong: #14b8a6;
    --wk-accent-soft: rgba(45, 212, 191, 0.16);
    --wk-accent-ring: rgba(45, 212, 191, 0.35);
    --wk-grad-accent: linear-gradient(135deg, #2dd4bf 0%, #22d3ee 100%);
  }
}
.wk[data-wk-force="dark"] .wk-auth-card[data-code-type="sj"] {
  --wk-accent: #38bdf8;
  --wk-accent-strong: #0ea5e9;
  --wk-accent-soft: rgba(56, 189, 248, 0.14);
  --wk-accent-ring: rgba(56, 189, 248, 0.35);
  --wk-grad-accent: linear-gradient(135deg, #38bdf8 0%, #818cf8 100%);
}
.wk[data-wk-force="dark"] .wk-auth-card[data-code-type="pos"] {
  --wk-accent: #2dd4bf;
  --wk-accent-strong: #14b8a6;
  --wk-accent-soft: rgba(45, 212, 191, 0.16);
  --wk-accent-ring: rgba(45, 212, 191, 0.35);
  --wk-grad-accent: linear-gradient(135deg, #2dd4bf 0%, #22d3ee 100%);
}
.wk-auth-card::after {
  content: '';
  position: absolute;
  inset: -1px;
  border-radius: inherit;
  pointer-events: none;
  opacity: 0.55;
  background: radial-gradient(
    500px circle at 50% -10%,
    color-mix(in srgb, var(--wk-accent) 14%, transparent),
    transparent 60%
  );
  z-index: -1;
}

/* ---- Inputs ------------------------------------------------------------- */
.wk-input {
  background-color: var(--wk-bg-raised);
  border: 1px solid var(--wk-line);
  color: var(--wk-text);
  font: inherit;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease;
}
.wk-input::placeholder { color: var(--wk-text-muted); }
.wk-input:hover { border-color: var(--wk-line-strong); }
.wk-input:focus,
.wk-input:focus-visible {
  outline: none;
  border-color: var(--wk-accent);
  box-shadow: 0 0 0 3px var(--wk-accent-ring);
}
.wk-input[aria-invalid="true"] {
  border-color: var(--wk-bad);
  box-shadow: 0 0 0 3px var(--wk-bad-soft);
}

.wk-label { color: var(--wk-text-soft); }

/* Native select arrow restyle for consistency in dark mode */
.wk-select {
  appearance: none;
  -webkit-appearance: none;
  background-image:
    linear-gradient(45deg, transparent 50%, currentColor 50%),
    linear-gradient(135deg, currentColor 50%, transparent 50%);
  background-position:
    calc(100% - 18px) calc(50% - 2px),
    calc(100% - 13px) calc(50% - 2px);
  background-size: 5px 5px, 5px 5px;
  background-repeat: no-repeat;
  padding-right: 32px;
}

/* ---- Buttons ------------------------------------------------------------ */
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
  letter-spacing: 0.005em;
  cursor: pointer;
  white-space: nowrap;
  transition: transform 0.25s cubic-bezier(0.22, 1, 0.36, 1),
              box-shadow 0.25s ease, filter 0.25s ease, border-color 0.2s ease,
              background-color 0.2s ease, color 0.2s ease;
}
.wk-btn:disabled { opacity: 0.6; cursor: not-allowed; }

.wk-btn-primary {
  color: #ffffff;
  background: var(--wk-grad-btn);
  box-shadow: var(--wk-glow);
  position: relative;
  overflow: hidden;
  isolation: isolate;
}
.wk-btn-primary::after {
  content: '';
  position: absolute;
  inset: 0;
  transform: translateX(-120%) skewX(-20deg);
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.28) 45%,
    rgba(255, 255, 255, 0.42) 50%,
    rgba(255, 255, 255, 0.28) 55%,
    transparent 100%
  );
  transition: transform 0.8s cubic-bezier(0.22, 1, 0.36, 1);
  pointer-events: none;
  z-index: 1;
}
.wk-btn-primary > * { position: relative; z-index: 2; }
.wk-btn-primary:not(:disabled):hover {
  transform: translateY(-1px);
  filter: saturate(1.08);
}
.wk-btn-primary:not(:disabled):hover::after {
  transform: translateX(140%) skewX(-20deg);
}

.wk-btn-ghost {
  background-color: var(--wk-bg-raised);
  color: var(--wk-text);
  border: 1px solid var(--wk-line-strong);
}
.wk-btn-ghost:not(:disabled):hover {
  transform: translateY(-1px);
  border-color: var(--wk-accent-ring);
  color: var(--wk-accent);
}

.wk-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  background-color: var(--wk-accent-soft);
  color: var(--wk-accent);
  border: 1px solid var(--wk-accent-ring);
}

.wk-link {
  color: var(--wk-accent);
  font-weight: 500;
  transition: color 0.2s ease;
  text-decoration: none;
}
.wk-link:hover {
  color: var(--wk-accent-strong);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.wk-error {
  color: var(--wk-bad);
  font-size: 0.8rem;
  margin-top: 0.35rem;
}

/* ---- Aside hero (desktop ≥ md) ----------------------------------------- */
.wk-aside {
  position: relative;
  overflow: hidden;
  background-color: var(--wk-bg-raised);
  border-right: 1px solid var(--wk-line);
}
.wk-aside::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image: radial-gradient(circle at 1px 1px, var(--wk-line-strong) 1px, transparent 0);
  background-size: 26px 26px;
  opacity: 0.5;
  pointer-events: none;
}

/* ---- Segmented pill (e.g. SJ / POS toggle) ------------------------------ */
.wk-pill-group {
  display: inline-flex;
  padding: 4px;
  border-radius: 999px;
  background-color: var(--wk-bg-subtle);
  border: 1px solid var(--wk-line);
}
.wk-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: var(--wk-text-muted);
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease, transform 0.2s ease;
}
.wk-pill:hover { color: var(--wk-text); }
.wk-pill[aria-pressed="true"] {
  color: #ffffff;
  background: var(--wk-grad-accent);
  box-shadow: 0 6px 18px -8px color-mix(in srgb, var(--wk-accent) 70%, transparent);
}

/* ---- OTP-style single-character code box -------------------------------- */
.wk-code-box {
  /* Use block so the input behaves predictably across browsers, with the
     glyph centred via text-align + line-height instead of flexbox (flexbox
     doesn't center text content inside a native <input>). */
  display: block;
  flex: 0 0 auto;
  width: 2rem;
  height: 2.75rem;
  padding: 0;
  margin: 0;
  border-radius: 12px;
  background-color: var(--wk-bg-raised);
  border: 1.5px solid var(--wk-line);
  color: var(--wk-text);
  font-size: 1.125rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  text-transform: uppercase;
  text-align: center;
  line-height: calc(2.75rem - 4px);
  outline: none;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.15s ease;
  /* Belt-and-braces: kill any UA-specific defaults that would shift the
     cursor / glyph off-centre (Safari & some Chromium versions). */
  -webkit-appearance: none;
  appearance: none;
  caret-color: var(--wk-accent);
}
.wk-code-box::-webkit-inner-spin-button,
.wk-code-box::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.wk-code-box:hover { border-color: var(--wk-line-strong); }
.wk-code-box:focus,
.wk-code-box:focus-visible {
  border-color: var(--wk-accent);
  box-shadow: 0 0 0 3px var(--wk-accent-ring);
  transform: translateY(-1px);
}
@media (min-width: 640px) {
  .wk-code-box {
    width: 3rem;
    height: 3.5rem;
    font-size: 1.5rem;
    line-height: calc(3.5rem - 4px);
  }
}

/* ---- Status banner (verified / voided / not-found) ---------------------- */
.wk-status-banner {
  position: relative;
  border-radius: 16px;
  padding: 16px 20px;
  border: 1px solid var(--wk-line);
  background-color: var(--wk-bg-raised);
  display: flex;
  align-items: flex-start;
  gap: 14px;
}
.wk-status-banner[data-tone="good"] {
  border-color: var(--wk-good-ring);
  background:
    linear-gradient(135deg, var(--wk-good-soft), transparent 70%),
    var(--wk-bg-raised);
}
.wk-status-banner[data-tone="bad"] {
  border-color: rgba(239, 68, 68, 0.35);
  background:
    linear-gradient(135deg, var(--wk-bad-soft), transparent 70%),
    var(--wk-bg-raised);
}
.wk-status-banner[data-tone="warn"] {
  border-color: var(--wk-warn-ring);
  background:
    linear-gradient(135deg, var(--wk-warn-soft), transparent 70%),
    var(--wk-bg-raised);
}
.wk-status-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px; height: 40px;
  border-radius: 12px;
  flex: none;
}
.wk-status-icon[data-tone="good"] {
  color: var(--wk-good); background-color: var(--wk-good-soft);
  border: 1px solid var(--wk-good-ring);
}
.wk-status-icon[data-tone="bad"] {
  color: var(--wk-bad); background-color: var(--wk-bad-soft);
  border: 1px solid rgba(239, 68, 68, 0.30);
}
.wk-status-icon[data-tone="warn"] {
  color: var(--wk-warn); background-color: var(--wk-warn-soft);
  border: 1px solid var(--wk-warn-ring);
}

/* ---- Section heading + data row ----------------------------------------- */
.wk-section-eyebrow {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--wk-accent);
}
.wk-data-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--wk-text-muted);
}
.wk-data-value {
  font-size: 1rem;
  font-weight: 500;
  color: var(--wk-text);
  word-break: break-word;
}
.wk-divider {
  height: 1px;
  width: 100%;
  background: linear-gradient(
    90deg,
    transparent 0%,
    var(--wk-line) 20%,
    var(--wk-line) 80%,
    transparent 100%
  );
}

/* ---- Code/credential block --------------------------------------------- */
.wk-credential {
  display: block;
  padding: 12px 14px;
  border-radius: 12px;
  background-color: var(--wk-bg-subtle);
  border: 1px dashed var(--wk-accent-ring);
  color: var(--wk-accent);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-weight: 700;
  letter-spacing: 0.04em;
  word-break: break-all;
}

/* ---- Respect reduced motion ------------------------------------------- */
@media (prefers-reduced-motion: reduce) {
  .wk-gradient-text { animation: none; background-position: 0% 50%; }
  .wk-auth-card, .wk-btn, .wk-btn-primary::after, .wk-code-box, .wk-pill {
    transition: none;
  }
  .wk-btn-primary::after { display: none; }
}
`;

// ---------------------------------------------------------------------------
// Theme toggle (auto / light / dark)
// ---------------------------------------------------------------------------

export function ThemeToggle({
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
// Primary submit button with the "sheen on hover" interaction
// ---------------------------------------------------------------------------

type WkPrimarySubmitProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
  icon?: ReactNode;
};

export function WkPrimarySubmit({
  loading,
  icon,
  className,
  children,
  disabled,
  ...rest
}: WkPrimarySubmitProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cn('wk-btn wk-btn-primary w-full', className)}
    >
      <span className="inline-flex items-center gap-2">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {children}
        {!loading && (icon ?? <ArrowRight className="h-4 w-4" />)}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Shell: outer layout + theme style injection + mode persistence
// ---------------------------------------------------------------------------

export type WkAuthShellProps = {
  children: ReactNode;
  /** Optional rich content to show in the left aside on wider screens. */
  aside?: ReactNode;
  /** When true, no back-to-home link is shown in the header. */
  hideBackLink?: boolean;
  /**
   * Card container width. Default `'sm'` = max-w-md (single-column login),
   * `'md'` = max-w-lg (crew signup), `'lg'` = max-w-2xl (vessel signup),
   * `'xl'` = max-w-4xl (record-heavy pages such as the verification result).
   */
  size?: 'sm' | 'md' | 'lg' | 'xl';
};

/**
 * Simple hook that exposes the current theme mode + a setter, persisted in
 * localStorage so the chosen theme stays stable across the auth flow.
 */
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

export function WkAuthShell({
  children,
  aside,
  hideBackLink,
  size = 'sm',
}: WkAuthShellProps) {
  const [mode, setMode] = useWkThemeMode();

  const widthCls =
    size === 'xl'
      ? 'max-w-4xl'
      : size === 'lg'
        ? 'max-w-2xl'
        : size === 'md'
          ? 'max-w-lg'
          : 'max-w-md';

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: themeCss }} />
      <div
        className="wk wk-auth-canvas h-screen overflow-hidden font-sans antialiased"
        data-wk-force={mode === 'auto' ? undefined : mode}
      >
        <div className="flex h-full flex-col lg:flex-row">
          {/* Optional hero aside — only shown on large screens. Scrolls
              internally so its content is always reachable even on short
              viewports, without shifting the form card. */}
          {aside ? (
            <aside className="wk-aside hidden h-full w-full max-w-xl flex-col justify-between overflow-y-auto p-10 lg:flex">
              {aside}
            </aside>
          ) : null}

          <div className="flex min-h-0 flex-1 flex-col">
            {/* Top bar: logo + back + theme toggle — stays pinned */}
            <header className="flex flex-none items-center justify-between px-4 py-4 sm:px-8">
              <Logo className="!text-[color:var(--wk-text)]" />
              <div className="flex items-center gap-2">
                {!hideBackLink ? (
                  <Link
                    href="/"
                    className="hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium sm:inline-flex"
                    style={{
                      color: 'var(--wk-text-muted)',
                      border: '1px solid var(--wk-line)',
                      backgroundColor: 'var(--wk-bg-raised)',
                    }}
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    <span>Home</span>
                  </Link>
                ) : null}
                <ThemeToggle mode={mode} setMode={setMode} />
              </div>
            </header>

            {/* Main content — the ONLY vertically scrolling region. Uses
                min-h-0 so the flex child can shrink, and the inner grid
                centers the card when it fits and lets it flow from the top
                when it's taller than the viewport. */}
            <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-8 sm:px-6">
              <div
                className={cn(
                  'relative mx-auto grid min-h-full w-full place-items-center',
                  widthCls,
                )}
              >
                <div className="relative w-full">
                  <div
                    className="wk-dot-grid absolute inset-0 -z-10 opacity-40"
                    aria-hidden="true"
                  />
                  {children}
                </div>
              </div>
            </main>

            <footer
              className="flex-none px-4 py-4 text-center text-xs sm:px-8"
              style={{ color: 'var(--wk-text-muted)' }}
            >
              © {new Date().getFullYear()} SeaJourney · Digital sea service records
            </footer>
          </div>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// A simple, reusable "aside hero" for the left panel. Call sites can pass
// custom content instead, but this covers the common case.
// ---------------------------------------------------------------------------

export function WkAsideHero({
  eyebrow = 'SeaJourney',
  title,
  description,
  bullets,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  bullets?: Array<{ label: string; sub?: string; icon?: ReactNode }>;
}) {
  return (
    <div className="relative flex h-full w-full flex-col justify-between">
      <div>
        <span className="wk-chip">{eyebrow}</span>
        <h2
          className="mt-6 text-4xl font-semibold leading-tight tracking-tight"
          style={{ color: 'var(--wk-text)' }}
        >
          {title}
        </h2>
        {description ? (
          <p
            className="mt-4 max-w-md text-base leading-relaxed"
            style={{ color: 'var(--wk-text-soft)' }}
          >
            {description}
          </p>
        ) : null}

        {bullets && bullets.length > 0 ? (
          <ul className="mt-8 space-y-4">
            {bullets.map((b, i) => (
              <li key={i} className="flex items-start gap-3">
                <span
                  className="mt-0.5 inline-flex h-8 w-8 flex-none items-center justify-center rounded-lg"
                  style={{
                    backgroundColor: 'var(--wk-accent-soft)',
                    color: 'var(--wk-accent)',
                    border: '1px solid var(--wk-accent-ring)',
                  }}
                >
                  {b.icon}
                </span>
                <div>
                  <div
                    className="text-sm font-semibold"
                    style={{ color: 'var(--wk-text)' }}
                  >
                    {b.label}
                  </div>
                  {b.sub ? (
                    <div
                      className="text-xs"
                      style={{ color: 'var(--wk-text-muted)' }}
                    >
                      {b.sub}
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div
        className="mt-8 border-t pt-6 text-xs"
        style={{
          borderColor: 'var(--wk-line)',
          color: 'var(--wk-text-muted)',
        }}
      >
        Trusted by crew and vessels to generate verifiable sea time records.
      </div>
    </div>
  );
}
