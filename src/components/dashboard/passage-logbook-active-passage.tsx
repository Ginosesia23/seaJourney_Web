'use client';

import * as React from 'react';
import Link from 'next/link';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { Map as MapIcon, Navigation } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  cardinal,
  fmtDuration,
  formatDestination,
  validBearing,
} from '@/components/passages-map/active-passage-card';
import { resolveEndpointLabel } from '@/lib/passages-map/nearest-port';
import { cn } from '@/lib/utils';

/** Matches the map's live poll — samples only change on the AIS schedule. */
const POLL_MS = 5 * 60 * 1000;

type LivePosition = {
  lat: number;
  lon: number;
  speedKn: number | null;
  heading: number | null;
  course: number | null;
  state: string;
  destination: string | null;
  eta?: string | null;
  aisPositionAt: string | null;
  sampledAt: string;
  isStale: boolean;
};

type LiveVessel = {
  vesselId: string;
  vesselName: string;
  colorHex: string;
  live: LivePosition | null;
  activeTrack: GeoJSON.FeatureCollection | null;
};

type ActivePassage = {
  vesselId: string;
  vesselName: string;
  colorHex: string;
  live: LivePosition;
  startTime: string | null;
  distanceNm: number | null;
  fromLabel: string | null;
};

function toActivePassages(vessels: LiveVessel[]): ActivePassage[] {
  const out: ActivePassage[] = [];
  for (const v of vessels) {
    if (!v.live || v.live.state !== 'underway') continue;
    const feat = v.activeTrack?.features?.[0];
    const props = (feat?.properties ?? {}) as { startTime?: string; distanceNm?: number };
    const coords =
      feat?.geometry?.type === 'LineString'
        ? (feat.geometry.coordinates as [number, number][])
        : null;
    const first = coords?.[0];
    out.push({
      vesselId: v.vesselId,
      vesselName: v.vesselName,
      colorHex: v.colorHex,
      live: v.live,
      startTime: typeof props.startTime === 'string' ? props.startTime : null,
      distanceNm: typeof props.distanceNm === 'number' ? props.distanceNm : null,
      fromLabel: first ? resolveEndpointLabel(first[1], first[0]) : null,
    });
  }
  return out;
}

function Compass({ bearing }: { bearing: number | null }) {
  const ticks = Array.from({ length: 24 }, (_, i) => i * 15);
  return (
    <svg viewBox="0 0 100 100" className="h-16 w-16 shrink-0" aria-hidden>
      <circle cx="50" cy="50" r="47" className="fill-muted/40 stroke-border" strokeWidth="1.5" />
      {ticks.map((t) => (
        <line
          key={t}
          x1="50"
          y1="5"
          x2="50"
          y2={t % 90 === 0 ? 13 : 9}
          transform={`rotate(${t} 50 50)`}
          className={t % 90 === 0 ? 'stroke-foreground/50' : 'stroke-muted-foreground/30'}
          strokeWidth={t % 90 === 0 ? 2 : 1.25}
        />
      ))}
      <text x="50" y="26" textAnchor="middle" className="fill-sky-600 text-[11px] font-semibold">
        N
      </text>
      {bearing != null ? (
        <g
          transform={`rotate(${bearing} 50 50)`}
          style={{ transition: 'transform 700ms cubic-bezier(0.22, 1, 0.36, 1)' }}
        >
          <path d="M50 18 L57 52 L50 46 L43 52 Z" className="fill-sky-600" />
          <path d="M50 82 L55 52 L50 56 L45 52 Z" className="fill-muted-foreground/30" />
        </g>
      ) : null}
      <circle cx="50" cy="50" r="3.5" className="fill-foreground/70" />
    </svg>
  );
}

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="min-w-0 px-3 py-2.5">
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate font-mono text-sm font-medium tabular-nums tracking-tight text-foreground">
        {value}
      </p>
      {sub ? <p className="truncate text-[11px] tabular-nums text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

function ActivePassageRow({ passage }: { passage: ActivePassage }) {
  const { live } = passage;
  const heading = validBearing(live.heading);
  const course = validBearing(live.course);
  const bearing = heading ?? course;
  const nowMs = Date.now();

  const departedMs = passage.startTime ? Date.parse(passage.startTime) : NaN;
  const lastFixMs = Date.parse(live.aisPositionAt ?? live.sampledAt);
  const movingMs =
    Number.isFinite(departedMs) && Number.isFinite(lastFixMs) ? lastFixMs - departedMs : null;
  const avgKn =
    passage.distanceNm != null && movingMs && movingMs > 10 * 60_000
      ? passage.distanceNm / (movingMs / 3_600_000)
      : null;
  const etaMs = live.eta ? Date.parse(live.eta) : NaN;
  const etaValid = Number.isFinite(etaMs) && etaMs > nowMs - 60 * 60_000;
  const destination = live.destination ? formatDestination(live.destination) : null;

  return (
    <div>
      <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
        <Compass bearing={bearing} />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="flex items-center gap-2 text-sm font-medium text-foreground">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: passage.colorHex }} />
            <span className="truncate">{passage.vesselName}</span>
          </p>
          <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground">
            <span className="text-foreground">{passage.fromLabel ?? 'Departure'}</span>
            <span aria-hidden>→</span>
            {destination ? (
              <span className="inline-flex items-center gap-1 text-foreground" title={live.destination ?? undefined}>
                <Navigation className="h-3 w-3 text-sky-600" />
                {destination}
              </span>
            ) : (
              <span className="italic">at sea</span>
            )}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {Number.isFinite(lastFixMs)
              ? `Last AIS fix ${formatDistanceToNowStrict(lastFixMs, { addSuffix: true })}`
              : 'No recent AIS fix'}
            {live.isStale ? ' · signal stale' : ''}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 divide-x divide-y divide-border border-t border-border sm:grid-cols-3 sm:divide-y-0 lg:grid-cols-6">
        <Stat
          label="Departed"
          value={Number.isFinite(departedMs) ? format(departedMs, 'EEE d MMM, HH:mm') : '—'}
          sub={Number.isFinite(departedMs) ? `${fmtDuration(nowMs - departedMs)} ago` : undefined}
        />
        <Stat label="Time underway" value={movingMs != null ? fmtDuration(movingMs) : '—'} />
        <Stat
          label="Distance"
          value={passage.distanceNm != null ? `${passage.distanceNm.toFixed(1)} NM` : '—'}
          sub="travelled so far"
        />
        <Stat
          label="Speed"
          value={live.speedKn != null ? `${live.speedKn.toFixed(1)} kn` : '—'}
          sub={avgKn != null ? `avg ${avgKn.toFixed(1)} kn` : undefined}
        />
        <Stat
          label={heading != null ? 'Heading' : 'Course'}
          value={bearing != null ? `${Math.round(bearing).toString().padStart(3, '0')}° ${cardinal(bearing)}` : '—'}
          sub={heading != null && course != null ? `COG ${Math.round(course).toString().padStart(3, '0')}°` : undefined}
        />
        <Stat
          label="ETA (AIS)"
          value={etaValid ? format(etaMs, 'EEE d MMM, HH:mm') : '—'}
          sub={
            etaValid
              ? etaMs > nowMs
                ? `in ${fmtDuration(etaMs - nowMs)}`
                : 'due now'
              : 'not transmitted'
          }
        />
      </div>
    </div>
  );
}

/**
 * In-progress passage(s) from cached AIS samples. Read-only — never
 * triggers a provider fetch. Renders nothing when no vessel is underway.
 */
export function PassageLogbookActivePassage({
  accessToken,
  className,
}: {
  accessToken: string | null | undefined;
  className?: string;
}) {
  const [passages, setPassages] = React.useState<ActivePassage[]>([]);
  const [, forceTick] = React.useReducer((n: number) => n + 1, 0);

  React.useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/passages-map/live', {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: 'no-store',
        });
        if (!res.ok) return;
        const json = (await res.json()) as { vessels?: LiveVessel[] };
        if (!cancelled) setPassages(toActivePassages(json.vessels ?? []));
      } catch {
        /* optional chrome */
      }
    };
    void load();
    const poll = window.setInterval(load, POLL_MS);
    const tick = window.setInterval(forceTick, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(poll);
      window.clearInterval(tick);
    };
  }, [accessToken]);

  if (passages.length === 0) return null;

  return (
    <section
      className={cn(
        'overflow-hidden rounded-md border border-emerald-500/30 bg-background',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-border bg-emerald-500/[0.06] px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <h2 className="text-xs font-medium text-foreground">
            {passages.length === 1 ? 'Active passage' : `${passages.length} active passages`}
          </h2>
          <span className="hidden text-[11px] text-muted-foreground sm:inline">
            · Live from AIS — import it into the log once it ends
          </span>
        </div>
        <Button type="button" variant="ghost" size="sm" className="h-7 rounded-[5px] px-2.5 text-xs" asChild>
          <Link href="/dashboard/passages-map">
            <MapIcon className="mr-1.5 h-3.5 w-3.5" />
            View on map
          </Link>
        </Button>
      </div>
      <div className="divide-y divide-border">
        {passages.map((p) => (
          <ActivePassageRow key={p.vesselId} passage={p} />
        ))}
      </div>
    </section>
  );
}
