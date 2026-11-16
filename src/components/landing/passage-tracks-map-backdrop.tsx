'use client';

/**
 * Natural Earth world map + illustrative passage tracks for landing backdrops.
 *
 * Geometry is pre-baked in `src/data/passage-tracks-backdrop.ts` so we
 * never import world-atlas JSON at runtime (Turbopack HMR cannot hot-swap
 * those node_modules JSON modules).
 *
 * `variant="hero"` is quieter — faint continents, soft animated tracks,
 * stronger centre vignette so headline copy stays readable.
 */

import { PASSAGE_TRACKS_BACKDROP } from '@/data/passage-tracks-backdrop';

type PassageTracksMapBackdropProps = {
  variant?: 'default' | 'hero';
};

export function PassageTracksMapBackdrop({
  variant = 'default',
}: PassageTracksMapBackdropProps) {
  const { width, height, landPath, graticulePath, tracks, endpoints } =
    PASSAGE_TRACKS_BACKDROP;
  const isHero = variant === 'hero';
  const filterId = isHero ? 'pt-world-glow-hero' : 'pt-world-glow';

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div
        className="absolute inset-0"
        style={{
          background: isHero
            ? 'radial-gradient(70% 55% at 50% 42%, color-mix(in srgb, var(--wk-accent) 5%, transparent) 0%, transparent 72%)'
            : 'radial-gradient(70% 60% at 50% 45%, color-mix(in srgb, var(--wk-accent) 8%, transparent) 0%, transparent 70%)',
        }}
      />

      <svg
        className={
          isHero
            ? 'absolute inset-0 h-full w-full opacity-[0.22] sm:opacity-[0.26]'
            : 'absolute inset-0 h-full w-full opacity-[0.72]'
        }
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid slice"
        fill="none"
      >
        <defs>
          <filter id={filterId} x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation={isHero ? '2.8' : '1.8'} result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <path
          d={graticulePath}
          stroke="var(--wk-text-muted)"
          strokeOpacity={isHero ? '0.06' : '0.2'}
          strokeWidth="0.6"
        />

        <path
          d={landPath}
          fill={
            isHero
              ? 'color-mix(in srgb, var(--wk-text) 4%, transparent)'
              : 'color-mix(in srgb, var(--wk-text) 11%, transparent)'
          }
          stroke={
            isHero
              ? 'color-mix(in srgb, var(--wk-text) 9%, transparent)'
              : 'color-mix(in srgb, var(--wk-text) 26%, transparent)'
          }
          strokeWidth={isHero ? '0.55' : '0.8'}
        />

        <g filter={`url(#${filterId})`}>
          {tracks.map((t, i) => (
            <path
              key={t.id}
              d={t.d}
              stroke={t.color}
              strokeOpacity={isHero ? '0.22' : '0.8'}
              strokeWidth={isHero ? '1.1' : '1.9'}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="wk-passage-dash"
              style={{ animationDelay: `${i * 1.1}s` }}
            />
          ))}
        </g>

        {endpoints.map((p, i) => (
          <g key={i}>
            <circle
              cx={p.x}
              cy={p.y}
              r={isHero ? '3.5' : '5.5'}
              fill={p.color}
              fillOpacity={isHero ? '0.08' : '0.16'}
            />
            <circle
              cx={p.x}
              cy={p.y}
              r={isHero ? '1.6' : '2.4'}
              fill={p.color}
              fillOpacity={isHero ? '0.45' : '0.85'}
              stroke="var(--wk-bg)"
              strokeWidth="1.1"
            />
          </g>
        ))}

      </svg>

      <div
        className="absolute inset-0"
        style={{
          background: isHero
            ? [
                'radial-gradient(48% 40% at 50% 42%, color-mix(in srgb, var(--wk-bg) 88%, transparent) 0%, transparent 74%)',
                'linear-gradient(180deg, color-mix(in srgb, var(--wk-bg) 90%, transparent) 0%, transparent 24%, transparent 76%, color-mix(in srgb, var(--wk-bg) 92%, transparent) 100%)',
                'linear-gradient(90deg, color-mix(in srgb, var(--wk-bg) 72%, transparent) 0%, transparent 22%, transparent 78%, color-mix(in srgb, var(--wk-bg) 72%, transparent) 100%)',
              ].join(',')
            : [
                'radial-gradient(48% 40% at 50% 32%, color-mix(in srgb, var(--wk-bg) 64%, transparent) 0%, transparent 70%)',
                'linear-gradient(180deg, color-mix(in srgb, var(--wk-bg) 70%, transparent) 0%, transparent 18%, transparent 82%, color-mix(in srgb, var(--wk-bg) 72%, transparent) 100%)',
              ].join(','),
        }}
      />
    </div>
  );
}
