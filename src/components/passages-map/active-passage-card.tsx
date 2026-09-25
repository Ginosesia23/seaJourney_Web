'use client';

import * as React from 'react';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { ChevronDown, ChevronUp, Navigation } from 'lucide-react';

import { cn } from '@/lib/utils';

export type ActivePassageCardData = {
  vesselName: string;
  colorHex: string;
  live: {
    speedKn: number | null;
    heading: number | null;
    course: number | null;
    destination?: string | null;
    eta?: string | null;
    aisPositionAt: string | null;
    sampledAt: string;
    isStale: boolean;
  };
  /** Active track feature properties (departure + distance so far). */
  track: {
    startTime: string;
    endTime: string;
    distanceNm: number;
  } | null;
};

const CARDINALS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

/** AIS uses 511 (heading) / 360 (course) for "not available". */
export function validBearing(v: number | null | undefined): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v >= 360) return null;
  return v;
}

export function cardinal(deg: number): string {
  return CARDINALS[Math.round(deg / 22.5) % 16]!;
}

export function fmtDuration(ms: number): string {
  const totalMin = Math.max(0, Math.round(ms / 60_000));
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/** "IT CAG>GIGIB" → "IT CAG → GI GIB" (UN/LOCODE-ish AIS destinations). */
export function formatDestination(raw: string): string {
  return raw
    .split(/\s*>\s*/)
    .map((part) => {
      const p = part.trim().toUpperCase();
      return /^[A-Z]{2}[A-Z0-9]{3}$/.test(p) ? `${p.slice(0, 2)} ${p.slice(2)}` : p;
    })
    .filter(Boolean)
    .join(' → ');
}

function Compass({ bearing }: { bearing: number | null }) {
  const ticks = Array.from({ length: 36 }, (_, i) => i * 10);
  return (
    <svg viewBox="0 0 100 100" className="h-[88px] w-[88px] shrink-0" aria-hidden>
      <circle cx="50" cy="50" r="47" fill="transparent" className="stroke-white/15" strokeWidth="1" />
      {ticks.map((t) => {
        const major = t % 90 === 0;
        const mid = t % 30 === 0;
        const len = major ? 7 : mid ? 5 : 3;
        return (
          <line
            key={t}
            x1="50"
            y1="4"
            x2="50"
            y2={4 + len}
            transform={`rotate(${t} 50 50)`}
            className={major ? 'stroke-white/60' : 'stroke-white/25'}
            strokeWidth={major ? 1.5 : 1}
          />
        );
      })}
      {(
        [
          ['N', 50, 20],
          ['E', 81, 53],
          ['S', 50, 86],
          ['W', 19, 53],
        ] as const
      ).map(([l, x, y]) => (
        <text
          key={l}
          x={x}
          y={y}
          textAnchor="middle"
          className={cn('text-[9px] font-semibold', l === 'N' ? 'fill-sky-400' : 'fill-white/50')}
        >
          {l}
        </text>
      ))}
      {bearing != null ? (
        <g
          transform={`rotate(${bearing} 50 50)`}
          style={{ transition: 'transform 700ms cubic-bezier(0.22, 1, 0.36, 1)' }}
        >
          <path d="M50 16 L57 52 L50 46 L43 52 Z" className="fill-sky-400" />
          <path d="M50 84 L55 52 L50 56 L45 52 Z" className="fill-white/25" />
        </g>
      ) : null}
      <circle cx="50" cy="50" r="3" className="fill-white/80" />
    </svg>
  );
}

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-[0.12em] text-white/45">{label}</p>
      <p className="truncate text-sm font-semibold tabular-nums tracking-tight text-white">{value}</p>
      {sub ? <p className="truncate text-[10px] tabular-nums text-white/45">{sub}</p> : null}
    </div>
  );
}

/** Bottom-left map card for a vessel's in-progress passage. */
export function ActivePassageCard({
  data,
  className,
}: {
  data: ActivePassageCardData;
  className?: string;
}) {
  const [collapsed, setCollapsed] = React.useState(false);
  const [, forceTick] = React.useReducer((n: number) => n + 1, 0);

  // Keep relative times ("2h 14m", "in 3h") fresh between live polls.
  React.useEffect(() => {
    const id = window.setInterval(forceTick, 60_000);
    return () => window.clearInterval(id);
  }, []);

  const { live, track } = data;
  const heading = validBearing(live.heading);
  const course = validBearing(live.course);
  const bearing = heading ?? course;
  const nowMs = Date.now();

  const departedMs = track ? Date.parse(track.startTime) : NaN;
  const lastFixMs = Date.parse(live.aisPositionAt ?? live.sampledAt);
  const elapsedMs = Number.isFinite(departedMs) ? nowMs - departedMs : null;
  const movingMs =
    Number.isFinite(departedMs) && Number.isFinite(lastFixMs) ? lastFixMs - departedMs : null;
  const avgKn =
    track && movingMs && movingMs > 10 * 60_000 ? track.distanceNm / (movingMs / 3_600_000) : null;

  const etaMs = live.eta ? Date.parse(live.eta) : NaN;
  const etaValid = Number.isFinite(etaMs) && etaMs > nowMs - 60 * 60_000;

  return (
    <div
      className={cn(
        'map-chrome-panel pointer-events-auto w-[min(300px,calc(100vw-1.5rem))] overflow-hidden rounded-2xl bg-slate-950/85 shadow-[0_12px_32px_-8px_rgba(0,0,0,0.55)] ring-1 ring-white/[0.06] backdrop-blur-xl',
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left hover:bg-white/5"
        aria-expanded={!collapsed}
      >
        <span className="relative flex h-2 w-2 shrink-0">
          {!live.isStale ? (
            <span
              className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
              style={{ backgroundColor: '#34d399' }}
            />
          ) : null}
          <span
            className="relative inline-flex h-2 w-2 rounded-full"
            style={{ backgroundColor: live.isStale ? '#fbbf24' : '#34d399' }}
          />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-[0.14em] text-white/45">
            {live.isStale ? 'Active passage · signal stale' : 'Active passage'}
          </p>
          <p className="flex items-center gap-1.5 truncate text-[13px] font-semibold tracking-tight text-white">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: data.colorHex }} />
            <span className="truncate">{data.vesselName}</span>
          </p>
        </div>
        {collapsed ? (
          <span className="flex items-center gap-1 text-xs tabular-nums text-white/70">
            {live.speedKn != null ? `${live.speedKn.toFixed(1)} kn` : null}
            <ChevronUp className="h-3.5 w-3.5" />
          </span>
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-white/50" />
        )}
      </button>

      {!collapsed ? (
        <div className="border-t border-white/[0.06] px-4 pb-3.5 pt-3">
          <div className="flex items-center gap-4">
            <Compass bearing={bearing} />
            <div className="grid flex-1 grid-cols-1 gap-2">
              <Stat
                label={heading != null ? 'Heading' : 'Course'}
                value={bearing != null ? `${Math.round(bearing).toString().padStart(3, '0')}° ${cardinal(bearing)}` : '—'}
                sub={heading != null && course != null ? `COG ${Math.round(course).toString().padStart(3, '0')}°` : undefined}
              />
              <Stat
                label="Speed"
                value={live.speedKn != null ? `${live.speedKn.toFixed(1)} kn` : '—'}
                sub={avgKn != null ? `avg ${avgKn.toFixed(1)} kn` : undefined}
              />
            </div>
          </div>

          {live.destination ? (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-white/[0.06] px-2.5 py-1.5">
              <Navigation className="h-3.5 w-3.5 shrink-0 text-sky-400" />
              <span className="truncate text-xs font-medium text-white" title={live.destination}>
                {formatDestination(live.destination)}
              </span>
            </div>
          ) : null}

          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5">
            <Stat
              label="Departed"
              value={Number.isFinite(departedMs) ? format(departedMs, 'EEE HH:mm') : '—'}
              sub={elapsedMs != null ? `${fmtDuration(elapsedMs)} ago` : undefined}
            />
            <Stat
              label="ETA (AIS)"
              value={etaValid ? format(etaMs, 'EEE d MMM HH:mm') : '—'}
              sub={
                etaValid
                  ? etaMs > nowMs
                    ? `in ${fmtDuration(etaMs - nowMs)}`
                    : 'due now'
                  : 'not transmitted'
              }
            />
            <Stat label="Distance" value={track ? `${track.distanceNm.toFixed(1)} NM` : '—'} sub="travelled" />
            <Stat
              label="Time underway"
              value={movingMs != null ? fmtDuration(movingMs) : '—'}
              sub={
                Number.isFinite(lastFixMs)
                  ? `fix ${formatDistanceToNowStrict(lastFixMs, { addSuffix: true })}`
                  : undefined
              }
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
