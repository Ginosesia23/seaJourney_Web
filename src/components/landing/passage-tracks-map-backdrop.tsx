'use client';

/**
 * Natural Earth world map + illustrative passage tracks for the landing
 * "passage tracks" section backdrop.
 *
 * Geometry is pre-baked in `src/data/passage-tracks-backdrop.ts` so we
 * never import world-atlas JSON at runtime (Turbopack HMR cannot hot-swap
 * those node_modules JSON modules).
 */

import { PASSAGE_TRACKS_BACKDROP } from '@/data/passage-tracks-backdrop';

export function PassageTracksMapBackdrop() {
  const { width, height, landPath, graticulePath, tracks, endpoints } =
    PASSAGE_TRACKS_BACKDROP;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(70% 60% at 50% 45%, color-mix(in srgb, var(--wk-accent) 8%, transparent) 0%, transparent 70%)',
        }}
      />

      <svg
        className="absolute inset-0 h-full w-full opacity-[0.72]"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid slice"
        fill="none"
      >
        <defs>
          <filter id="pt-world-glow" x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation="1.8" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <path
          d={graticulePath}
          stroke="var(--wk-text-muted)"
          strokeOpacity="0.2"
          strokeWidth="0.6"
        />

        {/* Continents — between “too subtle” and “too strong” */}
        <path
          d={landPath}
          fill="color-mix(in srgb, var(--wk-text) 11%, transparent)"
          stroke="color-mix(in srgb, var(--wk-text) 26%, transparent)"
          strokeWidth="0.8"
        />

        <g filter="url(#pt-world-glow)">
          {tracks.map((t, i) => (
            <path
              key={t.id}
              d={t.d}
              stroke={t.color}
              strokeOpacity="0.8"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="wk-passage-dash"
              style={{ animationDelay: `${i * 1.1}s` }}
            />
          ))}
        </g>

        {endpoints.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="5.5" fill={p.color} fillOpacity="0.16" />
            <circle
              cx={p.x}
              cy={p.y}
              r="2.4"
              fill={p.color}
              fillOpacity="0.85"
              stroke="var(--wk-bg)"
              strokeWidth="1.1"
            />
          </g>
        ))}
      </svg>

      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(48% 40% at 50% 32%, color-mix(in srgb, var(--wk-bg) 64%, transparent) 0%, transparent 70%),' +
            'linear-gradient(180deg, color-mix(in srgb, var(--wk-bg) 70%, transparent) 0%, transparent 18%, transparent 82%, color-mix(in srgb, var(--wk-bg) 72%, transparent) 100%)',
        }}
      />
    </div>
  );
}
