'use client';

/**
 * SeaJourney landing page.
 *
 * Yacht Watchkeeper-inspired visual language — deep-navy canvas in dark mode,
 * soft-neutral canvas in light mode, sky-blue accents, partial-coloured
 * headlines, numbered gradient cards, compact feature grids, and a single
 * accent line running through every CTA. Auto light/dark via system, with a
 * manual override stored in localStorage so the choice survives navigation.
 */

import Link from 'next/link';
import { AuthRecoveryHandler } from '@/components/auth-recovery-handler';
import { useEffect, useState, useCallback, type ComponentType, type SVGProps } from 'react';
import { motion } from 'framer-motion';
import {
  Anchor,
  AlertTriangle,
  ArrowRight,
  Award,
  Bell,
  BookOpen,
  Briefcase,
  Building,
  Calendar,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock,
  Cloud,
  Compass,
  Database,
  Download,
  Droplets,
  FileCheck,
  FileText,
  Globe,
  LayoutGrid,
  Menu,
  Monitor,
  Moon,
  Navigation,
  Printer,
  Route,
  ScanSearch,
  Search,
  Shield,
  ShieldCheck,
  Ship,
  Smartphone,
  Sparkles,
  Star,
  Sun,
  Target,
  Thermometer,
  TrendingUp,
  Upload,
  UploadCloud,
  User,
  Users,
  Wand2,
  Watch as WatchIcon,
  Waves,
  Wind,
  Wrench,
  Zap,
} from 'lucide-react';
import Logo from '@/components/logo';
import { cn } from '@/lib/utils';

type IconType = ComponentType<SVGProps<SVGSVGElement>>;

// ---------------------------------------------------------------------------
// Theme: CSS custom properties scoped to `.wk`.
// Light by default; switches to dark when the OS says so.
// ---------------------------------------------------------------------------

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
  --wk-accent-2-ring: rgba(20, 184, 166, 0.30);

  --wk-accent-3:       #8b5cf6;
  --wk-accent-3-soft: rgba(139, 92, 246, 0.12);

  --wk-good:    #10b981;
  --wk-good-soft: rgba(16, 185, 129, 0.12);
  --wk-bad:     #ef4444;
  --wk-bad-soft: rgba(239, 68, 68, 0.10);
  --wk-warm:   #d97706;
  --wk-warm-soft: rgba(217, 119, 6, 0.12);

  --wk-shadow-sm: 0 1px 2px rgba(11, 22, 40, 0.04);
  --wk-shadow-md: 0 8px 24px -12px rgba(11, 22, 40, 0.18);
  --wk-shadow-lg: 0 24px 60px -32px rgba(11, 22, 40, 0.22);
  --wk-glow:     0 20px 60px -20px rgba(14, 165, 233, 0.35);
  --wk-glow-2:   0 20px 60px -20px rgba(20, 184, 166, 0.35);

  --wk-grad-accent: linear-gradient(135deg, var(--wk-accent) 0%, var(--wk-accent-2) 100%);
  --wk-grad-text:   linear-gradient(120deg, var(--wk-accent) 0%, var(--wk-accent-2) 50%, var(--wk-accent) 100%);

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
    --wk-text-muted:  #6f8097;

    --wk-line:        rgba(255, 255, 255, 0.08);
    --wk-line-strong: rgba(255, 255, 255, 0.16);

    --wk-accent:       #38bdf8;
    --wk-accent-strong: #0ea5e9;
    --wk-accent-soft:  rgba(56, 189, 248, 0.14);
    --wk-accent-ring: rgba(56, 189, 248, 0.35);

    --wk-accent-2:      #2dd4bf;
    --wk-accent-2-soft: rgba(45, 212, 191, 0.16);
    --wk-accent-2-ring: rgba(45, 212, 191, 0.38);

    --wk-accent-3:       #a78bfa;
    --wk-accent-3-soft: rgba(167, 139, 250, 0.16);

    --wk-good:        #34d399;
    --wk-good-soft:  rgba(52, 211, 153, 0.14);
    --wk-bad:         #f87171;
    --wk-bad-soft:   rgba(248, 113, 113, 0.14);
    --wk-warm:        #fbbf24;
    --wk-warm-soft:  rgba(251, 191, 36, 0.14);

    --wk-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
    --wk-shadow-md: 0 10px 30px -12px rgba(0, 0, 0, 0.6);
    --wk-shadow-lg: 0 30px 80px -40px rgba(0, 0, 0, 0.8);
    --wk-glow:      0 20px 60px -20px rgba(56, 189, 248, 0.45);
    --wk-glow-2:    0 20px 60px -20px rgba(45, 212, 191, 0.45);
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
  --wk-text-muted:  #6f8097;

  --wk-line:        rgba(255, 255, 255, 0.08);
  --wk-line-strong: rgba(255, 255, 255, 0.16);

  --wk-accent:       #38bdf8;
  --wk-accent-strong: #0ea5e9;
  --wk-accent-soft:  rgba(56, 189, 248, 0.14);
  --wk-accent-ring: rgba(56, 189, 248, 0.35);

  --wk-accent-2:      #2dd4bf;
  --wk-accent-2-soft: rgba(45, 212, 191, 0.16);
  --wk-accent-2-ring: rgba(45, 212, 191, 0.38);

  --wk-accent-3:       #a78bfa;
  --wk-accent-3-soft: rgba(167, 139, 250, 0.16);

  --wk-good:        #34d399;
  --wk-good-soft:  rgba(52, 211, 153, 0.14);
  --wk-bad:         #f87171;
  --wk-bad-soft:   rgba(248, 113, 113, 0.14);
  --wk-warm:        #fbbf24;
  --wk-warm-soft:  rgba(251, 191, 36, 0.14);

  --wk-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
  --wk-shadow-md: 0 10px 30px -12px rgba(0, 0, 0, 0.6);
  --wk-shadow-lg: 0 30px 80px -40px rgba(0, 0, 0, 0.8);
  --wk-glow:      0 20px 60px -20px rgba(56, 189, 248, 0.45);
  --wk-glow-2:    0 20px 60px -20px rgba(45, 212, 191, 0.45);
}

.wk-dot-grid {
  background-image: radial-gradient(circle at 1px 1px, var(--wk-line-strong) 1px, transparent 0);
  background-size: 22px 22px;
}

/* --- Alternate section background --------------------------------------
   Instead of a visibly-lighter panel, alt sections read as a slightly
   "deeper" layer — base color trends toward bg-deep, with an accent wash
   from the top and hairline dividers to give rhythm without a hard step. */
.wk-section-alt {
  position: relative;
  background-color: var(--wk-bg-subtle);
  background-image:
    radial-gradient(80% 60% at 50% 0%,
      color-mix(in srgb, var(--wk-accent) 6%, transparent) 0%,
      transparent 60%),
    linear-gradient(180deg,
      var(--wk-bg) 0%,
      var(--wk-bg-subtle) 14%,
      var(--wk-bg-deep) 60%,
      var(--wk-bg-subtle) 92%,
      var(--wk-bg) 100%);
  isolation: isolate;
}
.wk-section-alt::before,
.wk-section-alt::after {
  content: '';
  position: absolute;
  left: 10%; right: 10%;
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent 0%,
    var(--wk-line-strong) 50%,
    transparent 100%
  );
  pointer-events: none;
}
.wk-section-alt::before { top: 0; }
.wk-section-alt::after  { bottom: 0; }

/* --- Cards ------------------------------------------------------------- */

.wk-card-hover {
  position: relative;
  transition: transform 0.3s cubic-bezier(0.22, 1, 0.36, 1),
              box-shadow 0.3s ease, border-color 0.3s ease;
}
.wk-card-hover:hover {
  transform: translateY(-3px);
  border-color: var(--wk-accent-ring);
  box-shadow: var(--wk-shadow-md);
}

/* Accent stripe that reveals along the top on hover */
.wk-card-accent-top {
  position: relative;
  isolation: isolate;
  overflow: hidden;
}
.wk-card-accent-top::before {
  content: '';
  position: absolute;
  left: 0; right: 0; top: 0;
  height: 2px;
  background: var(--wk-card-accent, var(--wk-grad-accent));
  transform: scaleX(0);
  transform-origin: left center;
  transition: transform 0.45s cubic-bezier(0.22, 1, 0.36, 1);
  z-index: 1;
}
.wk-card-accent-top:hover::before {
  transform: scaleX(1);
}

/* Glowing ring that tracks the cursor region (sits behind content) */
.wk-card-accent-top::after {
  content: '';
  position: absolute;
  inset: -1px;
  border-radius: inherit;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.35s ease;
  background: radial-gradient(
    400px circle at var(--wk-mx, 50%) var(--wk-my, 0%),
    color-mix(in srgb, var(--wk-card-glow, var(--wk-accent)) 14%, transparent),
    transparent 55%
  );
  z-index: -1;
}
.wk-card-accent-top:hover::after {
  opacity: 1;
}

/* --- Buttons ----------------------------------------------------------- */

/* Sheen that sweeps across the primary CTA on hover */
.wk-btn-sheen {
  position: relative;
  overflow: hidden;
  isolation: isolate;
  transition: transform 0.25s cubic-bezier(0.22, 1, 0.36, 1),
              box-shadow 0.25s ease, filter 0.25s ease;
}
.wk-btn-sheen::after {
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
.wk-btn-sheen:hover {
  transform: translateY(-1px);
  filter: saturate(1.08);
  box-shadow: var(--wk-glow), 0 8px 20px -8px rgba(14, 165, 233, 0.45);
}
.wk-btn-sheen:hover::after {
  transform: translateX(140%) skewX(-20deg);
}
.wk-btn-sheen > * {
  position: relative;
  z-index: 2;
}

.wk-btn-ghost {
  transition: transform 0.2s ease, border-color 0.2s ease, color 0.2s ease, background-color 0.2s ease;
}
.wk-btn-ghost:hover {
  transform: translateY(-1px);
  border-color: var(--wk-accent-ring);
  color: var(--wk-accent);
}

/* --- Gradient text & underline ---------------------------------------- */

.wk-gradient-text {
  background: var(--wk-grad-text);
  background-size: 200% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  -webkit-text-fill-color: transparent;
  animation: wk-gradient-shift 8s ease-in-out infinite;
}

/* Per-section color variants — override the gradient hues */
.wk-gradient-text--violet  { --wk-grad-text: linear-gradient(120deg, #a78bfa 0%, #6366f1 50%, #a78bfa 100%); }
.wk-gradient-text--emerald { --wk-grad-text: linear-gradient(120deg, #34d399 0%, #14b8a6 50%, #34d399 100%); }
.wk-gradient-text--amber   { --wk-grad-text: linear-gradient(120deg, #fbbf24 0%, #f97316 50%, #fbbf24 100%); }
.wk-gradient-text--rose    { --wk-grad-text: linear-gradient(120deg, #fb7185 0%, #ec4899 50%, #fb7185 100%); }
.wk-gradient-text--sky     { --wk-grad-text: linear-gradient(120deg, #38bdf8 0%, #6366f1 50%, #38bdf8 100%); }
.wk-gradient-text--sunrise { --wk-grad-text: linear-gradient(120deg, #f59e0b 0%, #f43f5e 50%, #f59e0b 100%); }

@keyframes wk-gradient-shift {
  0%, 100% { background-position: 0% 50%; }
  50%      { background-position: 100% 50%; }
}

.wk-underline-sweep {
  position: relative;
  display: inline-block;
  padding-bottom: 4px;
}
.wk-underline-sweep::after {
  content: '';
  position: absolute;
  left: 0; right: 0;
  bottom: -2px;
  height: 3px;
  border-radius: 999px;
  background: var(--wk-grad-accent);
  transform: scaleX(0.15);
  transform-origin: left center;
  opacity: 0.6;
  animation: wk-underline-grow 1.4s cubic-bezier(0.22, 1, 0.36, 1) 0.25s forwards;
}
@keyframes wk-underline-grow {
  0%   { transform: scaleX(0.1); opacity: 0; }
  60%  { opacity: 0.9; }
  100% { transform: scaleX(1);   opacity: 1; }
}

/* --- Live dot pulse ring ---------------------------------------------- */

.wk-pulse-ring {
  position: relative;
}
.wk-pulse-ring::before {
  content: '';
  position: absolute;
  inset: -2px;
  border-radius: 999px;
  border: 1.5px solid currentColor;
  opacity: 0.6;
  animation: wk-pulse-ring 1.8s cubic-bezier(0, 0, 0.2, 1) infinite;
}
@keyframes wk-pulse-ring {
  0%   { transform: scale(0.6); opacity: 0.8; }
  80%  { transform: scale(2.4); opacity: 0; }
  100% { transform: scale(2.4); opacity: 0; }
}

/* --- Floating stat chips / elements ----------------------------------- */

.wk-floaty {
  animation: wk-floaty 6s ease-in-out infinite;
}
.wk-floaty-slow {
  animation: wk-floaty 9s ease-in-out infinite;
}
.wk-floaty-delay {
  animation: wk-floaty 7.5s ease-in-out -3s infinite;
}
@keyframes wk-floaty {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  50%      { transform: translateY(-8px) rotate(0.25deg); }
}

/* --- Shimmer bar (for loading/auto-log feel) --------------------------- */

.wk-shimmer {
  position: relative;
  overflow: hidden;
}
.wk-shimmer::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    transparent 0%,
    color-mix(in srgb, var(--wk-accent) 14%, transparent) 50%,
    transparent 100%
  );
  transform: translateX(-100%);
  animation: wk-shimmer 2.6s ease-in-out infinite;
  pointer-events: none;
}
@keyframes wk-shimmer {
  0%   { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}

/* --- Animated gradient border (featured tier / membership) ------------ */

.wk-ring-glow {
  position: relative;
  isolation: isolate;
}
.wk-ring-glow::before {
  content: '';
  position: absolute;
  inset: -1px;
  border-radius: inherit;
  padding: 1px;
  background: conic-gradient(
    from var(--wk-angle, 0deg),
    var(--wk-card-accent, var(--wk-accent)),
    color-mix(in srgb, var(--wk-card-accent, var(--wk-accent-2)) 55%, white),
    var(--wk-card-accent, var(--wk-accent-3, var(--wk-accent))),
    var(--wk-card-accent, var(--wk-accent))
  );
  -webkit-mask:
    linear-gradient(#fff 0 0) content-box,
    linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  animation: wk-angle 6s linear infinite;
  z-index: -1;
}
@property --wk-angle {
  syntax: '<angle>';
  inherits: false;
  initial-value: 0deg;
}
@keyframes wk-angle {
  to { --wk-angle: 360deg; }
}

/* --- Soft noise overlay ----------------------------------------------- */

.wk-noise {
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.55 0'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.45'/></svg>");
  background-size: 160px 160px;
  mix-blend-mode: overlay;
  opacity: 0.35;
}

/* --- Accent link underline on hover ----------------------------------- */

.wk-link {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-weight: 500;
  transition: color 0.2s ease;
}
.wk-link::after {
  content: '';
  position: absolute;
  left: 0; right: 0;
  bottom: -2px;
  height: 1.5px;
  border-radius: 999px;
  background: currentColor;
  transform: scaleX(0);
  transform-origin: left center;
  transition: transform 0.3s cubic-bezier(0.22, 1, 0.36, 1);
}
.wk-link:hover::after {
  transform: scaleX(1);
}

/* --- Storyboard connector ---------------------------------------------- */

.wk-flow-line {
  position: relative;
  height: 2px;
  background: linear-gradient(
    90deg,
    transparent 0%,
    color-mix(in srgb, var(--wk-accent) 55%, transparent) 50%,
    transparent 100%
  );
  background-size: 200% 100%;
  animation: wk-flow 3s linear infinite;
  border-radius: 1px;
}
@keyframes wk-flow {
  0%   { background-position: 100% 0; }
  100% { background-position: -100% 0; }
}

/* --- Concentric pulse rings (used in storyboard cloud) ----------------- */

.wk-cloud-pulse {
  position: relative;
}
.wk-cloud-pulse::before,
.wk-cloud-pulse::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 9999px;
  border: 1.5px solid color-mix(in srgb, var(--wk-accent) 60%, transparent);
  animation: wk-cloud-pulse 3.6s cubic-bezier(0, 0, 0.2, 1) infinite;
  opacity: 0;
  pointer-events: none;
}
.wk-cloud-pulse::after {
  animation-delay: 1.8s;
}
@keyframes wk-cloud-pulse {
  0%   { transform: scale(0.6); opacity: 0.55; }
  85%  { transform: scale(2.0); opacity: 0; }
  100% { transform: scale(2.0); opacity: 0; }
}

/* --- Credential fan (visa cards) --------------------------------------- */

.wk-cred {
  transition: transform 600ms cubic-bezier(0.22, 1, 0.36, 1),
              box-shadow 400ms ease, opacity 300ms ease, filter 300ms ease;
  will-change: transform;
}
.wk-cred:hover {
  filter: brightness(1.04);
}

/* --- Mini bar chart bars ----------------------------------------------- */

.wk-bar {
  transform-origin: bottom;
  animation: wk-bar-grow 900ms cubic-bezier(0.22, 1, 0.36, 1) both;
}
@keyframes wk-bar-grow {
  0%   { transform: scaleY(0); opacity: 0.2; }
  100% { transform: scaleY(1); opacity: 1; }
}

/* --- Floating context chips (around the watch) ------------------------- */

.wk-chip-float {
  animation: wk-chip-float 6s ease-in-out infinite;
}
.wk-chip-float-delay { animation-delay: 1.5s; }
.wk-chip-float-late  { animation-delay: 3s; }
@keyframes wk-chip-float {
  0%, 100% { transform: translateY(0); }
  50%      { transform: translateY(-6px); }
}

/* --- Watch progress ring sweep ---------------------------------------- */

.wk-watch-ring-sweep {
  transition: stroke-dashoffset 900ms cubic-bezier(0.22, 1, 0.36, 1);
}

/* --- Form scanner: vertical scan beam --------------------------------- */

.wk-scan-beam {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
  border-radius: inherit;
}
.wk-scan-beam::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  height: 36px;
  background: linear-gradient(
    180deg,
    transparent 0%,
    color-mix(in srgb, var(--wk-accent) 20%, transparent) 40%,
    color-mix(in srgb, var(--wk-accent) 70%, transparent) 50%,
    color-mix(in srgb, var(--wk-accent) 20%, transparent) 60%,
    transparent 100%
  );
  animation: wk-scan-down 4.5s cubic-bezier(0.55, 0, 0.45, 1) infinite;
  filter: blur(3px);
  opacity: 0.85;
}
.wk-scan-beam::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  height: 1.5px;
  background: linear-gradient(
    90deg,
    transparent 0%,
    color-mix(in srgb, var(--wk-accent) 75%, transparent) 50%,
    transparent 100%
  );
  animation: wk-scan-down 4.5s cubic-bezier(0.55, 0, 0.45, 1) infinite;
}
@keyframes wk-scan-down {
  0%   { top: -10%; opacity: 0; }
  10%  { opacity: 1; }
  90%  { opacity: 1; }
  100% { top: 110%; opacity: 0; }
}

/* --- Form scanner: staggered field fill ------------------------------- */

.wk-field-fill {
  animation: wk-field-fill 600ms cubic-bezier(0.22, 1, 0.36, 1) both;
}
@keyframes wk-field-fill {
  0%   { opacity: 0; transform: translateY(2px); }
  60%  { opacity: 1; }
  100% { opacity: 1; transform: translateY(0); }
}

/* --- Form scanner: progress fill -------------------------------------- */

.wk-progress-fill {
  animation: wk-progress-fill 1.6s cubic-bezier(0.22, 1, 0.36, 1) 0.4s both;
  transform-origin: left;
}
@keyframes wk-progress-fill {
  0%   { transform: scaleX(0); }
  100% { transform: scaleX(1); }
}

/* --- Compliance dashboard: timeline bar grow ------------------------- */

.wk-tl-bar {
  transform-origin: left;
  animation: wk-tl-bar-fill 1.1s cubic-bezier(0.22, 1, 0.36, 1) both;
}
@keyframes wk-tl-bar-fill {
  0%   { transform: scaleX(0); }
  100% { transform: scaleX(1); }
}

/* --- Compliance dashboard: donut arc ---------------------------------- */

.wk-donut-arc {
  stroke-dasharray: 264;
  stroke-dashoffset: 264;
  animation: wk-donut-fill 1.6s cubic-bezier(0.22, 1, 0.36, 1) 0.25s forwards;
}
@keyframes wk-donut-fill {
  to { stroke-dashoffset: var(--wk-donut-offset, 22); }
}

/* --- Compliance dashboard: today line glow ---------------------------- */

.wk-today-line {
  animation: wk-today-glow 2.6s ease-in-out infinite;
}
@keyframes wk-today-glow {
  0%, 100% { opacity: 0.55; }
  50%      { opacity: 1; }
}

/* --- Compliance dashboard: warning pulse ------------------------------ */

.wk-pulse-soft {
  animation: wk-pulse-soft 2.2s ease-in-out infinite;
}
@keyframes wk-pulse-soft {
  0%, 100% { box-shadow: 0 0 0 0 currentColor; opacity: 0.95; }
  50%      { box-shadow: 0 0 0 6px transparent; opacity: 1; }
}

/* --- Form scanner: sparkle ping --------------------------------------- */

.wk-sparkle {
  animation: wk-sparkle 2.4s ease-in-out infinite;
}
.wk-sparkle-delay { animation-delay: 0.8s; }
.wk-sparkle-late  { animation-delay: 1.6s; }
@keyframes wk-sparkle {
  0%, 100% { opacity: 0.2; transform: scale(0.85); }
  50%      { opacity: 1;   transform: scale(1.1); }
}

/* --- Respect reduced motion ------------------------------------------- */

@media (prefers-reduced-motion: reduce) {
  .wk-gradient-text { animation: none; background-position: 0% 50%; }
  .wk-pulse-ring::before,
  .wk-floaty, .wk-floaty-slow, .wk-floaty-delay,
  .wk-shimmer::after,
  .wk-ring-glow::before,
  .wk-flow-line,
  .wk-cloud-pulse::before,
  .wk-cloud-pulse::after,
  .wk-chip-float,
  .wk-bar,
  .wk-scan-beam::before,
  .wk-scan-beam::after,
  .wk-field-fill,
  .wk-progress-fill,
  .wk-sparkle,
  .wk-tl-bar,
  .wk-donut-arc,
  .wk-today-line,
  .wk-pulse-soft { animation: none !important; }
  .wk-donut-arc { stroke-dashoffset: var(--wk-donut-offset, 22); }
  .wk-tl-bar { transform: none; }
  .wk-underline-sweep::after { animation-duration: 0.01s; }
  .wk-cred { transition: none; }
  .wk-watch-ring-sweep { transition: none; }
}
`;

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type ThemeMode = 'auto' | 'light' | 'dark';

export default function Home() {
  const [mode, setMode] = useState<ThemeMode>('auto');

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('wk-theme-mode') as ThemeMode | null;
      if (saved === 'light' || saved === 'dark' || saved === 'auto') setMode(saved);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem('wk-theme-mode', mode);
    } catch {}
  }, [mode]);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: themeCss }} />
      <div
        className="wk min-h-screen font-sans antialiased"
        data-wk-force={mode === 'auto' ? undefined : mode}
      >
        <AuthRecoveryHandler />
        <WkHeader mode={mode} setMode={setMode} />
        <main>
          <CrewBenefitsHero />
          <PlatformShowcase />
          <VisaTracker />
          <AIDocumentScanner />
          <OfficialForms />
          <CertificateTracking />
          <WatchComingSoon />
          <AISImport />
          <VerificationPortal />
          <Membership />
          <AndroidBeta />
          <FinalCTA />
        </main>
        <WkFooter />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function WkHeader({
  mode,
  setMode,
}: {
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
}) {
  const [open, setOpen] = useState(false);
  const links = [
    { label: 'Benefits', href: '#benefits' },
    { label: 'Platform', href: '#platform' },
    { label: 'Features', href: '#features' },
    { label: 'Membership', href: '#membership' },
  ];
  return (
    <header
      className="sticky top-0 z-50 backdrop-blur-xl"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--wk-bg) 80%, transparent)',
        borderBottom: '1px solid var(--wk-line)',
      }}
    >
      <div className="container mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
        <Logo className="!text-[color:var(--wk-text)]" />

        <nav className="hidden items-center gap-8 md:flex">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm font-medium transition-opacity hover:opacity-80"
              style={{ color: 'var(--wk-text-soft)' }}
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle mode={mode} setMode={setMode} />
          <Link
            href="/login"
            className="text-sm font-medium"
            style={{ color: 'var(--wk-text-soft)' }}
          >
            Sign in
          </Link>
          <button
            className="ml-1 inline-flex h-9 w-9 items-center justify-center rounded-md md:hidden"
            style={{ color: 'var(--wk-text)', border: '1px solid var(--wk-line)' }}
            onClick={() => setOpen((o) => !o)}
            aria-label="Toggle menu"
          >
            <Menu className="h-4 w-4" />
          </button>
        </div>
      </div>

      {open && (
        <div className="md:hidden" style={{ borderTop: '1px solid var(--wk-line)' }}>
          <div className="container mx-auto flex flex-col gap-1 px-4 py-3">
            {[...links, { label: 'Live site', href: '/' }].map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="rounded-lg px-3 py-2 text-sm font-medium"
                style={{ color: 'var(--wk-text)' }}
                onClick={() => setOpen(false)}
              >
                {l.label}
              </a>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}

// ---------------------------------------------------------------------------
// Section 1: Crew Benefits Hero
//   (Original content: "Built for Crew Members" → "Everything You Need to
//    Build Your Maritime Career" — tagline, CTAs, 6 benefit cards, checklist)
// ---------------------------------------------------------------------------

const crewBenefits: Array<{ icon: IconType; title: string; desc: string; accent: string }> = [
  { icon: Clock,        title: 'Accurate Sea Time Tracking',      desc: 'Never lose track of your sea service. Log unlimited vessel states with precision and build a complete record of your maritime experience.', accent: '#0ea5e9' },
  { icon: FileCheck,    title: 'Digital Captain Testimonials',    desc: 'Request and receive digital testimonials directly from captains. Get instant sign-offs without paperwork delays.',                       accent: '#10b981' },
  { icon: TrendingUp,   title: 'Career Advancement Made Easy',    desc: 'Export professional PDFs and multi-format documents (Excel, CSV) to submit with job applications and certification requests.',       accent: '#8b5cf6' },
  { icon: Shield,       title: 'MCA Compliant Calculations',      desc: 'Automatic sea time calculations that meet MCA requirements. Know exactly where you stand on your certification journey.',              accent: '#d97706' },
  { icon: Calendar,     title: 'Visual Career Timeline',          desc: 'See your entire service history at a glance with our year calendar view. Track your progress across multiple vessels.',                accent: '#06b6d4' },
  { icon: Globe,        title: 'Work Anywhere, Track Everything', desc: 'Log sea time on your phone, manage everything on the web. Your data syncs seamlessly across all devices.',                              accent: '#6366f1' },
];

const whyChoose = [
  'Unlimited vessel tracking — no restrictions',
  'MCA compliant sea time calculations',
  'Instant digital captain testimonials',
  'Professional PDF exports for applications',
  'Multi-format exports (Excel, CSV)',
  'Visual calendar view of your career',
  'Mobile app for logging on the go',
  'Complete service history tracking',
  'Certificate tracking and expiration alerts',
  'Official MCA application form generation',
];

function CrewBenefitsHero() {
  return (
    <section id="benefits" className="relative overflow-hidden" style={{ backgroundColor: 'var(--wk-bg)' }}>
      <HeroBackdrop />

      <div className="container relative z-10 mx-auto px-4 py-24 sm:px-6 sm:py-32 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <Eyebrow icon={Users} accent>Built for Crew Members</Eyebrow>

          <h1
            className="font-headline mt-6 text-5xl font-bold leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl"
            style={{ color: 'var(--wk-text)' }}
          >
            Everything You Need to Build Your{' '}
            <span className="wk-gradient-text wk-underline-sweep">Maritime Career</span>
          </h1>

          <p
            className="mx-auto mt-6 max-w-3xl text-lg leading-relaxed sm:text-xl"
            style={{ color: 'var(--wk-text-soft)' }}
          >
            Track sea time, get captain-signed testimonials, and verify your
            career credentials instantly — worldwide.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <PrimaryCta href="/signup">Start Your Journey</PrimaryCta>
            <SecondaryCta href="#benefits-grid">Explore Features</SecondaryCta>
          </div>

          <div className="mx-auto mt-10 flex max-w-2xl flex-wrap items-center justify-center gap-2 sm:gap-3">
            {[
              { icon: Clock,       label: 'MCA compliant',  color: 'var(--wk-good)',     soft: 'var(--wk-good-soft)' },
              { icon: ShieldCheck, label: 'STCW',           color: 'var(--wk-accent)',   soft: 'var(--wk-accent-soft)' },
              { icon: FileCheck,   label: 'AMSA',           color: 'var(--wk-accent-2)', soft: 'var(--wk-accent-2-soft)' },
              { icon: Anchor,      label: 'USCG',           color: 'var(--wk-accent-3)', soft: 'var(--wk-accent-3-soft)' },
              { icon: Globe,       label: 'Schengen 90/180', color: 'var(--wk-warm)',    soft: 'var(--wk-warm-soft)' },
            ].map((t) => (
              <span
                key={t.label}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
                style={{
                  backgroundColor: t.soft as string,
                  color: t.color as string,
                  border: `1px solid color-mix(in srgb, ${t.color} 25%, transparent)`,
                }}
              >
                <t.icon className="h-3.5 w-3.5" />
                {t.label}
              </span>
            ))}
          </div>
        </div>

        <div
          id="benefits-grid"
          className="mx-auto mt-20 grid max-w-6xl gap-5 md:grid-cols-2 lg:grid-cols-3"
        >
          {crewBenefits.map((b, i) => (
            <motion.div
              key={b.title}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.4, delay: (i % 3) * 0.06 }}
              onMouseMove={(e) => {
                const t = e.currentTarget as HTMLElement;
                const r = t.getBoundingClientRect();
                t.style.setProperty('--wk-mx', `${e.clientX - r.left}px`);
                t.style.setProperty('--wk-my', `${e.clientY - r.top}px`);
              }}
              className="wk-card-hover wk-card-accent-top rounded-2xl p-6"
              style={{
                backgroundColor: 'var(--wk-card)',
                border: '1px solid var(--wk-line)',
                ['--wk-card-accent' as string]: b.accent,
                ['--wk-card-glow' as string]: b.accent,
              } as React.CSSProperties}
            >
              <div
                className="inline-flex h-11 w-11 items-center justify-center rounded-xl"
                style={{
                  backgroundColor: 'color-mix(in srgb, ' + b.accent + ' 14%, transparent)',
                  color: b.accent,
                }}
              >
                <b.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-5 text-lg font-semibold" style={{ color: 'var(--wk-text)' }}>
                {b.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--wk-text-soft)' }}>
                {b.desc}
              </p>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.45 }}
          className="wk-ring-glow mx-auto mt-12 max-w-6xl rounded-2xl p-8 sm:p-12"
          style={{
            backgroundColor: 'var(--wk-card)',
            border: '1px solid transparent',
            boxShadow: 'var(--wk-shadow-md)',
          }}
        >
          <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:justify-center">
            <span
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl"
              style={{ backgroundColor: 'var(--wk-accent-soft)', color: 'var(--wk-accent)' }}
            >
              <Zap className="h-5 w-5" />
            </span>
            <h3
              className="font-headline text-2xl font-bold sm:text-3xl"
              style={{ color: 'var(--wk-text)' }}
            >
              Why Crew Members Choose SeaJourney
            </h3>
          </div>

          <div className="mt-8 grid gap-3 md:grid-cols-2">
            {whyChoose.map((f) => (
              <div key={f} className="flex items-start gap-3">
                <span
                  className="mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundColor: 'var(--wk-good-soft)', color: 'var(--wk-good)' }}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                </span>
                <span className="text-sm" style={{ color: 'var(--wk-text)' }}>
                  {f}
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function HeroBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[720px] overflow-hidden">
      <div
        className="wk-floaty absolute -left-40 top-20 h-[420px] w-[420px] rounded-full blur-3xl"
        style={{ backgroundColor: 'var(--wk-accent-soft)', opacity: 0.75 }}
      />
      <div
        className="wk-floaty-delay absolute -right-32 top-40 h-[460px] w-[460px] rounded-full blur-3xl"
        style={{ backgroundColor: 'var(--wk-accent-2-soft)', opacity: 0.7 }}
      />
      <div
        className="wk-floaty-slow absolute left-1/3 top-96 h-[300px] w-[300px] rounded-full blur-3xl"
        style={{ backgroundColor: 'var(--wk-accent-3-soft)', opacity: 0.35 }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(60% 40% at 50% 0%, color-mix(in srgb, var(--wk-accent) 9%, transparent) 0%, transparent 65%)',
        }}
      />
      <div className="wk-dot-grid absolute inset-0 opacity-25" />
      <div className="wk-noise absolute inset-0" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 2: Platform Showcase
//   "Log on Mobile. Manage on Web." — 3-stage storyboard:
//   phone (log) → cloud (sync) → web (dashboard)
// ---------------------------------------------------------------------------

const platformBenefits: Array<{ icon: IconType; title: string; desc: string; accent: string }> = [
  { icon: Smartphone, title: 'Log Anywhere',       desc: 'Quick vessel state logging from your iPhone, even when offline. Perfect for busy crew schedules.', accent: '#0ea5e9' },
  { icon: Waves,       title: 'Instant Sync',       desc: 'Your data syncs automatically between mobile and web. Never lose track of your sea time.',           accent: '#8b5cf6' },
  { icon: Monitor,     title: 'Manage Everything',  desc: 'Access digital testimonials, professional exports, analytics, and complete career management.',     accent: '#10b981' },
];

function PlatformShowcase() {
  return (
    <section id="platform" className="wk-section-alt py-24 sm:py-32">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <Eyebrow icon={Smartphone}>Mobile App + Web Portal</Eyebrow>
          <h2
            className="font-headline mt-4 text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl"
            style={{ color: 'var(--wk-text)' }}
          >
            Log on Mobile.{' '}
            <span className="wk-gradient-text wk-gradient-text--violet">Manage on Web.</span>
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-lg" style={{ color: 'var(--wk-text-soft)' }}>
            Use our iOS app to quickly log your sea time anywhere, anytime.
            Then access powerful features like digital testimonials,
            professional exports, and complete career management on the web
            portal.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <PrimaryCta href="https://apps.apple.com/gb/app/seajourney/id6751553072" external tone="violet">
              Download iOS App
            </PrimaryCta>
            <SecondaryCta href="#membership">Explore Web Portal</SecondaryCta>
          </div>
        </div>

        {/* Storyboard: phone → cloud → web */}
        <SyncStoryboard />

        {/* Three key platform benefits */}
        <div className="mx-auto mt-12 grid max-w-5xl gap-5 md:grid-cols-3">
          {platformBenefits.map((b, i) => (
            <motion.div
              key={b.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.35, delay: i * 0.06 }}
              onMouseMove={(e) => {
                const t = e.currentTarget as HTMLElement;
                const r = t.getBoundingClientRect();
                t.style.setProperty('--wk-mx', `${e.clientX - r.left}px`);
                t.style.setProperty('--wk-my', `${e.clientY - r.top}px`);
              }}
              className="wk-card-hover wk-card-accent-top rounded-2xl p-6 text-center"
              style={{
                backgroundColor: 'var(--wk-card)',
                border: '1px solid var(--wk-line)',
                ['--wk-card-accent' as string]: b.accent,
                ['--wk-card-glow' as string]: b.accent,
              } as React.CSSProperties}
            >
              <div
                className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-xl"
                style={{
                  backgroundColor: 'color-mix(in srgb, ' + b.accent + ' 14%, transparent)',
                  color: b.accent,
                }}
              >
                <b.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-base font-semibold" style={{ color: 'var(--wk-text)' }}>
                {b.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--wk-text-soft)' }}>
                {b.desc}
              </p>
            </motion.div>
          ))}
        </div>

        <div
          className="mx-auto mt-10 flex max-w-3xl items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-medium"
          style={{
            backgroundColor: 'var(--wk-accent-soft)',
            color: 'var(--wk-accent)',
            border: '1px solid var(--wk-accent-ring)',
          }}
        >
          <ArrowRight className="h-4 w-4" />
          Log on mobile, manage on web. Your data syncs seamlessly.
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Storyboard: phone (log) → cloud (sync) → web (dashboard)
// ---------------------------------------------------------------------------

function SyncStoryboard() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.55 }}
      className="mx-auto mt-16 max-w-6xl"
    >
      {/* Stage labels (numbered) shown above the storyboard */}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { n: '01', label: 'Log on mobile' },
          { n: '02', label: 'Sync to cloud' },
          { n: '03', label: 'Manage on web' },
        ].map((s) => (
          <div
            key={s.n}
            className="flex items-center justify-center gap-2 text-[11px] font-bold uppercase tracking-widest"
            style={{ color: 'var(--wk-text-muted)' }}
          >
            <span
              className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px]"
              style={{
                backgroundColor: 'var(--wk-accent-soft)',
                color: 'var(--wk-accent)',
                border: '1px solid var(--wk-accent-ring)',
              }}
            >
              {s.n}
            </span>
            <span>{s.label}</span>
          </div>
        ))}
      </div>

      <div className="grid items-center gap-8 md:grid-cols-[1fr_auto_1.4fr_auto_2fr] md:gap-3">
        <PhoneStage />
        <FlowConnector />
        <CloudStage />
        <FlowConnector />
        <WebStage />
      </div>
    </motion.div>
  );
}

function FlowConnector() {
  return (
    <div className="hidden md:flex md:items-center md:justify-center">
      <div className="relative flex w-full min-w-12 items-center">
        <span
          className="inline-flex h-2 w-2 flex-none rounded-full"
          style={{
            backgroundColor: 'var(--wk-accent)',
            boxShadow: '0 0 0 4px color-mix(in srgb, var(--wk-accent) 18%, transparent)',
          }}
        />
        <span className="wk-flow-line mx-2 flex-1" />
        <span
          className="inline-flex h-2 w-2 flex-none rounded-full"
          style={{
            backgroundColor: 'var(--wk-accent)',
            boxShadow: '0 0 0 4px color-mix(in srgb, var(--wk-accent) 18%, transparent)',
          }}
        />
      </div>
    </div>
  );
}

function PhoneStage() {
  return (
    <div className="mx-auto w-full max-w-[260px]">
      <div
        className="relative overflow-hidden rounded-[36px] p-2"
        style={{
          backgroundColor: 'var(--wk-bg-raised)',
          border: '1px solid var(--wk-line-strong)',
          boxShadow: 'var(--wk-shadow-lg), 0 0 0 6px color-mix(in srgb, var(--wk-accent) 8%, transparent)',
        }}
      >
        {/* Notch */}
        <div className="flex justify-center pb-1.5 pt-2">
          <span
            className="block h-1.5 w-16 rounded-full"
            style={{ backgroundColor: 'var(--wk-line-strong)' }}
          />
        </div>

        <div
          className="overflow-hidden rounded-[26px]"
          style={{ backgroundColor: 'var(--wk-card)', border: '1px solid var(--wk-line)' }}
        >
          {/* Status bar */}
          <div
            className="flex items-center justify-between px-4 py-2 text-[10px] font-semibold tabular-nums"
            style={{ color: 'var(--wk-text-muted)' }}
          >
            <span>09:41</span>
            <span className="flex items-center gap-1">
              <span
                className="inline-block h-1 w-1 rounded-full"
                style={{ backgroundColor: 'var(--wk-good)' }}
              />
              5G
            </span>
          </div>

          {/* App header */}
          <div
            className="flex items-center gap-2 px-4 pb-2"
            style={{ color: 'var(--wk-text)' }}
          >
            <span
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg"
              style={{ backgroundColor: 'var(--wk-accent-soft)', color: 'var(--wk-accent)' }}
            >
              <Anchor className="h-3.5 w-3.5" />
            </span>
            <div className="flex-1">
              <div className="text-[11px] font-bold">Log Sea Time</div>
              <div className="text-[10px]" style={{ color: 'var(--wk-text-muted)' }}>
                M/Y Sea Journey
              </div>
            </div>
          </div>

          {/* Form fields */}
          <div className="space-y-2 px-3 pb-3">
            {[
              { label: 'Date', value: 'Today · 14 Apr' },
              { label: 'Location', value: 'Palma de Mallorca' },
              { label: 'State', value: 'Underway' },
            ].map((row) => (
              <div
                key={row.label}
                className="rounded-xl px-3 py-2"
                style={{
                  backgroundColor: 'var(--wk-bg-subtle)',
                  border: '1px solid var(--wk-line)',
                }}
              >
                <div
                  className="text-[9px] font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--wk-text-muted)' }}
                >
                  {row.label}
                </div>
                <div className="text-[11px] font-semibold" style={{ color: 'var(--wk-text)' }}>
                  {row.value}
                </div>
              </div>
            ))}

            {/* CTA button */}
            <div
              className="mt-1 flex items-center justify-center gap-1.5 rounded-xl py-2 text-[11px] font-semibold text-white"
              style={{
                background: 'linear-gradient(135deg, var(--wk-accent) 0%, var(--wk-accent-strong) 100%)',
                boxShadow: 'var(--wk-glow)',
              }}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Log entry
            </div>

            {/* Sync chip */}
            <div
              className="flex items-center justify-center gap-1.5 rounded-full py-1 text-[10px] font-semibold"
              style={{ color: 'var(--wk-good)' }}
            >
              <span className="wk-pulse-ring relative inline-flex">
                <span
                  className="relative inline-block h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: 'var(--wk-good)' }}
                />
              </span>
              Synced just now
            </div>
          </div>
        </div>
      </div>

      {/* Mobile-only connector to next stage */}
      <div className="my-4 flex justify-center md:hidden">
        <div className="wk-flow-line h-12 w-px rotate-90" />
      </div>
    </div>
  );
}

function CloudStage() {
  return (
    <div className="relative mx-auto flex w-full max-w-[260px] flex-col items-center">
      <div className="relative flex h-44 w-44 items-center justify-center">
        {/* Concentric pulse rings */}
        <span className="wk-cloud-pulse absolute inset-0" />
        {/* Glass orb */}
        <div
          className="relative flex h-32 w-32 items-center justify-center rounded-full"
          style={{
            background:
              'radial-gradient(circle at 30% 25%, color-mix(in srgb, var(--wk-accent) 25%, transparent), transparent 60%), var(--wk-bg-raised)',
            border: '1px solid var(--wk-line-strong)',
            boxShadow:
              '0 20px 50px -20px color-mix(in srgb, var(--wk-accent) 35%, transparent), inset 0 -8px 20px color-mix(in srgb, var(--wk-accent) 18%, transparent)',
            color: 'var(--wk-accent)',
          }}
        >
          <UploadCloud className="h-10 w-10" strokeWidth={1.5} />
        </div>
      </div>

      <div className="mt-3 flex flex-col items-center gap-1 text-center">
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest"
          style={{
            backgroundColor: 'var(--wk-accent-soft)',
            color: 'var(--wk-accent)',
            border: '1px solid var(--wk-accent-ring)',
          }}
        >
          <Shield className="h-3 w-3" /> Encrypted sync
        </span>
        <p className="text-xs" style={{ color: 'var(--wk-text-muted)' }}>
          End-to-end · MCA-ready
        </p>
      </div>

      <div className="my-4 flex justify-center md:hidden">
        <div className="wk-flow-line h-12 w-px rotate-90" />
      </div>
    </div>
  );
}

function WebStage() {
  return (
    <div className="mx-auto w-full">
      <div
        className="overflow-hidden rounded-2xl"
        style={{
          backgroundColor: 'var(--wk-bg-raised)',
          border: '1px solid var(--wk-line-strong)',
          boxShadow: 'var(--wk-shadow-lg)',
        }}
      >
        {/* Browser chrome */}
        <div
          className="flex items-center gap-2 px-4 py-2.5"
          style={{ borderBottom: '1px solid var(--wk-line)' }}
        >
          <span className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#ef4444' }} />
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#f59e0b' }} />
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#10b981' }} />
          </span>
          <div
            className="ml-2 flex h-6 flex-1 items-center gap-1.5 rounded-md px-2 text-[11px]"
            style={{
              backgroundColor: 'var(--wk-bg-subtle)',
              color: 'var(--wk-text-muted)',
              border: '1px solid var(--wk-line)',
            }}
          >
            <Shield className="h-3 w-3" style={{ color: 'var(--wk-good)' }} />
            seajourney.app/dashboard
          </div>
        </div>

        {/* Dashboard preview */}
        <div className="grid gap-3 p-4 sm:grid-cols-3">
          {/* Total card */}
          <div
            className="rounded-xl p-3"
            style={{
              backgroundColor: 'var(--wk-card)',
              border: '1px solid var(--wk-line)',
            }}
          >
            <div className="flex items-center justify-between">
              <span
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg"
                style={{ backgroundColor: 'var(--wk-accent-soft)', color: 'var(--wk-accent)' }}
              >
                <Waves className="h-3.5 w-3.5" />
              </span>
              <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--wk-text-muted)' }}>
                This Month
              </span>
            </div>
            <div className="mt-3 text-2xl font-bold tabular-nums" style={{ color: 'var(--wk-text)' }}>
              28d 04h
            </div>
            <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold" style={{ color: 'var(--wk-good)' }}>
              <TrendingUp className="h-3 w-3" /> +12% vs last
            </div>
          </div>

          {/* Mini chart */}
          <div
            className="rounded-xl p-3"
            style={{
              backgroundColor: 'var(--wk-card)',
              border: '1px solid var(--wk-line)',
            }}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--wk-text-muted)' }}>
                Sea time
              </span>
              <span className="text-[10px] font-semibold" style={{ color: 'var(--wk-text-soft)' }}>
                12 wks
              </span>
            </div>
            <div className="mt-3 flex h-14 items-end justify-between gap-1">
              {[40, 60, 75, 55, 70, 90, 65, 80, 100, 70, 85, 95].map((h, i) => (
                <span
                  key={i}
                  className="wk-bar w-full rounded-sm"
                  style={{
                    height: `${h}%`,
                    backgroundColor: i === 11
                      ? 'var(--wk-accent)'
                      : 'color-mix(in srgb, var(--wk-accent) 35%, transparent)',
                    animationDelay: `${i * 60}ms`,
                  }}
                />
              ))}
            </div>
          </div>

          {/* Latest entry */}
          <div
            className="rounded-xl p-3"
            style={{
              backgroundColor: 'var(--wk-card)',
              border: '1px solid var(--wk-line)',
            }}
          >
            <div className="flex items-center justify-between">
              <span
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg"
                style={{
                  backgroundColor: 'color-mix(in srgb, #10b981 14%, transparent)',
                  color: '#10b981',
                }}
              >
                <Ship className="h-3.5 w-3.5" />
              </span>
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                style={{ backgroundColor: 'var(--wk-good-soft)', color: 'var(--wk-good)' }}
              >
                Live
              </span>
            </div>
            <div className="mt-3 text-sm font-bold" style={{ color: 'var(--wk-text)' }}>
              Palma de Mallorca
            </div>
            <div className="text-[11px]" style={{ color: 'var(--wk-text-muted)' }}>
              Just now · Underway · 8h 12m
            </div>
          </div>
        </div>

        <div
          className="flex items-center justify-between px-4 py-2.5 text-[11px]"
          style={{ borderTop: '1px solid var(--wk-line)', color: 'var(--wk-text-muted)' }}
        >
          <span>
            Total sea time · <strong style={{ color: 'var(--wk-text)' }}>28d 04h</strong>
          </span>
          <span
            className="inline-flex items-center gap-1 font-semibold"
            style={{ color: 'var(--wk-accent)' }}
          >
            <Download className="h-3 w-3" />
            Export MCA PDF
          </span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 3: Visa Tracker (original Features section)
// ---------------------------------------------------------------------------

type Visa = {
  country: string;
  flag: string;
  visaType: string;
  issueDate: string;
  expiryDate: string;
  status: 'valid' | 'expiring' | 'expired';
  daysRemaining: number;
  entryType: string;
  maxStay: string;
};

const visas: Visa[] = [
  { country: 'United States',   flag: '🇺🇸', visaType: 'B1/B2 Tourist',   issueDate: '2024-01-15', expiryDate: '2029-01-14', status: 'valid',    daysRemaining: 1785, entryType: 'Multiple Entry', maxStay: '6 months' },
  { country: 'Schengen Area',   flag: '🇪🇺', visaType: 'Schengen Visa',   issueDate: '2024-03-01', expiryDate: '2024-09-01', status: 'expiring', daysRemaining: 45,   entryType: 'Multiple Entry', maxStay: '90 days'  },
  { country: 'Australia',       flag: '🇦🇺', visaType: 'eVisitor',        issueDate: '2023-11-20', expiryDate: '2024-11-19', status: 'expired',  daysRemaining: -30,  entryType: 'Multiple Entry', maxStay: '3 months' },
  { country: 'United Kingdom',  flag: '🇬🇧', visaType: 'Standard Visitor',issueDate: '2024-02-10', expiryDate: '2027-02-09', status: 'valid',    daysRemaining: 1095, entryType: 'Multiple Entry', maxStay: '6 months' },
];

function VisaTracker() {
  const [selected, setSelected] = useState(0);
  const active = visas[selected];

  const statusColor = (s: Visa['status']) =>
    s === 'valid' ? 'var(--wk-good)' : s === 'expiring' ? 'var(--wk-warm)' : 'var(--wk-bad)';
  const statusSoft = (s: Visa['status']) =>
    s === 'valid' ? 'var(--wk-good-soft)' : s === 'expiring' ? 'var(--wk-warm-soft)' : 'var(--wk-bad-soft)';
  const statusLabel = (s: Visa['status']) =>
    s === 'valid' ? 'Valid' : s === 'expiring' ? 'Expiring Soon' : 'Expired';

  return (
    <section id="features" className="py-24 sm:py-32" style={{ backgroundColor: 'var(--wk-bg)' }}>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <Eyebrow icon={Globe} accent>Premium Feature</Eyebrow>
          <h2
            className="font-headline mt-4 text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl"
            style={{ color: 'var(--wk-text)' }}
          >
            <span className="wk-gradient-text wk-gradient-text--emerald">Visa Tracker</span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg" style={{ color: 'var(--wk-text-soft)' }}>
            Never miss a visa expiration date. Track all your visas in one
            place, get automatic reminders, and stay compliant with
            international travel requirements.
          </p>
        </div>

        <div className="mx-auto mt-14 grid max-w-6xl items-start gap-10 lg:grid-cols-[5fr_4fr]">
          {/* Credential fan */}
          <div>
            <div className="mb-4 flex items-center justify-between">
              <h3
                className="text-sm font-semibold uppercase tracking-widest"
                style={{ color: 'var(--wk-text-muted)' }}
              >
                Your Visas · {visas.length}
              </h3>
              <span
                className="inline-flex items-center gap-1.5 text-xs"
                style={{ color: 'var(--wk-text-muted)' }}
              >
                <Bell className="h-3.5 w-3.5" />
                Auto-reminders on
              </span>
            </div>

            <CredentialFan
              visas={visas}
              selected={selected}
              setSelected={setSelected}
              statusColor={statusColor}
              statusSoft={statusSoft}
              statusLabel={statusLabel}
            />

            {/* Country dot pager */}
            <div className="mt-6 flex items-center justify-center gap-3">
              {visas.map((v, i) => {
                const isActive = i === selected;
                return (
                  <button
                    key={v.country}
                    type="button"
                    onClick={() => setSelected(i)}
                    className="group flex items-center gap-2 rounded-full px-3 py-1.5 transition"
                    style={{
                      backgroundColor: isActive ? 'var(--wk-accent-soft)' : 'transparent',
                      border: `1px solid ${isActive ? 'var(--wk-accent-ring)' : 'var(--wk-line)'}`,
                    }}
                    aria-label={`Show ${v.country} visa`}
                  >
                    <span className="text-base leading-none">{v.flag}</span>
                    <span
                      className="text-[11px] font-semibold"
                      style={{
                        color: isActive ? 'var(--wk-accent)' : 'var(--wk-text-muted)',
                      }}
                    >
                      {v.country.split(' ')[0]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Detail panel */}
          <div
            className="rounded-2xl p-6"
            style={{
              backgroundColor: 'var(--wk-card)',
              border: '1px solid var(--wk-line)',
              boxShadow: 'var(--wk-shadow-md)',
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="text-4xl leading-none">{active.flag}</span>
                <div>
                  <h3 className="text-xl font-bold" style={{ color: 'var(--wk-text)' }}>
                    {active.country}
                  </h3>
                  <p className="text-sm" style={{ color: 'var(--wk-text-soft)' }}>
                    {active.visaType}
                  </p>
                </div>
              </div>
              <span
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold"
                style={{
                  backgroundColor: statusSoft(active.status),
                  color: statusColor(active.status),
                  border: `1px solid color-mix(in srgb, ${statusColor(active.status)} 35%, transparent)`,
                }}
              >
                {active.status === 'valid' ? (
                  <CheckCircle2 className="h-3 w-3" />
                ) : (
                  <AlertTriangle className="h-3 w-3" />
                )}
                {statusLabel(active.status)}
              </span>
            </div>

            <div className="mt-6 space-y-3">
              {[
                { icon: Calendar, label: 'Issue Date',   value: active.issueDate  },
                { icon: Calendar, label: 'Expiry Date',  value: active.expiryDate },
                { icon: FileText, label: 'Entry Type',   value: active.entryType  },
                { icon: Clock,    label: 'Maximum Stay', value: active.maxStay    },
              ].map((row) => (
                <div
                  key={row.label}
                  className="flex items-center gap-3 rounded-lg p-3"
                  style={{ backgroundColor: 'var(--wk-bg-subtle)' }}
                >
                  <row.icon className="h-4 w-4" style={{ color: 'var(--wk-accent)' }} />
                  <div className="flex-1">
                    <div
                      className="text-[11px] uppercase tracking-wider"
                      style={{ color: 'var(--wk-text-muted)' }}
                    >
                      {row.label}
                    </div>
                    <div className="text-sm font-semibold" style={{ color: 'var(--wk-text)' }}>
                      {row.value}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {active.status === 'expiring' && (
              <div
                className="mt-4 flex items-start gap-3 rounded-lg p-4"
                style={{
                  backgroundColor: 'var(--wk-warm-soft)',
                  border: '1px solid color-mix(in srgb, var(--wk-warm) 30%, transparent)',
                }}
              >
                <AlertTriangle
                  className="h-4 w-4 flex-shrink-0"
                  style={{ color: 'var(--wk-warm)' }}
                />
                <div className="text-sm">
                  <div className="font-semibold" style={{ color: 'var(--wk-warm)' }}>
                    Renewal Reminder
                  </div>
                  <p style={{ color: 'var(--wk-text-soft)' }}>
                    Your visa expires in {active.daysRemaining} days. Consider renewing
                    soon.
                  </p>
                </div>
              </div>
            )}

            {active.status === 'expired' && (
              <div
                className="mt-4 flex items-start gap-3 rounded-lg p-4"
                style={{
                  backgroundColor: 'var(--wk-bad-soft)',
                  border: '1px solid color-mix(in srgb, var(--wk-bad) 30%, transparent)',
                }}
              >
                <AlertTriangle
                  className="h-4 w-4 flex-shrink-0"
                  style={{ color: 'var(--wk-bad)' }}
                />
                <div className="text-sm">
                  <div className="font-semibold" style={{ color: 'var(--wk-bad)' }}>
                    Visa Expired
                  </div>
                  <p style={{ color: 'var(--wk-text-soft)' }}>
                    This visa expired {Math.abs(active.daysRemaining)} days ago. You&apos;ll
                    need to renew before travelling.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mx-auto mt-12 grid max-w-6xl gap-5 md:grid-cols-3">
          {[
            { icon: Bell,          title: 'Automatic Reminders',   desc: 'Get notified 30, 14, and 7 days before your visa expires. Never miss a renewal deadline.', accent: '#d97706' },
            { icon: Globe,         title: 'Multi-Country Tracking',desc: 'Track visas for all countries you visit. Manage Schengen, US, UK, and more in one place.',  accent: '#8b5cf6' },
            { icon: CheckCircle2,  title: 'Compliance Made Easy',  desc: 'Stay compliant with international travel regulations. Know your visa status at a glance.',  accent: '#10b981' },
          ].map((f) => (
            <div
              key={f.title}
              className="rounded-2xl p-6 text-center"
              style={{ backgroundColor: 'var(--wk-card)', border: '1px solid var(--wk-line)' }}
            >
              <div
                className="mx-auto inline-flex h-11 w-11 items-center justify-center rounded-xl"
                style={{
                  backgroundColor: 'color-mix(in srgb, ' + f.accent + ' 14%, transparent)',
                  color: f.accent,
                }}
              >
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-base font-semibold" style={{ color: 'var(--wk-text)' }}>
                {f.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--wk-text-soft)' }}>
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Visa credential fan (3D stack)
// ---------------------------------------------------------------------------

function CredentialFan({
  visas,
  selected,
  setSelected,
  statusColor,
  statusSoft,
  statusLabel,
}: {
  visas: Visa[];
  selected: number;
  setSelected: (n: number) => void;
  statusColor: (s: Visa['status']) => string;
  statusSoft: (s: Visa['status']) => string;
  statusLabel: (s: Visa['status']) => string;
}) {
  const offsets = [-1, -0.5, 0.5, 1];

  return (
    <div
      className="relative mx-auto h-[320px] w-full max-w-[440px] sm:h-[360px]"
      style={{ perspective: '1400px' }}
    >
      {visas.map((v, i) => {
        const isActive = i === selected;
        const orderIdx = visas.length - 1 - Math.abs(i - selected);
        const relative = i - selected;
        const fanOffset = offsets[Math.min(Math.abs(relative), offsets.length - 1)] *
          Math.sign(relative || 1);
        const tx = isActive ? 0 : relative * 28;
        const ty = isActive ? 0 : Math.abs(relative) * 18;
        const rot = isActive ? 0 : fanOffset * 8;
        const scale = isActive ? 1 : 0.9 - Math.abs(relative) * 0.04;

        return (
          <button
            key={v.country}
            type="button"
            onClick={() => setSelected(i)}
            className="wk-cred absolute left-1/2 top-1/2 w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-2xl text-left sm:w-[340px]"
            style={{
              transform: `translate(-50%, -50%) translate(${tx}px, ${ty}px) rotate(${rot}deg) scale(${scale})`,
              zIndex: orderIdx,
              opacity: isActive ? 1 : 0.86,
              backgroundColor: 'var(--wk-card)',
              border: `1px solid ${
                isActive ? 'var(--wk-accent-ring)' : 'var(--wk-line)'
              }`,
              boxShadow: isActive
                ? `0 30px 60px -28px ${statusColor(v.status)}, var(--wk-shadow-lg)`
                : 'var(--wk-shadow-md)',
            }}
            aria-label={`Show ${v.country} visa details`}
            tabIndex={isActive ? 0 : -1}
          >
            {/* Status accent strip on top */}
            <div
              className="h-1.5 w-full rounded-t-2xl"
              style={{
                background: `linear-gradient(90deg, ${statusColor(v.status)}, color-mix(in srgb, ${statusColor(v.status)} 30%, transparent))`,
              }}
            />
            <div className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span
                    className="inline-flex h-12 w-12 flex-none items-center justify-center rounded-xl text-3xl leading-none"
                    style={{
                      backgroundColor: 'var(--wk-bg-subtle)',
                      border: '1px solid var(--wk-line)',
                    }}
                  >
                    {v.flag}
                  </span>
                  <div>
                    <div
                      className="text-[10px] font-bold uppercase tracking-widest"
                      style={{ color: 'var(--wk-text-muted)' }}
                    >
                      Visa · {v.entryType}
                    </div>
                    <h4
                      className="text-lg font-bold leading-tight"
                      style={{ color: 'var(--wk-text)' }}
                    >
                      {v.country}
                    </h4>
                    <p className="text-xs" style={{ color: 'var(--wk-text-soft)' }}>
                      {v.visaType}
                    </p>
                  </div>
                </div>

                <span
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold"
                  style={{
                    backgroundColor: statusSoft(v.status),
                    color: statusColor(v.status),
                  }}
                >
                  {v.status === 'valid' ? (
                    <CheckCircle2 className="h-3 w-3" />
                  ) : (
                    <AlertTriangle className="h-3 w-3" />
                  )}
                  {statusLabel(v.status)}
                </span>
              </div>

              <div
                className="mt-4 grid grid-cols-3 gap-3 border-t pt-3"
                style={{ borderColor: 'var(--wk-line)' }}
              >
                <div>
                  <div
                    className="text-[10px] font-semibold uppercase tracking-wider"
                    style={{ color: 'var(--wk-text-muted)' }}
                  >
                    Expires
                  </div>
                  <div
                    className="mt-0.5 text-sm font-semibold tabular-nums"
                    style={{ color: 'var(--wk-text)' }}
                  >
                    {v.expiryDate}
                  </div>
                </div>
                <div>
                  <div
                    className="text-[10px] font-semibold uppercase tracking-wider"
                    style={{ color: 'var(--wk-text-muted)' }}
                  >
                    Max stay
                  </div>
                  <div
                    className="mt-0.5 text-sm font-semibold"
                    style={{ color: 'var(--wk-text)' }}
                  >
                    {v.maxStay}
                  </div>
                </div>
                <div>
                  <div
                    className="text-[10px] font-semibold uppercase tracking-wider"
                    style={{ color: 'var(--wk-text-muted)' }}
                  >
                    {v.status === 'expired' ? 'Overdue' : 'Remaining'}
                  </div>
                  <div
                    className="mt-0.5 text-sm font-bold tabular-nums"
                    style={{ color: statusColor(v.status) }}
                  >
                    {Math.abs(v.daysRemaining)}d
                  </div>
                </div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 4: AI Document Scanner
// ---------------------------------------------------------------------------

function AIDocumentScanner() {
  return (
    <section className="wk-section-alt py-24 sm:py-32">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2">
          {/* Left: AI form scanner graphic */}
          <motion.div
            initial={{ opacity: 0, x: -24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.5 }}
            className="order-2 lg:order-1"
          >
            <FormScannerGraphic />
          </motion.div>

          {/* Right: content */}
          <motion.div
            initial={{ opacity: 0, x: 24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.5 }}
            className="order-1 lg:order-2"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Eyebrow icon={Sparkles} accent>
                AI-Powered
              </Eyebrow>
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-widest"
                style={{ backgroundColor: 'var(--wk-warm-soft)', color: 'var(--wk-warm)' }}
              >
                <span
                  className="h-1.5 w-1.5 animate-pulse rounded-full"
                  style={{ backgroundColor: 'var(--wk-warm)' }}
                />
                Beta
              </span>
            </div>

            <h2
              className="font-headline mt-5 text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl"
              style={{ color: 'var(--wk-text)' }}
            >
              Scan any form. Fill it with your{' '}
              <span className="wk-gradient-text wk-gradient-text--violet">vessel &amp; crew data</span>.
            </h2>
            <p className="mt-4 text-sm italic" style={{ color: 'var(--wk-warm)' }}>
              This feature is in active beta — expect rapid improvements.
              Auto-fill accuracy and overlay positioning are still being refined.
            </p>
            <p className="mt-4 text-lg" style={{ color: 'var(--wk-text-soft)' }}>
              Drop in any maritime document — AMSA 771, MCA testimonials,
              flag-specific certificates, or your own custom forms. Our AI
              reads the fields, matches them to the selected crew member and
              vessel, and auto-fills everything it can — including calculated
              sea time.
            </p>

            <ul className="mt-6 space-y-3">
              {[
                { icon: Upload, text: 'Drop a PDF or image — no templates needed' },
                { icon: Wand2,  text: 'AI maps every blank to crew, vessel, or sea-time data' },
                { icon: ScanSearch, text: 'See the filled result overlaid on the original to verify' },
              ].map((step) => (
                <li key={step.text} className="flex items-center gap-3">
                  <span
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg"
                    style={{ backgroundColor: 'var(--wk-accent-soft)', color: 'var(--wk-accent)' }}
                  >
                    <step.icon className="h-4 w-4" />
                  </span>
                  <span className="text-sm" style={{ color: 'var(--wk-text)' }}>
                    {step.text}
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-6 grid grid-cols-3 gap-3">
              {[
                { icon: User,       label: 'Crew profile',        accent: '#0ea5e9' },
                { icon: Ship,       label: 'Vessel data',         accent: '#10b981' },
                { icon: TrendingUp, label: 'Calculated sea time', accent: '#8b5cf6' },
              ].map((s) => (
                <div
                  key={s.label}
                  className="flex flex-col items-start gap-2 rounded-lg p-3"
                  style={{ backgroundColor: 'var(--wk-card)', border: '1px solid var(--wk-line)' }}
                >
                  <span
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg"
                    style={{
                      backgroundColor: 'color-mix(in srgb, ' + s.accent + ' 14%, transparent)',
                      color: s.accent,
                    }}
                  >
                    <s.icon className="h-4 w-4" />
                  </span>
                  <span className="text-xs font-medium" style={{ color: 'var(--wk-text)' }}>
                    {s.label}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <PrimaryCta href="/signup/vessel" tone="violet">Try the Scanner</PrimaryCta>
              <SecondaryCta href="/for-vessels">Learn More</SecondaryCta>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

/* -----------------------------------------------------------------------
   Form scanner graphic.
   A stylized maritime form sitting on a glass scanner stage. A vertical
   scan beam sweeps across it, fields reveal one-by-one with colored
   source markers (Profile / Vessel / Calculated), and a confidence
   badge + progress bar live on top. Pure CSS animations — no state.
   ----------------------------------------------------------------------- */

function FormScannerGraphic() {
  type Source = 'profile' | 'vessel' | 'calc';
  const sourceMeta: Record<Source, { color: string; label: string; icon: IconType }> = {
    profile: { color: '#0ea5e9', label: 'Profile',    icon: User },
    vessel:  { color: '#10b981', label: 'Vessel',     icon: Ship },
    calc:    { color: '#8b5cf6', label: 'Calculated', icon: TrendingUp },
  };

  const fields: Array<{
    label: string;
    value: string;
    source: Source;
    sparkle?: boolean;
  }> = [
    { label: 'Name of seafarer',   value: 'James Carter',     source: 'profile', sparkle: true },
    { label: 'Date of Birth',      value: '14 / 03 / 1992',   source: 'profile' },
    { label: 'Discharge No.',      value: 'GBR 7 824 991',    source: 'profile' },
    { label: 'Vessel name',        value: 'M/Y Serenity',     source: 'vessel',  sparkle: true },
    { label: 'Flag / IMO',         value: 'CYM · 9821467',     source: 'vessel' },
    { label: 'Gross Tonnage',      value: '1,287 GT',          source: 'vessel' },
    { label: 'Days at sea',        value: '182 days',          source: 'calc',    sparkle: true },
    { label: 'Sea time period',    value: '02 Aug — 31 Jan',  source: 'calc' },
  ];

  return (
    <div className="relative">
      {/* Soft halo behind the document */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-6 -z-10 rounded-[32px] opacity-70 blur-3xl"
        style={{
          background:
            'radial-gradient(60% 60% at 30% 20%, color-mix(in srgb, var(--wk-accent) 20%, transparent) 0%, transparent 70%),' +
            'radial-gradient(50% 60% at 80% 80%, color-mix(in srgb, var(--wk-accent-3) 18%, transparent) 0%, transparent 70%)',
        }}
      />

      {/* Scanner stage */}
      <div
        className="relative overflow-hidden rounded-2xl p-4 sm:p-5"
        style={{
          backgroundColor: 'var(--wk-bg-subtle)',
          border: '1px solid var(--wk-line)',
          boxShadow: 'var(--wk-shadow-md)',
        }}
      >
        {/* Tiny scanner toolbar */}
        <div className="mb-3 flex items-center gap-2">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: '#ef4444' }} />
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: '#f59e0b' }} />
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: '#10b981' }} />
          </span>
          <span
            className="ml-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wider"
            style={{ backgroundColor: 'var(--wk-accent-soft)', color: 'var(--wk-accent)' }}
          >
            <ScanSearch className="h-3 w-3" /> Scanning
          </span>
          <span className="ml-auto text-[10px]" style={{ color: 'var(--wk-text-muted)' }}>
            AMSA_771_Form.pdf · 142 KB
          </span>
        </div>

        {/* Document */}
        <div
          className="relative overflow-hidden rounded-xl"
          style={{
            backgroundColor: 'var(--wk-card)',
            border: '1px solid var(--wk-line)',
            boxShadow: '0 1px 0 rgba(255,255,255,0.5) inset, 0 12px 24px -16px rgba(11,22,40,0.25)',
          }}
        >
          {/* Document header */}
          <div
            className="flex items-center gap-3 border-b px-4 py-3"
            style={{ borderColor: 'var(--wk-line)', backgroundColor: 'var(--wk-bg-subtle)' }}
          >
            <span
              className="inline-flex h-8 w-8 items-center justify-center rounded-md"
              style={{
                background:
                  'linear-gradient(135deg, color-mix(in srgb, var(--wk-accent) 22%, transparent), color-mix(in srgb, var(--wk-accent-3) 18%, transparent))',
                color: 'var(--wk-accent)',
                border: '1px solid var(--wk-line)',
              }}
            >
              <Anchor className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div
                className="truncate text-[11px] font-bold uppercase tracking-wider"
                style={{ color: 'var(--wk-text)' }}
              >
                Sea Service Testimonial
              </div>
              <div className="text-[10px]" style={{ color: 'var(--wk-text-muted)' }}>
                MCA · Form MSF 4337 · Rev. 04/2025
              </div>
            </div>
            {/* Confidence badge */}
            <div
              className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold"
              style={{
                backgroundColor: 'var(--wk-good-soft)',
                color: 'var(--wk-good)',
                border: '1px solid color-mix(in srgb, var(--wk-good) 24%, transparent)',
              }}
            >
              <ShieldCheck className="h-3 w-3" />
              Match&nbsp;94%
            </div>
          </div>

          {/* Form body — field grid (the "page") */}
          <div className="relative px-4 py-4 sm:px-5">
            {/* Vertical scan beam (sits over the page) */}
            <div className="wk-scan-beam" aria-hidden />

            {/* Sparkle particles */}
            <Sparkles
              aria-hidden
              className="wk-sparkle absolute right-6 top-3 h-3 w-3"
              style={{ color: 'var(--wk-accent)' }}
            />
            <Sparkles
              aria-hidden
              className="wk-sparkle wk-sparkle-delay absolute left-3 top-1/2 h-2.5 w-2.5"
              style={{ color: 'var(--wk-accent-3)' }}
            />
            <Sparkles
              aria-hidden
              className="wk-sparkle wk-sparkle-late absolute bottom-6 right-10 h-2.5 w-2.5"
              style={{ color: 'var(--wk-good)' }}
            />

            <div className="grid grid-cols-1 gap-x-3 gap-y-2.5 sm:grid-cols-2">
              {fields.map((f, i) => {
                const meta = sourceMeta[f.source];
                return (
                  <div
                    key={f.label}
                    className="wk-field-fill relative"
                    style={{ animationDelay: `${0.15 + i * 0.08}s` }}
                  >
                    <div
                      className="text-[9px] font-semibold uppercase tracking-wider"
                      style={{ color: 'var(--wk-text-muted)' }}
                    >
                      {f.label}
                    </div>
                    <div
                      className="mt-1 flex items-center gap-2 rounded-md px-2.5 py-1.5"
                      style={{
                        backgroundColor: 'var(--wk-bg-subtle)',
                        border: '1px solid var(--wk-line)',
                        borderLeft: `2px solid ${meta.color}`,
                      }}
                    >
                      <span
                        className="text-[12px] font-medium tabular-nums"
                        style={{ color: 'var(--wk-text)' }}
                      >
                        {f.value}
                      </span>
                      {f.sparkle && (
                        <Sparkles
                          className="ml-auto h-3 w-3 flex-none"
                          style={{ color: meta.color }}
                          aria-hidden
                        />
                      )}
                      {!f.sparkle && (
                        <Check
                          className="ml-auto h-3 w-3 flex-none"
                          style={{ color: 'var(--wk-good)' }}
                          aria-hidden
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Signature blank — shows that human still signs */}
            <div className="mt-4 flex items-end gap-3">
              <div className="flex-1">
                <div
                  className="text-[9px] font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--wk-text-muted)' }}
                >
                  Captain&apos;s signature
                </div>
                <div
                  className="mt-1 h-7 rounded-md"
                  style={{
                    backgroundColor: 'var(--wk-bg-subtle)',
                    border: '1px dashed var(--wk-line-strong)',
                  }}
                />
              </div>
              <div className="w-24">
                <div
                  className="text-[9px] font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--wk-text-muted)' }}
                >
                  Date
                </div>
                <div
                  className="mt-1 flex h-7 items-center justify-center rounded-md text-[11px] font-medium tabular-nums"
                  style={{
                    backgroundColor: 'var(--wk-bg-subtle)',
                    border: '1px solid var(--wk-line)',
                    color: 'var(--wk-text)',
                  }}
                >
                  31 / 01 / 2026
                </div>
              </div>
            </div>
          </div>

          {/* Progress strip */}
          <div
            className="border-t px-4 py-3"
            style={{ borderColor: 'var(--wk-line)', backgroundColor: 'var(--wk-bg-subtle)' }}
          >
            <div className="mb-2 flex items-center gap-2">
              <Sparkles className="h-3 w-3" style={{ color: 'var(--wk-accent)' }} />
              <span className="text-[11px] font-semibold" style={{ color: 'var(--wk-text)' }}>
                Auto-filled from SeaJourney
              </span>
              <span
                className="ml-auto text-[11px] font-bold tabular-nums"
                style={{ color: 'var(--wk-accent)' }}
              >
                18 / 22
              </span>
            </div>
            <div
              className="h-1.5 overflow-hidden rounded-full"
              style={{ backgroundColor: 'var(--wk-line)' }}
            >
              <div
                className="wk-progress-fill h-full rounded-full"
                style={{
                  width: '82%',
                  background:
                    'linear-gradient(90deg, var(--wk-accent), color-mix(in srgb, var(--wk-accent-3) 80%, var(--wk-accent)))',
                }}
              />
            </div>
          </div>
        </div>

        {/* Source legend (under document, on stage) */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {(['profile', 'vessel', 'calc'] as const).map((k) => {
            const m = sourceMeta[k];
            const Icon = m.icon;
            return (
              <span
                key={k}
                className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-semibold"
                style={{
                  backgroundColor: `color-mix(in srgb, ${m.color} 12%, transparent)`,
                  color: m.color,
                  border: `1px solid color-mix(in srgb, ${m.color} 22%, transparent)`,
                }}
              >
                <Icon className="h-2.5 w-2.5" />
                {m.label}
              </span>
            );
          })}
          <span
            className="ml-auto inline-flex items-center gap-1 text-[10px] font-medium"
            style={{ color: 'var(--wk-text-muted)' }}
          >
            <Clock className="h-2.5 w-2.5" /> Filled in 1.4&nbsp;s
          </span>
        </div>
      </div>

      {/* Floating context chip — top right */}
      <div
        className="absolute -right-3 -top-3 hidden items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-semibold sm:inline-flex"
        style={{
          backgroundColor: 'var(--wk-card)',
          color: 'var(--wk-text)',
          border: '1px solid var(--wk-line)',
          boxShadow: 'var(--wk-shadow-md)',
        }}
      >
        <Wand2 className="h-3.5 w-3.5" style={{ color: 'var(--wk-accent)' }} />
        AI mapping fields
      </div>

      {/* Floating context chip — bottom left */}
      <div
        className="absolute -bottom-3 -left-3 hidden items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-semibold sm:inline-flex"
        style={{
          backgroundColor: 'var(--wk-card)',
          color: 'var(--wk-text)',
          border: '1px solid var(--wk-line)',
          boxShadow: 'var(--wk-shadow-md)',
        }}
      >
        <ShieldCheck className="h-3.5 w-3.5" style={{ color: 'var(--wk-good)' }} />
        Verified vs SeaJourney
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 5: Official Forms
// ---------------------------------------------------------------------------

const forms: Array<{ name: string; code: string; description: string; icon: IconType; accent: string; popular?: boolean }> = [
  { name: 'MCA Watch Rating Certificate', code: 'MSF 4371', description: 'Official application for Navigational, Engine Room, or Electro-Technical Watch Rating certification.', icon: FileText,  accent: '#0ea5e9', popular: true },
  { name: 'MCA Officer of the Watch',     code: 'MSF 4370', description: 'Application for Officer of the Watch Certificate of Competency.',                                     icon: FileCheck, accent: '#8b5cf6', popular: true },
  { name: 'Sea Service Testimonials',     code: 'Custom',   description: 'Auto-generated testimonials from your logged sea time with captain signatures.',                     icon: Shield,    accent: '#10b981' },
];

const formBenefits: Array<{ icon: IconType; title: string; desc: string; accent: string }> = [
  { icon: Zap,          title: 'Instant Generation', desc: 'Fill official forms in seconds using your logged sea time data.',        accent: '#d97706' },
  { icon: CheckCircle2, title: 'Auto-Populated Data',desc: 'Your vessel details, sea service, and personal info automatically filled.', accent: '#10b981' },
  { icon: Clock,        title: 'Save & Re-download', desc: 'Access your previously generated applications anytime.',                 accent: '#0ea5e9' },
  { icon: Printer,      title: 'Print-Ready PDFs',   desc: 'Official format PDFs ready to submit to maritime authorities.',           accent: '#8b5cf6' },
];

function OfficialForms() {
  return (
    <section className="py-24 sm:py-32" style={{ backgroundColor: 'var(--wk-bg)' }}>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <Eyebrow icon={Printer}>Official Applications</Eyebrow>
          <h2
            className="font-headline mt-4 text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl"
            style={{ color: 'var(--wk-text)' }}
          >
            Instant <span className="wk-gradient-text wk-gradient-text--amber">Official Applications</span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg" style={{ color: 'var(--wk-text-soft)' }}>
            Generate print-ready official applications like MCA Watch Rating,
            Officer of the Watch, and more. Your sea service data automatically
            populates the forms.
          </p>
        </div>

        <div className="mx-auto mt-14 grid max-w-6xl gap-5 md:grid-cols-3">
          {forms.map((f, i) => (
            <motion.div
              key={f.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.4, delay: i * 0.06 }}
              className="wk-card-hover relative overflow-hidden rounded-2xl p-6"
              style={{ backgroundColor: 'var(--wk-card)', border: '1px solid var(--wk-line)' }}
            >
              {f.popular && (
                <span
                  className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                  style={{ backgroundColor: 'var(--wk-warm-soft)', color: 'var(--wk-warm)' }}
                >
                  <Star className="h-3 w-3 fill-current" />
                  Popular
                </span>
              )}

              <div
                className="inline-flex h-12 w-12 items-center justify-center rounded-xl"
                style={{
                  backgroundColor: 'color-mix(in srgb, ' + f.accent + ' 14%, transparent)',
                  color: f.accent,
                }}
              >
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-5 text-lg font-bold" style={{ color: 'var(--wk-text)' }}>
                {f.name}
              </h3>
              <p className="mt-1 font-mono text-xs" style={{ color: 'var(--wk-text-muted)' }}>
                {f.code}
              </p>
              <p className="mt-3 text-sm leading-relaxed" style={{ color: 'var(--wk-text-soft)' }}>
                {f.description}
              </p>
              <div
                className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold"
                style={{ color: f.accent }}
              >
                <Download className="h-4 w-4" />
                Generate Form
              </div>
            </motion.div>
          ))}
        </div>

        <div className="mx-auto mt-10 grid max-w-6xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {formBenefits.map((b) => (
            <div
              key={b.title}
              className="rounded-2xl p-5 text-center"
              style={{ backgroundColor: 'var(--wk-card)', border: '1px solid var(--wk-line)' }}
            >
              <div
                className="mx-auto inline-flex h-11 w-11 items-center justify-center rounded-xl"
                style={{
                  backgroundColor: 'color-mix(in srgb, ' + b.accent + ' 14%, transparent)',
                  color: b.accent,
                }}
              >
                <b.icon className="h-5 w-5" />
              </div>
              <h4 className="mt-3 text-sm font-semibold" style={{ color: 'var(--wk-text)' }}>
                {b.title}
              </h4>
              <p className="mt-1.5 text-xs leading-relaxed" style={{ color: 'var(--wk-text-soft)' }}>
                {b.desc}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-10 text-center">
          <p className="text-sm" style={{ color: 'var(--wk-text-muted)' }}>
            More official forms coming soon including Chief Mate, Master, and Engineer certifications.
          </p>
          <div className="mt-4 flex justify-center">
            <PrimaryCta href="/signup" tone="amber">
              <Zap className="h-4 w-4 shrink-0" />
              Start Generating Forms
            </PrimaryCta>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Section 6: Certificate Tracking
// ---------------------------------------------------------------------------

function CertificateTracking() {
  const features: Array<{ icon: IconType; title: string; desc: string; accent: string }> = [
    { icon: Calendar,     title: 'Expiration Alerts', desc: 'Get notified before your certificates expire',  accent: '#0ea5e9' },
    { icon: FileCheck,    title: 'Renewal Tracking',  desc: 'Track renewal dates and requirements',          accent: '#10b981' },
    { icon: TrendingUp,   title: 'Career Progress',   desc: 'Monitor your certification milestones',         accent: '#d97706' },
    { icon: CheckCircle2, title: 'Compliance Status', desc: 'Ensure you meet all requirements',              accent: '#8b5cf6' },
  ];

  return (
    <section className="wk-section-alt py-24 sm:py-32">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2">
          <div>
            <Eyebrow icon={Award} accent>
              New Feature
            </Eyebrow>
            <h2
              className="font-headline mt-5 text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl"
              style={{ color: 'var(--wk-text)' }}
            >
              Track Your{' '}
              <span className="wk-gradient-text wk-gradient-text--sunrise">Certificates</span> &amp; Stay Compliant
            </h2>
            <p className="mt-4 text-lg" style={{ color: 'var(--wk-text-soft)' }}>
              Never miss a renewal deadline again. Track all your maritime
              certificates, get expiration alerts, and monitor your compliance
              status — all in one place.
            </p>

            <div className="mt-8 grid grid-cols-2 gap-4">
              {features.map((f) => (
                <div
                  key={f.title}
                  className="rounded-xl p-4"
                  style={{ backgroundColor: 'var(--wk-card)', border: '1px solid var(--wk-line)' }}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="inline-flex h-10 w-10 items-center justify-center rounded-lg"
                      style={{
                        backgroundColor: 'color-mix(in srgb, ' + f.accent + ' 14%, transparent)',
                        color: f.accent,
                      }}
                    >
                      <f.icon className="h-5 w-5" />
                    </span>
                    <span className="text-sm font-semibold" style={{ color: 'var(--wk-text)' }}>
                      {f.title}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed" style={{ color: 'var(--wk-text-soft)' }}>
                    {f.desc}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <PrimaryCta href="/dashboard/certificates" tone="sunrise">Track Certificates</PrimaryCta>
              <SecondaryCta href="/signup">Get Started</SecondaryCta>
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, x: 24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.5 }}
          >
            <ComplianceDashboardGraphic />
          </motion.div>
        </div>
      </div>
    </section>
  );
}

/* -----------------------------------------------------------------------
   Compliance dashboard graphic.
   Animated donut compliance score + Gantt-style certificate timeline
   with month markers, a glowing "Today" line, and color-coded validity
   bars (valid / warning / critical). Pure CSS animations, no state.
   ----------------------------------------------------------------------- */

function ComplianceDashboardGraphic() {
  // Timeline range: -12 months .. +12 months from today (today sits at 50%).
  const monthMarks = [
    { label: "Apr '25", x: 0   },
    { label: "Aug '25", x: 16.66 },
    { label: "Dec '25", x: 33.33 },
    { label: 'Today',   x: 50  },
    { label: "Aug '26", x: 66.66 },
    { label: "Dec '26", x: 83.33 },
    { label: "Apr '27", x: 100 },
  ];

  type Status = 'valid' | 'warning' | 'critical';
  const statusMeta: Record<Status, { color: string; soft: string; label: string; ring: string }> = {
    valid:    { color: 'var(--wk-good)', soft: 'var(--wk-good-soft)', label: 'Valid',         ring: 'color-mix(in srgb, var(--wk-good) 26%, transparent)' },
    warning:  { color: 'var(--wk-warm)', soft: 'var(--wk-warm-soft)', label: 'Renew soon',    ring: 'color-mix(in srgb, var(--wk-warm) 32%, transparent)' },
    critical: { color: 'var(--wk-bad)',  soft: 'color-mix(in srgb, var(--wk-bad) 14%, transparent)', label: 'Action needed', ring: 'color-mix(in srgb, var(--wk-bad) 36%, transparent)' },
  };

  // Each cert is positioned on the 24-month timeline.
  // issuedMo / expiryMo are months from "today". 50% = today.
  const certs: Array<{
    name: string;
    code: string;
    icon: IconType;
    issuedMo: number;
    expiryMo: number;
    daysLeft: number;
    status: Status;
  }> = [
    { name: 'STCW Basic Safety',   code: 'A-VI/1',   icon: ShieldCheck,   issuedMo: -10, expiryMo: 14, daysLeft: 421, status: 'valid'    },
    { name: 'ENG1 Medical',         code: 'MCA',      icon: FileCheck,     issuedMo: -10, expiryMo: 2,  daysLeft: 60,  status: 'warning'  },
    { name: 'Watch Rating Cert.',   code: 'II/4',     icon: Award,         issuedMo: -6,  expiryMo: 18, daysLeft: 540, status: 'valid'    },
    { name: 'Radar / ARPA',         code: 'A-II',     icon: Compass,       issuedMo: -8,  expiryMo: 1,  daysLeft: 28,  status: 'critical' },
    { name: 'Tanker Endorsement',   code: 'V/1-1',    icon: Briefcase,     issuedMo: -3,  expiryMo: 9,  daysLeft: 270, status: 'valid'    },
  ];

  const toPct = (m: number) => Math.max(0, Math.min(100, ((m + 12) / 24) * 100));

  // Donut compliance score = (certs not critical) / total. We'll display 92%.
  const compliancePct = 92;
  const circumference = 264; // 2π · r where r = 42
  const donutOffset = circumference * (1 - compliancePct / 100);

  return (
    <div className="relative">
      {/* Soft halo */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-6 -z-10 rounded-[32px] opacity-70 blur-3xl"
        style={{
          background:
            'radial-gradient(60% 60% at 70% 20%, color-mix(in srgb, var(--wk-good) 18%, transparent) 0%, transparent 70%),' +
            'radial-gradient(50% 60% at 20% 80%, color-mix(in srgb, var(--wk-warm) 18%, transparent) 0%, transparent 70%)',
        }}
      />

      <div
        className="relative overflow-hidden rounded-2xl p-4 sm:p-5"
        style={{
          backgroundColor: 'var(--wk-bg-subtle)',
          border: '1px solid var(--wk-line)',
          boxShadow: 'var(--wk-shadow-md)',
        }}
      >
        {/* Toolbar */}
        <div className="mb-3 flex items-center gap-2">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: '#ef4444' }} />
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: '#f59e0b' }} />
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: '#10b981' }} />
          </span>
          <span
            className="ml-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wider"
            style={{ backgroundColor: 'var(--wk-good-soft)', color: 'var(--wk-good)' }}
          >
            <ShieldCheck className="h-3 w-3" /> Live tracker
          </span>
          <span className="ml-auto text-[10px]" style={{ color: 'var(--wk-text-muted)' }}>
            certifications · 5 active
          </span>
        </div>

        {/* Score header */}
        <div
          className="rounded-xl p-4"
          style={{
            backgroundColor: 'var(--wk-card)',
            border: '1px solid var(--wk-line)',
          }}
        >
          <div className="flex items-center gap-4">
            {/* Donut */}
            <div className="relative flex-none">
              <svg viewBox="0 0 100 100" className="h-20 w-20 -rotate-90">
                <defs>
                  <linearGradient id="wk-donut-grad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="var(--wk-good)" />
                    <stop offset="100%" stopColor="var(--wk-accent)" />
                  </linearGradient>
                </defs>
                <circle
                  cx="50" cy="50" r="42"
                  fill="none"
                  stroke="var(--wk-line)"
                  strokeWidth="6"
                />
                <circle
                  cx="50" cy="50" r="42"
                  fill="none"
                  stroke="url(#wk-donut-grad)"
                  strokeWidth="6"
                  strokeLinecap="round"
                  className="wk-donut-arc"
                  style={{ ['--wk-donut-offset' as never]: donutOffset } as React.CSSProperties}
                />
              </svg>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span
                  className="text-xl font-bold tabular-nums"
                  style={{ color: 'var(--wk-text)' }}
                >
                  {compliancePct}%
                </span>
                <span
                  className="-mt-0.5 text-[9px] font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--wk-text-muted)' }}
                >
                  Score
                </span>
              </div>
            </div>

            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--wk-good)' }}>
                Compliance score
              </div>
              <div className="mt-0.5 text-[15px] font-bold leading-snug" style={{ color: 'var(--wk-text)' }}>
                Maritime portfolio
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <StatusPill color="var(--wk-good)" soft="var(--wk-good-soft)" label="3 valid" />
                <StatusPill color="var(--wk-warm)" soft="var(--wk-warm-soft)" label="1 renew" />
                <StatusPill
                  color="var(--wk-bad)"
                  soft="color-mix(in srgb, var(--wk-bad) 14%, transparent)"
                  label="1 urgent"
                  pulse
                />
              </div>
            </div>
          </div>
        </div>

        {/* Timeline */}
        <div
          className="mt-3 rounded-xl p-3 sm:p-4"
          style={{
            backgroundColor: 'var(--wk-card)',
            border: '1px solid var(--wk-line)',
          }}
        >
          <div className="mb-2 flex items-center gap-2">
            <Calendar className="h-3.5 w-3.5" style={{ color: 'var(--wk-accent)' }} />
            <span className="text-[11px] font-semibold" style={{ color: 'var(--wk-text)' }}>
              Renewal timeline
            </span>
            <span className="ml-auto text-[10px]" style={{ color: 'var(--wk-text-muted)' }}>
              24-month view
            </span>
          </div>

          {/* Month markers + grid */}
          <div className="relative pl-[110px] pr-[60px]">
            {/* Month labels strip */}
            <div className="relative h-4">
              {monthMarks.map((m) => {
                const isToday = m.label === 'Today';
                return (
                  <span
                    key={m.label}
                    className="absolute top-0 -translate-x-1/2 whitespace-nowrap text-[9px] font-semibold uppercase tracking-wider"
                    style={{
                      left: `${m.x}%`,
                      color: isToday ? 'var(--wk-accent)' : 'var(--wk-text-muted)',
                    }}
                  >
                    {m.label}
                  </span>
                );
              })}
            </div>

            {/* Vertical grid lines + today line — overlaid behind bars */}
            <div className="pointer-events-none absolute inset-0 top-4">
              {monthMarks.map((m) => {
                if (m.label === 'Today') return null;
                return (
                  <span
                    key={`grid-${m.label}`}
                    className="absolute bottom-0 top-1"
                    style={{
                      left: `calc(110px + (100% - 110px - 60px) * ${m.x / 100})`,
                      borderLeft: '1px dashed var(--wk-line)',
                      width: 0,
                    }}
                  />
                );
              })}
              {/* "Today" line spans full timeline column */}
              <span
                aria-hidden
                className="wk-today-line absolute bottom-0 top-1 w-px"
                style={{
                  left: `calc(110px + (100% - 110px - 60px) * 0.5)`,
                  background:
                    'linear-gradient(180deg, transparent, var(--wk-accent) 12%, var(--wk-accent) 88%, transparent)',
                  boxShadow: '0 0 6px color-mix(in srgb, var(--wk-accent) 70%, transparent)',
                }}
              />
            </div>

            {/* Bars */}
            <div className="relative mt-2 space-y-2">
              {certs.map((c, i) => {
                const meta = statusMeta[c.status];
                const startPct = toPct(c.issuedMo);
                const endPct = toPct(c.expiryMo);
                const widthPct = Math.max(2, endPct - startPct);
                const Icon = c.icon;
                return (
                  <div key={c.name} className="relative flex items-center gap-2">
                    {/* Cert label (fixed width) */}
                    <div
                      className="absolute left-[-110px] top-1/2 flex w-[104px] -translate-y-1/2 items-center gap-1.5"
                    >
                      <span
                        className="inline-flex h-6 w-6 flex-none items-center justify-center rounded-md"
                        style={{
                          backgroundColor: meta.soft,
                          color: meta.color,
                          border: `1px solid ${meta.ring}`,
                        }}
                      >
                        <Icon className="h-3 w-3" />
                      </span>
                      <div className="min-w-0">
                        <div
                          className="truncate text-[11px] font-semibold leading-tight"
                          style={{ color: 'var(--wk-text)' }}
                        >
                          {c.name}
                        </div>
                        <div
                          className="truncate text-[9px] uppercase tracking-wider"
                          style={{ color: 'var(--wk-text-muted)' }}
                        >
                          {c.code}
                        </div>
                      </div>
                    </div>

                    {/* Track */}
                    <div
                      className="relative h-6 flex-1 overflow-hidden rounded-md"
                      style={{ backgroundColor: 'var(--wk-bg-subtle)' }}
                    >
                      {/* The bar itself */}
                      <div
                        className="wk-tl-bar absolute top-1/2 -translate-y-1/2 rounded-md"
                        style={{
                          left: `${startPct}%`,
                          width: `${widthPct}%`,
                          height: '14px',
                          background: `linear-gradient(90deg, color-mix(in srgb, ${meta.color} 65%, transparent), ${meta.color})`,
                          border: `1px solid ${meta.ring}`,
                          animationDelay: `${0.2 + i * 0.1}s`,
                          boxShadow: `0 1px 0 color-mix(in srgb, ${meta.color} 28%, transparent) inset`,
                        }}
                      >
                        {/* End cap dot (expiry marker) */}
                        <span
                          className="absolute right-0 top-1/2 h-2 w-2 -translate-x-0.5 -translate-y-1/2 rounded-full"
                          style={{
                            backgroundColor: '#ffffff',
                            border: `2px solid ${meta.color}`,
                          }}
                        />
                      </div>
                    </div>

                    {/* Days remaining (fixed width on right) */}
                    <div
                      className="absolute right-[-60px] top-1/2 flex w-[52px] -translate-y-1/2 flex-col items-end"
                    >
                      <span
                        className="text-[11px] font-bold tabular-nums leading-none"
                        style={{ color: meta.color }}
                      >
                        {c.daysLeft}
                      </span>
                      <span
                        className="mt-0.5 text-[9px] uppercase tracking-wider"
                        style={{ color: 'var(--wk-text-muted)' }}
                      >
                        days
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer legend */}
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-2"
              style={{ borderColor: 'var(--wk-line)' }}
            >
              <LegendDot color="var(--wk-good)" label="Valid" />
              <LegendDot color="var(--wk-warm)" label="Renew within 90d" />
              <LegendDot color="var(--wk-bad)" label="Action needed" />
              <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-medium" style={{ color: 'var(--wk-text-muted)' }}>
                <Bell className="h-2.5 w-2.5" /> 2 alerts queued
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Floating chip — top right */}
      <div
        className="absolute -right-3 -top-3 hidden items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-semibold sm:inline-flex"
        style={{
          backgroundColor: 'var(--wk-card)',
          color: 'var(--wk-text)',
          border: '1px solid var(--wk-line)',
          boxShadow: 'var(--wk-shadow-md)',
        }}
      >
        <Bell className="h-3.5 w-3.5" style={{ color: 'var(--wk-warm)' }} />
        Renewal in 28&nbsp;days
      </div>

      {/* Floating chip — bottom left */}
      <div
        className="absolute -bottom-3 -left-3 hidden items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-semibold sm:inline-flex"
        style={{
          backgroundColor: 'var(--wk-card)',
          color: 'var(--wk-text)',
          border: '1px solid var(--wk-line)',
          boxShadow: 'var(--wk-shadow-md)',
        }}
      >
        <TrendingUp className="h-3.5 w-3.5" style={{ color: 'var(--wk-good)' }} />
        On track for OOW
      </div>
    </div>
  );
}

function StatusPill({
  color,
  soft,
  label,
  pulse,
}: {
  color: string;
  soft: string;
  label: string;
  pulse?: boolean;
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold"
      style={{ backgroundColor: soft, color }}
    >
      <span
        className={cn('h-1.5 w-1.5 rounded-full', pulse && 'wk-pulse-soft')}
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-medium" style={{ color: 'var(--wk-text-muted)' }}>
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Section 7: Watch Feature Coming Soon
// ---------------------------------------------------------------------------

function WatchComingSoon() {
  const points: Array<{ icon: IconType; label: string; accent: string }> = [
    { icon: WatchIcon, label: 'Log from your wrist', accent: '#0ea5e9' },
    { icon: Compass,   label: 'Nav watch tracking',   accent: '#8b5cf6' },
    { icon: Clock,     label: 'Quick start & end',    accent: '#10b981' },
    { icon: Bell,      label: 'Watch reminders',      accent: '#d97706' },
  ];

  const benefits = [
    'Start and end watches with one tap — no phone in hand',
    'Syncs automatically to your SeaJourney app and sea time',
    'Bridge, anchor, and custom watch types',
    'Ideal for crew on duty who need hands-free logging',
  ];

  return (
    <section className="py-24 sm:py-32" style={{ backgroundColor: 'var(--wk-bg)' }}>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <Eyebrow icon={WatchIcon} accent>
            Coming Soon
          </Eyebrow>
          <h2
            className="font-headline mt-5 text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl"
            style={{ color: 'var(--wk-text)' }}
          >
            Nav watches,{' '}
            <span className="wk-gradient-text wk-gradient-text--rose">straight from your wrist</span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg" style={{ color: 'var(--wk-text-soft)' }}>
            Record bridge and nav watches in seconds from your smartwatch — no
            phone needed. Works on Apple Watch and Galaxy Watch and syncs to
            your SeaJourney account.
          </p>
        </div>

        <div className="mx-auto mt-14 grid max-w-6xl items-start gap-8 lg:grid-cols-12">
          <div
            className="rounded-3xl p-8 sm:p-10 lg:col-span-7"
            style={{
              backgroundColor: 'var(--wk-card)',
              border: '1px solid var(--wk-line)',
              boxShadow: 'var(--wk-shadow-sm)',
            }}
          >
            <p
              className="text-center text-[11px] font-bold uppercase tracking-widest"
              style={{ color: 'var(--wk-accent)' }}
            >
              Interactive demo
            </p>

            <WatchPreview />

            <p className="mt-8 text-center text-xs" style={{ color: 'var(--wk-text-muted)' }}>
              Spin the <span className="font-semibold" style={{ color: 'var(--wk-text)' }}>crown</span> to switch watch type · press the{' '}
              <span className="font-semibold" style={{ color: 'var(--wk-text)' }}>side button</span> for live weather · drop a{' '}
              <span className="font-semibold" style={{ color: 'var(--wk-text)' }}>Note</span> mid-watch.
            </p>
          </div>

          <div
            className="rounded-2xl p-6 lg:col-span-5"
            style={{
              backgroundColor: 'var(--wk-card)',
              border: '1px solid var(--wk-line)',
            }}
          >
            <h3
              className="font-headline text-lg font-semibold"
              style={{ color: 'var(--wk-text)' }}
            >
              Why log from your watch?
            </h3>
            <ul className="mt-5 space-y-4">
              {benefits.map((t) => (
                <li key={t} className="flex items-start gap-3">
                  <span
                    className="mt-0.5 inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg"
                    style={{ backgroundColor: 'var(--wk-accent-soft)', color: 'var(--wk-accent)' }}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                  </span>
                  <span className="text-sm leading-relaxed" style={{ color: 'var(--wk-text-soft)' }}>
                    {t}
                  </span>
                </li>
              ))}
            </ul>
            <div
              className="mt-6 flex items-center gap-3 border-t pt-5"
              style={{ borderColor: 'var(--wk-line)' }}
            >
              <span
                className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
                style={{ backgroundColor: 'var(--wk-bg-subtle)', color: 'var(--wk-text-soft)' }}
              >
                <Smartphone className="h-4 w-4" />
              </span>
              <p className="text-sm" style={{ color: 'var(--wk-text-soft)' }}>
                Syncs to your SeaJourney app and counts toward your sea time.
              </p>
            </div>
          </div>
        </div>

        <div className="mx-auto mt-12 grid max-w-6xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {points.map((p) => (
            <div
              key={p.label}
              className="flex items-center gap-3 rounded-xl p-4"
              style={{ backgroundColor: 'var(--wk-card)', border: '1px solid var(--wk-line)' }}
            >
              <span
                className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg"
                style={{
                  backgroundColor: 'color-mix(in srgb, ' + p.accent + ' 14%, transparent)',
                  color: p.accent,
                }}
              >
                <p.icon className="h-4 w-4" />
              </span>
              <span className="text-sm font-medium" style={{ color: 'var(--wk-text)' }}>
                {p.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Watch preview (Apple Watch with circular progress ring + floating chips)
// ---------------------------------------------------------------------------

type WatchType = 'Bridge' | 'Anchor' | 'Engine';
const WATCH_TYPES: WatchType[] = ['Bridge', 'Anchor', 'Engine'];
const WATCH_TYPE_META: Record<WatchType, { icon: IconType; tint: string }> = {
  Bridge: { icon: Compass, tint: '#7dd3fc' },
  Anchor: { icon: Anchor,  tint: '#fbbf24' },
  Engine: { icon: Wrench,  tint: '#f472b6' },
};

type WatchPage = 'watch' | 'weather';

function WatchPreview() {
  const [page, setPage] = useState<WatchPage>('watch');
  const [watchType, setWatchType] = useState<WatchType>('Bridge');
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [logs, setLogs] = useState(0);
  const [headingDeg, setHeadingDeg] = useState(273);
  const [done, setDone] = useState<{ duration: string; type: WatchType } | null>(null);
  const [weatherTick, setWeatherTick] = useState(0);

  // Tick the elapsed timer + slowly drift the live heading.
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => {
      setElapsed((s) => s + 1);
      setHeadingDeg((d) => (d + (Math.random() < 0.5 ? -1 : 1) + 360) % 360);
    }, 1000);
    return () => clearInterval(t);
  }, [running]);

  // Always-running tick that drives drifting "live" weather values.
  useEffect(() => {
    const t = setInterval(() => setWeatherTick((n) => n + 1), 2200);
    return () => clearInterval(t);
  }, []);

  // Auto-clear the success state.
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(null), 1800);
    return () => clearTimeout(t);
  }, [done]);

  const formatted = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;

  const cycleType = useCallback(() => {
    if (running || page !== 'watch') return;
    setWatchType((t) => WATCH_TYPES[(WATCH_TYPES.indexOf(t) + 1) % WATCH_TYPES.length]);
  }, [running, page]);

  const onStart = useCallback(() => {
    setRunning(true);
    setElapsed(0);
    setLogs(0);
    setDone(null);
  }, []);
  const onEnd = useCallback(() => {
    setRunning(false);
    setDone({ duration: formatted, type: watchType });
    setElapsed(0);
    setLogs(0);
  }, [formatted, watchType]);
  const onAddNote = useCallback(() => {
    setLogs((n) => n + 1);
  }, []);

  // Progress ring: one full revolution per minute (60s), purely visual.
  const RING_R = 86;
  const RING_C = 2 * Math.PI * RING_R;
  const progress = running ? (elapsed % 60) / 60 : 0;
  const dashoffset = RING_C * (1 - progress);

  const TypeMeta = WATCH_TYPE_META[watchType];

  // Derived "live" weather values (wobble around realistic Mediterranean spring values).
  const cloudPct = Math.max(0, Math.min(100, Math.round(58 + Math.sin(weatherTick * 0.32) * 12)));
  const tempC = +(20.6 + Math.sin(weatherTick * 0.21) * 1.4).toFixed(1);
  const humidityPct = Math.max(0, Math.min(100, Math.round(64 + Math.cos(weatherTick * 0.27) * 8)));
  const windKn = Math.max(0, Math.round(11 + Math.sin(weatherTick * 0.41) * 4));
  const seaSwellM = +(0.7 + Math.abs(Math.sin(weatherTick * 0.18)) * 0.6).toFixed(1);
  const seaState = seaSwellM < 0.5
    ? { label: 'Calm',     tone: '#34d399' }
    : seaSwellM < 1.0
    ? { label: 'Slight',   tone: '#7dd3fc' }
    : seaSwellM < 1.6
    ? { label: 'Moderate', tone: '#fbbf24' }
    : { label: 'Rough',    tone: '#fb7185' };

  return (
    <div className="relative mt-10 flex justify-center">
      <div className="relative" style={{ width: 320, maxWidth: '100%' }}>
        {/* Soft halo glow behind the watch */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full blur-2xl"
          style={{
            width: 360,
            height: 360,
            background:
              'radial-gradient(circle, color-mix(in srgb, var(--wk-accent) 22%, transparent) 0%, transparent 65%)',
          }}
        />

        {/* Concentric pulse rings */}
        <span
          aria-hidden
          className="wk-cloud-pulse pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{ width: 280, height: 280 }}
        />

        {/* Floating context chips (above the watch case) */}
        <FloatingChip
          icon={Bell}
          label="Watch reminders"
          tone="warn"
          className="wk-chip-float absolute -left-2 -top-2 z-20 sm:-left-8"
        />
        <FloatingChip
          icon={TypeMeta.icon}
          label={`${watchType} watch`}
          tone="accent"
          className="wk-chip-float wk-chip-float-delay absolute -right-2 top-12 z-20 sm:-right-8"
        />
        <FloatingChip
          icon={Waves}
          label="Synced to sea time"
          tone="good"
          className="wk-chip-float wk-chip-float-late absolute -bottom-3 left-1/2 z-20 -translate-x-1/2"
        />

        {/* Apple Watch */}
        <div className="relative z-10 mx-auto" style={{ width: 220 }}>
          {/* Body / case */}
          <div
            className="relative rounded-[3rem] p-1.5"
            style={{
              background:
                'linear-gradient(145deg, #3a3a3c 0%, #1c1c1e 45%, #0d0d0f 100%)',
              boxShadow:
                '0 30px 60px -20px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04) inset',
            }}
          >
            {/* Crown — tap to cycle watch type when idle */}
            <button
              type="button"
              onClick={cycleType}
              disabled={running || !!done || page !== 'watch'}
              aria-label="Cycle watch type"
              className="absolute -right-2.5 top-[34%] flex h-9 w-3 -translate-y-1/2 items-center justify-center rounded-r-md disabled:opacity-60"
              style={{
                background:
                  'linear-gradient(180deg, #6b6b70 0%, #2a2a2c 60%, #0d0d0f 100%)',
                boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.05)',
                cursor:
                  running || done || page !== 'watch' ? 'default' : 'pointer',
              }}
            >
              <span
                className="absolute inset-y-1 right-0.5 w-px"
                style={{ background: 'rgba(255,255,255,0.08)' }}
                aria-hidden
              />
            </button>

            {/* Crown ripple hint when idle on watch page (encourages tap) */}
            {!running && !done && page === 'watch' && (
              <span
                aria-hidden
                className="wk-pulse-ring absolute -right-2.5 top-[34%] block h-3 w-3 -translate-y-1/2 rounded-full"
                style={{ color: 'var(--wk-accent)' }}
              />
            )}

            {/* Side button — tap to switch page (Watch ↔ Weather) */}
            <button
              type="button"
              onClick={() => setPage((p) => (p === 'watch' ? 'weather' : 'watch'))}
              aria-label={`Show ${page === 'watch' ? 'weather' : 'watch'} page`}
              className="absolute -right-1.5 top-[58%] h-6 w-1.5 rounded-r"
              style={{
                background:
                  'linear-gradient(180deg, #4a4a4d 0%, #1c1c1e 100%)',
                cursor: 'pointer',
              }}
            />
            {/* Display */}
            <div
              className="relative overflow-hidden rounded-[2.55rem]"
              style={{
                width: 208,
                height: 256,
                background:
                  'radial-gradient(120% 80% at 30% 0%, #0e2138 0%, #07121f 50%, #03070d 100%)',
                boxShadow: 'inset 0 0 30px rgba(0,0,0,0.6)',
              }}
            >
              {/* Corner sparkle */}
              <span
                aria-hidden
                className="pointer-events-none absolute"
                style={{
                  top: 8,
                  left: 12,
                  right: 12,
                  height: 30,
                  background:
                    'radial-gradient(60% 100% at 50% 0%, rgba(255,255,255,0.10) 0%, transparent 70%)',
                }}
              />

              {/* Top status row */}
              <div className="relative flex items-center justify-between px-4 pt-3 text-[8px] font-semibold tabular-nums text-white/60">
                <span className="flex items-center gap-1">
                  <span
                    className="inline-block h-1 w-1 rounded-full"
                    style={{
                      backgroundColor:
                        page === 'weather'
                          ? '#7dd3fc'
                          : running
                          ? '#fbbf24'
                          : '#34d399',
                    }}
                  />
                  {page === 'weather'
                    ? 'Conditions live'
                    : running
                    ? 'Watch live'
                    : done
                    ? 'Logged'
                    : 'Synced'}
                </span>
                <span>09:41</span>
              </div>

              {/* Page indicator (Watch · Weather) */}
              <div className="relative mt-1 flex items-center justify-center gap-1.5">
                {(['watch', 'weather'] as WatchPage[]).map((p) => {
                  const isActive = page === p;
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPage(p)}
                      aria-label={`Show ${p} page`}
                      className="rounded-full transition-all"
                      style={{
                        height: 4,
                        width: isActive ? 14 : 4,
                        backgroundColor: isActive
                          ? 'rgba(255,255,255,0.85)'
                          : 'rgba(255,255,255,0.3)',
                      }}
                    />
                  );
                })}
              </div>

              {page === 'weather' ? (
                <WatchWeatherPage
                  cloudPct={cloudPct}
                  tempC={tempC}
                  humidityPct={humidityPct}
                  windKn={windKn}
                  seaSwellM={seaSwellM}
                  seaState={seaState}
                />
              ) : (
                <>

              {/* Vessel + watch type chip */}
              <div className="relative mt-1 flex items-center justify-between px-4">
                <div className="min-w-0 flex-1">
                  <p className="text-[7.5px] uppercase tracking-[0.18em] text-white/40">
                    Vessel
                  </p>
                  <p className="truncate text-[9.5px] font-semibold text-white/90">
                    M/Y Ocean Star
                  </p>
                </div>
                <span
                  className="ml-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider"
                  style={{
                    backgroundColor: `color-mix(in srgb, ${TypeMeta.tint} 22%, transparent)`,
                    color: TypeMeta.tint,
                    border: `1px solid color-mix(in srgb, ${TypeMeta.tint} 45%, transparent)`,
                  }}
                >
                  <TypeMeta.icon className="h-2.5 w-2.5" strokeWidth={2} />
                  {watchType}
                </span>
              </div>

              {/* Center: ring + content */}
              <div className="relative mt-1.5 flex h-[140px] items-center justify-center">
                <svg
                  viewBox="0 0 200 200"
                  className="absolute inset-0 m-auto"
                  style={{ width: 188, height: 188 }}
                  aria-hidden
                >
                  <defs>
                    <linearGradient id="wk-watch-ring" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#38bdf8" />
                      <stop offset="55%" stopColor="#818cf8" />
                      <stop offset="100%" stopColor="#22d3ee" />
                    </linearGradient>
                  </defs>
                  <circle
                    cx={100}
                    cy={100}
                    r={RING_R}
                    fill="none"
                    stroke="rgba(255,255,255,0.08)"
                    strokeWidth={8}
                  />
                  <circle
                    className="wk-watch-ring-sweep"
                    cx={100}
                    cy={100}
                    r={RING_R}
                    fill="none"
                    stroke="url(#wk-watch-ring)"
                    strokeWidth={8}
                    strokeLinecap="round"
                    strokeDasharray={RING_C}
                    strokeDashoffset={dashoffset}
                    transform="rotate(-90 100 100)"
                    style={{
                      filter: running
                        ? 'drop-shadow(0 0 6px rgba(56,189,248,0.6))'
                        : 'none',
                    }}
                  />
                </svg>

                {done ? (
                  <div className="relative flex flex-col items-center text-white">
                    <span
                      className="flex h-10 w-10 items-center justify-center rounded-full"
                      style={{
                        background:
                          'radial-gradient(circle, rgba(74,222,128,0.35) 0%, rgba(22,163,74,0.18) 60%, transparent 80%)',
                        color: '#86efac',
                      }}
                    >
                      <Check className="h-6 w-6" strokeWidth={3} />
                    </span>
                    <span className="mt-2 text-[8px] font-semibold uppercase tracking-[0.2em] text-white/55">
                      {done.type} · saved
                    </span>
                    <span className="mt-0.5 text-[18px] font-bold leading-none tabular-nums text-white">
                      {done.duration}
                    </span>
                  </div>
                ) : !running ? (
                  <div className="relative flex flex-col items-center text-white">
                    <TypeMeta.icon
                      className="h-8 w-8"
                      strokeWidth={1.5}
                      style={{ color: TypeMeta.tint }}
                    />
                    <span className="mt-1.5 text-[8px] font-semibold uppercase tracking-[0.2em] text-white/55">
                      {watchType} watch
                    </span>
                    <span className="mt-1 text-[20px] font-bold tabular-nums text-white">
                      00:00
                    </span>
                  </div>
                ) : (
                  <div className="relative flex flex-col items-center text-white">
                    <span
                      className="flex items-center gap-1 text-[8px] font-semibold uppercase tracking-[0.2em]"
                      style={{ color: TypeMeta.tint }}
                    >
                      <span
                        className="inline-block h-1 w-1 rounded-full"
                        style={{ backgroundColor: TypeMeta.tint }}
                      />
                      {watchType} · live
                    </span>
                    <span className="mt-0.5 text-[26px] font-bold leading-none tabular-nums text-white">
                      {formatted}
                    </span>
                    <span className="mt-1 flex items-center gap-2 text-[8px] uppercase tracking-[0.18em] text-white/55">
                      <span>HDG {String(headingDeg).padStart(3, '0')}°</span>
                      <span className="opacity-40">·</span>
                      <span>
                        {logs} {logs === 1 ? 'log' : 'logs'}
                      </span>
                    </span>
                  </div>
                )}
              </div>

              {/* CTA button row */}
              <div className="absolute inset-x-3 bottom-3">
                {done ? (
                  <div
                    className="flex h-9 w-full items-center justify-center gap-1.5 rounded-full text-[10px] font-semibold uppercase tracking-wider"
                    style={{
                      background:
                        'linear-gradient(135deg, rgba(74,222,128,0.18) 0%, rgba(22,163,74,0.32) 100%)',
                      color: '#86efac',
                      border: '1px solid rgba(74,222,128,0.4)',
                    }}
                  >
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                    Saved to sea time
                  </div>
                ) : !running ? (
                  <button
                    type="button"
                    onClick={onStart}
                    className="h-9 w-full rounded-full text-[11px] font-bold uppercase tracking-wider text-white shadow-md transition active:scale-[0.97]"
                    style={{
                      background:
                        'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
                      boxShadow:
                        '0 6px 18px -6px rgba(22,163,74,0.6), inset 0 1px 0 rgba(255,255,255,0.1)',
                    }}
                  >
                    Start watch
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={onAddNote}
                      className="flex h-9 flex-1 items-center justify-center gap-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition active:scale-[0.97]"
                      style={{
                        background:
                          'linear-gradient(135deg, rgba(56,189,248,0.18) 0%, rgba(56,189,248,0.32) 100%)',
                        color: '#7dd3fc',
                        border: '1px solid rgba(56,189,248,0.4)',
                      }}
                    >
                      <BookOpen className="h-3 w-3" strokeWidth={2.5} />
                      Note
                    </button>
                    <button
                      type="button"
                      onClick={onEnd}
                      className="flex h-9 flex-1 items-center justify-center rounded-full text-[10px] font-bold uppercase tracking-wider transition active:scale-[0.97]"
                      style={{
                        background:
                          'linear-gradient(135deg, rgba(239,68,68,0.18) 0%, rgba(127,29,29,0.45) 100%)',
                        color: '#fca5a5',
                        border: '1px solid rgba(239,68,68,0.4)',
                      }}
                    >
                      End
                    </button>
                  </div>
                )}
              </div>
                </>
              )}
            </div>
          </div>

          {/* Strap hints (top + bottom subtle bands) */}
          <div
            aria-hidden
            className="absolute left-1/2 -top-6 -translate-x-1/2 rounded-t-[2rem]"
            style={{
              width: 156,
              height: 24,
              background:
                'linear-gradient(180deg, color-mix(in srgb, var(--wk-text-muted) 30%, transparent) 0%, color-mix(in srgb, var(--wk-text-muted) 12%, transparent) 100%)',
              opacity: 0.4,
            }}
          />
          <div
            aria-hidden
            className="absolute left-1/2 -bottom-6 -translate-x-1/2 rounded-b-[2rem]"
            style={{
              width: 156,
              height: 24,
              background:
                'linear-gradient(180deg, color-mix(in srgb, var(--wk-text-muted) 12%, transparent) 0%, color-mix(in srgb, var(--wk-text-muted) 30%, transparent) 100%)',
              opacity: 0.4,
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Watch weather page (cloud cover, sea state, temperature, humidity, wind)
// ---------------------------------------------------------------------------

function WatchWeatherPage({
  cloudPct,
  tempC,
  humidityPct,
  windKn,
  seaSwellM,
  seaState,
}: {
  cloudPct: number;
  tempC: number;
  humidityPct: number;
  windKn: number;
  seaSwellM: number;
  seaState: { label: string; tone: string };
}) {
  return (
    <div className="relative px-3 pb-3 pt-2">
      {/* Location row */}
      <div className="flex items-center justify-between px-1">
        <div className="min-w-0">
          <p className="text-[7.5px] uppercase tracking-[0.18em] text-white/40">
            Conditions
          </p>
          <p className="truncate text-[10px] font-semibold text-white/90">
            Palma · 39.5° N
          </p>
        </div>
        <span
          className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider"
          style={{
            backgroundColor: `color-mix(in srgb, ${seaState.tone} 20%, transparent)`,
            color: seaState.tone,
            border: `1px solid color-mix(in srgb, ${seaState.tone} 45%, transparent)`,
          }}
        >
          <Waves className="h-2.5 w-2.5" strokeWidth={2.5} />
          {seaState.label}
        </span>
      </div>

      {/* 2 x 2 stat grid */}
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <WeatherTile
          icon={Cloud}
          label="Cloud"
          value={`${cloudPct}%`}
          tint="#7dd3fc"
        />
        <WeatherTile
          icon={Waves}
          label="Sea state"
          value={`${seaSwellM.toFixed(1)} m`}
          tint={seaState.tone}
        />
        <WeatherTile
          icon={Thermometer}
          label="Temp"
          value={`${tempC}°C`}
          tint="#fbbf24"
        />
        <WeatherTile
          icon={Droplets}
          label="Humidity"
          value={`${humidityPct}%`}
          tint="#a5b4fc"
        />
      </div>

      {/* Wind footer */}
      <div
        className="mt-2 flex items-center justify-between rounded-lg px-2 py-1.5"
        style={{
          backgroundColor: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <span className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-white/55">
          <Wind className="h-2.5 w-2.5" />
          Wind
        </span>
        <span className="text-[10px] font-bold tabular-nums text-white">
          {windKn} kn <span className="font-normal text-white/45">SW</span>
        </span>
      </div>
    </div>
  );
}

function WeatherTile({
  icon: Icon,
  label,
  value,
  tint,
}: {
  icon: IconType;
  label: string;
  value: string;
  tint: string;
}) {
  return (
    <div
      className="rounded-lg px-2 py-1.5"
      style={{
        background:
          'linear-gradient(160deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <div className="flex items-center gap-1">
        <span
          className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-md"
          style={{
            backgroundColor: `color-mix(in srgb, ${tint} 22%, transparent)`,
            color: tint,
          }}
        >
          <Icon className="h-2.5 w-2.5" strokeWidth={2.5} />
        </span>
        <span className="text-[7.5px] font-semibold uppercase tracking-wider text-white/45">
          {label}
        </span>
      </div>
      <div className="mt-1 text-[14px] font-bold leading-none tabular-nums text-white">
        {value}
      </div>
    </div>
  );
}

function FloatingChip({
  icon: Icon,
  label,
  tone,
  className,
}: {
  icon: IconType;
  label: string;
  tone: 'accent' | 'good' | 'warn';
  className?: string;
}) {
  const toneStyles =
    tone === 'good'
      ? {
          color: 'var(--wk-good)',
          backgroundColor: 'var(--wk-good-soft)',
          borderColor: 'color-mix(in srgb, var(--wk-good) 35%, transparent)',
        }
      : tone === 'warn'
      ? {
          color: 'var(--wk-warm)',
          backgroundColor: 'var(--wk-warm-soft)',
          borderColor: 'color-mix(in srgb, var(--wk-warm) 35%, transparent)',
        }
      : {
          color: 'var(--wk-accent)',
          backgroundColor: 'var(--wk-accent-soft)',
          borderColor: 'var(--wk-accent-ring)',
        };

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold shadow-sm backdrop-blur',
        className,
      )}
      style={{
        ...toneStyles,
        border: `1px solid ${toneStyles.borderColor}`,
      }}
    >
      <Icon className="h-3 w-3" />
      {label}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 8: AIS Import
// ---------------------------------------------------------------------------

function AISImport() {
  const features: Array<{ icon: IconType; label: string; accent: string }> = [
    { icon: Route,      label: 'Past Passages',    accent: '#0ea5e9' },
    { icon: Navigation, label: 'Vessel States',    accent: '#8b5cf6' },
    { icon: Zap,        label: 'Instant Import',    accent: '#d97706' },
    { icon: Ship,       label: 'Complete History', accent: '#10b981' },
  ];

  return (
    <section className="wk-section-alt py-24 sm:py-32">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2">
          <div>
            <Eyebrow icon={Database} accent>
              For Vessel Owners
            </Eyebrow>
            <h2
              className="font-headline mt-5 text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl"
              style={{ color: 'var(--wk-text)' }}
            >
              Import Past Vessel Data from{' '}
              <span className="wk-gradient-text wk-gradient-text--sky">AIS</span>
            </h2>
            <p className="mt-4 text-lg" style={{ color: 'var(--wk-text-soft)' }}>
              Automatically import your vessel&apos;s complete operational
              history including past passages and vessel states since launch.
              Backfill years of data instantly — no manual entry required.
            </p>

            <div
              className="mt-6 rounded-xl p-4"
              style={{
                backgroundColor: 'var(--wk-card)',
                border: '1px solid var(--wk-accent-ring)',
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wrench className="h-4 w-4" style={{ color: 'var(--wk-accent)' }} />
                  <span className="text-sm font-semibold" style={{ color: 'var(--wk-text)' }}>
                    In Development
                  </span>
                </div>
                <span className="text-sm font-bold" style={{ color: 'var(--wk-accent)' }}>
                  32%
                </span>
              </div>
              <div
                className="mt-3 h-2 w-full overflow-hidden rounded-full"
                style={{ backgroundColor: 'var(--wk-bg-subtle)' }}
              >
                <motion.div
                  initial={{ width: 0 }}
                  whileInView={{ width: '32%' }}
                  viewport={{ once: true }}
                  transition={{ duration: 1.5, delay: 0.3, ease: 'easeOut' }}
                  className="h-full rounded-full"
                  style={{
                    background: 'linear-gradient(90deg, var(--wk-accent) 0%, var(--wk-accent-strong) 100%)',
                  }}
                />
              </div>
              <p className="mt-2 text-xs" style={{ color: 'var(--wk-text-muted)' }}>
                This feature is currently in development.
              </p>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              {features.map((f) => (
                <div
                  key={f.label}
                  className="flex items-center gap-3 rounded-lg p-3"
                  style={{ backgroundColor: 'var(--wk-card)', border: '1px solid var(--wk-line)' }}
                >
                  <span
                    className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg"
                    style={{
                      backgroundColor: 'color-mix(in srgb, ' + f.accent + ' 14%, transparent)',
                      color: f.accent,
                    }}
                  >
                    <f.icon className="h-4 w-4" />
                  </span>
                  <span className="text-sm font-medium" style={{ color: 'var(--wk-text)' }}>
                    {f.label}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <PrimaryCta href="/for-vessels" tone="sky">Learn More</PrimaryCta>
              <SecondaryCta href="/signup/vessel">Get Started</SecondaryCta>
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, x: 24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.5 }}
            className="rounded-2xl p-6"
            style={{
              backgroundColor: 'var(--wk-card)',
              border: '1px solid var(--wk-line)',
              boxShadow: 'var(--wk-shadow-md)',
            }}
          >
            <div className="grid grid-cols-2 gap-4">
              <div
                className="rounded-lg p-4"
                style={{ backgroundColor: 'var(--wk-bg-subtle)', border: '1px solid var(--wk-line)' }}
              >
                <div className="flex items-center gap-2">
                  <Route className="h-4 w-4" style={{ color: 'var(--wk-accent)' }} />
                  <span className="text-xs font-semibold" style={{ color: 'var(--wk-text-muted)' }}>
                    Passages
                  </span>
                </div>
                <div className="mt-2 text-2xl font-bold" style={{ color: 'var(--wk-text)' }}>
                  1,247
                </div>
                <div className="mt-0.5 text-xs" style={{ color: 'var(--wk-good)' }}>
                  ✓ Imported
                </div>
              </div>
              <div
                className="rounded-lg p-4"
                style={{ backgroundColor: 'var(--wk-bg-subtle)', border: '1px solid var(--wk-line)' }}
              >
                <div className="flex items-center gap-2">
                  <Navigation className="h-4 w-4" style={{ color: '#8b5cf6' }} />
                  <span className="text-xs font-semibold" style={{ color: 'var(--wk-text-muted)' }}>
                    States
                  </span>
                </div>
                <div className="mt-2 text-2xl font-bold" style={{ color: 'var(--wk-text)' }}>
                  3,652
                </div>
                <div className="mt-0.5 text-xs" style={{ color: 'var(--wk-good)' }}>
                  ✓ Imported
                </div>
              </div>
            </div>

            <div
              className="mt-4 overflow-hidden rounded-lg"
              style={{ border: '1px solid var(--wk-line)' }}
            >
              <div
                className="px-3 py-2"
                style={{ backgroundColor: 'var(--wk-bg-subtle)', borderBottom: '1px solid var(--wk-line)' }}
              >
                <span className="text-xs font-semibold" style={{ color: 'var(--wk-text-muted)' }}>
                  Recent Passages
                </span>
              </div>
              <div className="space-y-2 p-3 text-xs">
                {[
                  { from: 'Monaco',      to: 'Porto Cervo', date: 'Jan 15' },
                  { from: 'Porto Cervo', to: 'Palma',       date: 'Jan 20' },
                ].map((p) => (
                  <div key={p.from + p.to} className="flex items-center justify-between">
                    <span style={{ color: 'var(--wk-text)' }}>
                      {p.from} → {p.to}
                    </span>
                    <span style={{ color: 'var(--wk-text-muted)' }}>{p.date}</span>
                  </div>
                ))}
              </div>
            </div>

            <div
              className="mt-4 border-t pt-4"
              style={{ borderColor: 'var(--wk-line)' }}
            >
              <div className="flex items-center gap-2">
                <Download className="h-4 w-4 animate-pulse" style={{ color: 'var(--wk-accent)' }} />
                <span className="text-xs font-semibold" style={{ color: 'var(--wk-text)' }}>
                  Import in Progress
                </span>
              </div>
              <div
                className="mt-2 h-2 w-full overflow-hidden rounded-full"
                style={{ backgroundColor: 'var(--wk-bg-subtle)' }}
              >
                <motion.div
                  initial={{ width: 0 }}
                  whileInView={{ width: '75%' }}
                  viewport={{ once: true }}
                  transition={{ duration: 2, delay: 0.5 }}
                  className="h-full rounded-full"
                  style={{
                    background: 'linear-gradient(90deg, #8b5cf6 0%, var(--wk-accent) 100%)',
                  }}
                />
              </div>
              <div className="mt-1 text-xs" style={{ color: 'var(--wk-text-muted)' }}>
                75% Complete
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Section 9: Verification Portal
// ---------------------------------------------------------------------------

function VerificationPortal() {
  const code = ['9', '8', '2', 'F', '8', '4', '8', '4'];
  const features: Array<{ icon: IconType; text: string }> = [
    { icon: CheckCircle2, text: 'Instant verification results' },
    { icon: FileCheck,    text: 'Official record validation'   },
    { icon: Zap,          text: 'No account required'          },
    { icon: Shield,       text: 'Secure & tamper-proof'        },
  ];

  return (
    <section className="py-24 sm:py-32" style={{ backgroundColor: 'var(--wk-bg)' }}>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2">
          <div>
            <Eyebrow icon={Shield} accent>
              Public Verification
            </Eyebrow>
            <h2
              className="font-headline mt-5 text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl"
              style={{ color: 'var(--wk-text)' }}
            >
              Verify Testimonials &amp; Sea Service{' '}
              <span className="wk-gradient-text wk-gradient-text--emerald">with a Unique Code</span> — Instantly
            </h2>
            <p className="mt-4 text-lg" style={{ color: 'var(--wk-text-soft)' }}>
              Officials, employers, and maritime authorities can instantly
              verify the authenticity of any SeaJourney testimonial or sea
              service record using our secure verification system. No login
              required.
            </p>

            <ul className="mt-7 space-y-3">
              {features.map((f) => (
                <li key={f.text} className="flex items-center gap-3">
                  <span
                    className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg"
                    style={{ backgroundColor: 'var(--wk-good-soft)', color: 'var(--wk-good)' }}
                  >
                    <f.icon className="h-5 w-5" />
                  </span>
                  <span className="text-base" style={{ color: 'var(--wk-text)' }}>
                    {f.text}
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <PrimaryCta href="/verify" tone="emerald">
                <Search className="h-4 w-4 shrink-0" />
                Verify a Record
              </PrimaryCta>
              <SecondaryCta href="/how-verification-works">Learn More</SecondaryCta>
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, x: 24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.5 }}
            className="rounded-2xl p-8"
            style={{
              backgroundColor: 'var(--wk-card)',
              border: '1px solid var(--wk-accent-ring)',
              boxShadow: 'var(--wk-shadow-md)',
            }}
          >
            <div className="flex items-center gap-3">
              <span
                className="inline-flex h-12 w-12 items-center justify-center rounded-xl"
                style={{ backgroundColor: 'var(--wk-good-soft)', color: 'var(--wk-good)' }}
              >
                <Shield className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-lg font-bold" style={{ color: 'var(--wk-text)' }}>
                  Verification System
                </h3>
                <p className="text-sm" style={{ color: 'var(--wk-text-muted)' }}>
                  Enter verification code
                </p>
              </div>
            </div>

            <div className="mt-6">
              <div className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--wk-text-muted)' }}>
                Document Verification Code
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1 sm:gap-2">
                <span className="text-xl font-bold" style={{ color: 'var(--wk-good)' }}>
                  SJ-
                </span>
                {code.map((ch, i) => (
                  <div
                    key={i}
                    className="flex h-12 w-9 items-center justify-center rounded-lg border-2 text-lg font-bold uppercase sm:h-14 sm:w-12"
                    style={{ borderColor: 'var(--wk-accent-ring)', color: 'var(--wk-text)' }}
                  >
                    {ch}
                  </div>
                ))}
              </div>
            </div>

            <div
              className="mt-6 flex items-center gap-3 rounded-xl p-4"
              style={{
                backgroundColor: 'var(--wk-good-soft)',
                border: '1px solid color-mix(in srgb, var(--wk-good) 30%, transparent)',
              }}
            >
              <CheckCircle2 className="h-6 w-6 flex-shrink-0" style={{ color: 'var(--wk-good)' }} />
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--wk-good)' }}>
                  Verified
                </p>
                <p className="text-xs" style={{ color: 'var(--wk-text-soft)' }}>
                  Record matches official testimonial approved by Captain.
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Section 10: Membership Summary
//   (MembershipCTA depends on Supabase/Stripe. We show a concise, themed
//    summary that links out to the existing /dashboard-offering page.)
// ---------------------------------------------------------------------------

type PlanSummary = {
  name: string;
  price: string;
  suffix: string;
  tagline: string;
  features: string[];
  accent: string;
  icon: IconType;
  highlight?: boolean;
};

const crewPlans: PlanSummary[] = [
  {
    name: 'Crew Standard', price: '£4.99', suffix: '/ month',
    tagline: 'Essential sea time tracking for maritime professionals.',
    features: ['Unlimited sea time logging', 'Up to 3 vessels', 'MCA compliant calculations', 'PDF testimonials', 'Direct digital sign-offs'],
    accent: '#0ea5e9', icon: Shield,
  },
  {
    name: 'Crew Premium', price: '£9.99', suffix: '/ month',
    tagline: 'Advanced logging and documentation for career progression.',
    features: ['All Crew Standard features', 'Unlimited vessels', 'Passage log book', 'Bridge watch log', 'Excel / CSV exports', 'Visa tracker'],
    accent: '#8b5cf6', icon: Zap, highlight: true,
  },
  {
    name: 'Crew Professional', price: '£14.99', suffix: '/ month',
    tagline: 'Complete maritime career management and certification tracking.',
    features: ['All Crew Premium features', 'Advanced analytics', 'GPS passage tracking', 'AIS auto vessel states', 'Direct MCA submissions'],
    accent: '#10b981', icon: TrendingUp,
  },
];

const vesselPlans: PlanSummary[] = [
  {
    name: 'Vessel Standard', price: '£35.99', suffix: '/ month',
    tagline: 'Essential vessel management for small operations.',
    features: ['Single vessel', 'Crew assignments', 'Vessel state tracking', 'Digital testimonial approvals'],
    accent: '#0ea5e9', icon: Shield,
  },
  {
    name: 'Vessel Premium', price: '£79.99', suffix: '/ month',
    tagline: 'Advanced vessel management for growing operations.',
    features: ['All Standard features', 'Advanced crew analytics', 'AI form builder', 'Priority support'],
    accent: '#8b5cf6', icon: Zap, highlight: true,
  },
  {
    name: 'Vessel Professional', price: '£139.99', suffix: '/ month',
    tagline: 'Complete vessel management solution.',
    features: ['Multiple role assignments', 'All Premium features', 'Generate crew documents', 'End-to-end sign-off cycle: vessel → captain → crew', 'Free crew accounts while actively tracking this vessel'],
    accent: '#10b981', icon: TrendingUp,
  },
];

function Membership() {
  const [tab, setTab] = useState<'crew' | 'vessel'>('crew');
  const plans = tab === 'crew' ? crewPlans : vesselPlans;

  return (
    <section id="membership" className="wk-section-alt py-24 sm:py-32">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <Eyebrow icon={Star} accent>
            Become a Member
          </Eyebrow>
          <h2
            className="font-headline mt-5 text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl"
            style={{ color: 'var(--wk-text)' }}
          >
            Choose the perfect plan for your{' '}
            <span className="wk-gradient-text wk-gradient-text--violet">maritime career</span>.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg" style={{ color: 'var(--wk-text-soft)' }}>
            Crew plans come with a free trial at checkout. Vessel plans come with an extended trial. Cancel anytime.
          </p>
        </div>

        <div className="mt-8 flex justify-center">
          <div
            className="inline-flex items-center gap-1 rounded-full p-1"
            style={{ backgroundColor: 'var(--wk-card)', border: '1px solid var(--wk-line)' }}
          >
            {[
              { id: 'crew' as const,    label: 'Crew Plans',   icon: User },
              { id: 'vessel' as const,  label: 'Vessel Plans', icon: Ship },
            ].map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className="inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors"
                  style={{
                    backgroundColor: active ? 'var(--wk-accent-soft)' : 'transparent',
                    color: active ? 'var(--wk-accent)' : 'var(--wk-text-soft)',
                    border: active ? '1px solid var(--wk-accent-ring)' : '1px solid transparent',
                  }}
                >
                  <t.icon className="h-4 w-4" />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mx-auto mt-12 grid max-w-6xl items-stretch gap-5 md:grid-cols-3">
          {plans.map((p, i) => (
            <motion.div
              key={p.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.4, delay: i * 0.06 }}
              onMouseMove={(e) => {
                const t = e.currentTarget as HTMLElement;
                const r = t.getBoundingClientRect();
                t.style.setProperty('--wk-mx', `${e.clientX - r.left}px`);
                t.style.setProperty('--wk-my', `${e.clientY - r.top}px`);
              }}
              className={cn(
                'wk-card-hover wk-card-accent-top relative flex flex-col rounded-2xl p-6',
                p.highlight && 'wk-ring-glow md:-translate-y-2',
              )}
              style={{
                backgroundColor: 'var(--wk-card)',
                border: `1px solid ${p.highlight ? 'transparent' : 'var(--wk-line)'}`,
                boxShadow: p.highlight ? 'var(--wk-shadow-lg)' : 'var(--wk-shadow-sm)',
                ['--wk-card-accent' as string]: p.accent,
                ['--wk-card-glow' as string]: p.accent,
              } as React.CSSProperties}
            >
              {p.highlight && (
                <span
                  className="absolute right-5 top-5 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                  style={{ backgroundColor: 'var(--wk-accent-soft)', color: 'var(--wk-accent)' }}
                >
                  <Star className="h-3 w-3 fill-current" />
                  Most Popular
                </span>
              )}

              <div className="flex items-center gap-3">
                <span
                  className="inline-flex h-11 w-11 items-center justify-center rounded-xl"
                  style={{
                    backgroundColor: 'color-mix(in srgb, ' + p.accent + ' 14%, transparent)',
                    color: p.accent,
                  }}
                >
                  <p.icon className="h-5 w-5" />
                </span>
                <h3 className="font-headline text-xl font-bold" style={{ color: 'var(--wk-text)' }}>
                  {p.name}
                </h3>
              </div>

              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-4xl font-bold tracking-tight" style={{ color: 'var(--wk-text)' }}>
                  {p.price}
                </span>
                <span className="text-sm font-semibold" style={{ color: 'var(--wk-text-muted)' }}>
                  {p.suffix}
                </span>
              </div>

              <p className="mt-3 text-sm" style={{ color: 'var(--wk-text-soft)' }}>
                {p.tagline}
              </p>

              <ul
                className="mt-5 space-y-2.5 border-t pt-5 text-sm"
                style={{ borderColor: 'var(--wk-line)' }}
              >
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5">
                    <span
                      className="mt-0.5 inline-flex h-4.5 w-4.5 flex-shrink-0 items-center justify-center rounded-full"
                      style={{
                        backgroundColor: 'color-mix(in srgb, ' + p.accent + ' 14%, transparent)',
                        color: p.accent,
                        width: '1.125rem',
                        height: '1.125rem',
                      }}
                    >
                      <Check className="h-3 w-3" />
                    </span>
                    <span style={{ color: 'var(--wk-text)' }}>{f}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-auto pt-6">
                <Link
                  href="/dashboard-offering"
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold"
                  style={{
                    background: p.highlight
                      ? 'linear-gradient(135deg, var(--wk-accent) 0%, var(--wk-accent-strong) 100%)'
                      : 'var(--wk-bg-subtle)',
                    color: p.highlight ? '#fff' : 'var(--wk-text)',
                    border: p.highlight ? 'none' : '1px solid var(--wk-line)',
                    boxShadow: p.highlight ? 'var(--wk-glow)' : 'none',
                  }}
                >
                  Get Started
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </motion.div>
          ))}
        </div>

        <div className="mt-10 flex justify-center">
          <span
            className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium"
            style={{
              backgroundColor: 'var(--wk-accent-soft)',
              color: 'var(--wk-accent)',
              border: '1px solid var(--wk-accent-ring)',
            }}
          >
            <Shield className="h-4 w-4" />
            Cancel anytime — flexible billing.
          </span>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Section 11: Android Beta
// ---------------------------------------------------------------------------

function AndroidBeta() {
  return (
    <section className="py-20 sm:py-24" style={{ backgroundColor: 'var(--wk-bg)' }}>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div
          className="mx-auto max-w-4xl overflow-hidden rounded-3xl p-10 text-center sm:p-14"
          style={{
            backgroundColor: 'var(--wk-card)',
            border: '1px solid var(--wk-line)',
            boxShadow: 'var(--wk-shadow-md)',
          }}
        >
          <span
            className="inline-flex h-14 w-14 items-center justify-center rounded-2xl"
            style={{ backgroundColor: 'color-mix(in srgb, #3DDC84 14%, transparent)', color: '#3DDC84' }}
          >
            <Smartphone className="h-7 w-7" />
          </span>
          <h2
            className="font-headline mt-5 text-3xl font-bold tracking-tight sm:text-4xl"
            style={{ color: 'var(--wk-text)' }}
          >
            Be the First to Test on{' '}
            <span style={{ color: '#3DDC84' }}>Android</span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg" style={{ color: 'var(--wk-text-soft)' }}>
            The Android version of SeaJourney is coming soon. Sign up to become
            a beta tester and get early access.
          </p>

          <div className="mt-8 flex justify-center">
            <Link
              href="https://play.google.com/apps/internaltest/4701575652585709401"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-12 items-center gap-2 rounded-xl px-6 text-base font-semibold text-white shadow-lg"
              style={{ backgroundColor: '#3DDC84' }}
            >
              Download Beta App
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Final CTA (shared with new design)
// ---------------------------------------------------------------------------

function FinalCTA() {
  return (
    <section className="wk-section-alt relative overflow-hidden py-24 sm:py-32">
      <div
        className="pointer-events-none absolute inset-0 -z-0"
        style={{
          background:
            'radial-gradient(60% 60% at 50% 30%, var(--wk-accent-soft) 0%, transparent 70%)',
        }}
      />
      <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <Eyebrow icon={Star} accent>
            Ready when you are
          </Eyebrow>
          <h2
            className="font-headline mt-6 text-3xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl"
            style={{ color: 'var(--wk-text)' }}
          >
            Ready to take your career{' '}
            <span className="wk-gradient-text wk-underline-sweep">to the next rank</span>?
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-lg" style={{ color: 'var(--wk-text-soft)' }}>
            Stop wasting weekends on paperwork. Let SeaJourney handle the
            logging, the forms, and the certification math — while you focus on
            running the boat.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <PrimaryCta href="/signup">Start Free Trial</PrimaryCta>
            <SecondaryCta href="mailto:hello@seajourneyapp.com?subject=Book%20a%20demo">
              Book a Demo
            </SecondaryCta>
          </div>

          <p className="mt-5 text-xs" style={{ color: 'var(--wk-text-muted)' }}>
            No card required · Works on every vessel · iOS + web portal
          </p>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------

function WkFooter() {
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
            <p className="mt-4 text-sm" style={{ color: 'var(--wk-text-soft)' }}>
              SeaJourney is the essential app for yacht crew and maritime
              professionals — log sea time, track certificates, and submit
              career paperwork without the spreadsheet.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-20 sm:gap-32 md:ml-auto">
            <FooterCol
              title="Product"
              links={[
                { href: '/how-to-use', label: 'How it works' },
                { href: '/for-vessels', label: 'For vessels' },
                { href: '/roadmap', label: 'Roadmap' },
                { href: '/verify', label: 'Verify records' },
              ]}
            />
            <FooterCol
              title="Company"
              links={[
                { href: '/faq', label: 'FAQ' },
                { href: '/privacy-policy', label: 'Privacy' },
                { href: '/terms-of-service', label: 'Terms' },
                { href: '/cookie-policy', label: 'Cookies' },
              ]}
            />
          </div>
        </div>

        <div
          className="mt-12 border-t pt-6 text-xs"
          style={{ borderColor: 'var(--wk-line)', color: 'var(--wk-text-muted)' }}
        >
          <p>&copy; {new Date().getFullYear()} SeaJourney. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({
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

// ---------------------------------------------------------------------------
// Shared: buttons, chips, eyebrow, theme toggle
// ---------------------------------------------------------------------------

type CtaTone = 'default' | 'violet' | 'emerald' | 'amber' | 'rose' | 'sky' | 'sunrise';

const ctaToneStyles: Record<CtaTone, { gradient: string; glow: string }> = {
  default: {
    gradient: 'linear-gradient(135deg, var(--wk-accent) 0%, var(--wk-accent-2) 100%)',
    glow: 'var(--wk-glow)',
  },
  violet: {
    gradient: 'linear-gradient(135deg, #a78bfa 0%, #6366f1 100%)',
    glow: '0 14px 28px -10px rgba(139, 92, 246, 0.55)',
  },
  emerald: {
    gradient: 'linear-gradient(135deg, #34d399 0%, #14b8a6 100%)',
    glow: '0 14px 28px -10px rgba(16, 185, 129, 0.55)',
  },
  amber: {
    gradient: 'linear-gradient(135deg, #fbbf24 0%, #f97316 100%)',
    glow: '0 14px 28px -10px rgba(245, 158, 11, 0.55)',
  },
  rose: {
    gradient: 'linear-gradient(135deg, #fb7185 0%, #ec4899 100%)',
    glow: '0 14px 28px -10px rgba(236, 72, 153, 0.55)',
  },
  sky: {
    gradient: 'linear-gradient(135deg, #38bdf8 0%, #6366f1 100%)',
    glow: '0 14px 28px -10px rgba(56, 189, 248, 0.55)',
  },
  sunrise: {
    gradient: 'linear-gradient(135deg, #f59e0b 0%, #f43f5e 100%)',
    glow: '0 14px 28px -10px rgba(244, 63, 94, 0.55)',
  },
};

function PrimaryCta({
  href,
  children,
  external,
  tone = 'default',
}: {
  href: string;
  children: React.ReactNode;
  external?: boolean;
  tone?: CtaTone;
}) {
  const t = ctaToneStyles[tone];
  return (
    <Link
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      className="wk-btn-sheen inline-flex h-12 items-center gap-2 whitespace-nowrap rounded-xl px-6 text-base font-semibold leading-none text-white"
      style={{
        background: t.gradient,
        boxShadow: t.glow,
      }}
    >
      <span className="inline-flex items-center gap-2 leading-none">{children}</span>
      <ArrowRight className="h-4 w-4 shrink-0" />
    </Link>
  );
}

function SecondaryCta({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="wk-btn-ghost inline-flex h-12 items-center gap-2 whitespace-nowrap rounded-xl border-2 px-6 text-base font-semibold leading-none"
      style={{
        borderColor: 'var(--wk-line-strong)',
        color: 'var(--wk-text)',
        backgroundColor: 'var(--wk-bg-raised)',
      }}
    >
      {children}
    </Link>
  );
}

function Chip({
  color,
  soft,
  children,
}: {
  color: string;
  soft: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{
        backgroundColor: soft,
        color,
        border: `1px solid color-mix(in srgb, ${color} 25%, transparent)`,
      }}
    >
      {children}
    </span>
  );
}

function ThemeToggle({
  mode,
  setMode,
}: {
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
}) {
  const cycle: Record<ThemeMode, ThemeMode> = {
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

function Eyebrow({
  icon: Icon,
  children,
  accent,
}: {
  icon: IconType;
  children: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-widest',
      )}
      style={{
        backgroundColor: accent ? 'var(--wk-accent-soft)' : 'var(--wk-bg-subtle)',
        color: accent ? 'var(--wk-accent)' : 'var(--wk-text-muted)',
        border: `1px solid ${accent ? 'var(--wk-accent-ring)' : 'var(--wk-line)'}`,
      }}
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </span>
  );
}
