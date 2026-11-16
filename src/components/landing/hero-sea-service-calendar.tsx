'use client';

/**
 * Atmospheric hero backdrop: product-style month calendars with logged
 * sea-service days. Sits low behind the hero so the headline stays clear,
 * while the months still read as SeaJourney’s calendar.
 */

import { CALENDAR_DOW_LABELS } from '@/lib/calendar-chrome';

type DayKind = 'underway' | 'anchor' | 'port' | 'leave' | 'empty';

const KIND_STYLE: Record<
  Exclude<DayKind, 'empty'>,
  { fill: string; text: string }
> = {
  underway: { fill: '#1C4768', text: '#8CC9F8' },
  anchor: { fill: '#5C351D', text: '#F9A15A' },
  port: { fill: '#1D4436', text: '#7BC293' },
  leave: { fill: '#2A343C', text: '#B4BBBB' },
};

type MonthSpec = {
  label: string;
  startDow: number;
  daysInMonth: number;
  states: Record<number, Exclude<DayKind, 'empty'>>;
};

const MONTHS: MonthSpec[] = [
  {
    label: 'May',
    startDow: 4,
    daysInMonth: 31,
    states: {
      1: 'leave',
      2: 'leave',
      3: 'leave',
      4: 'leave',
      5: 'leave',
      6: 'port',
      7: 'port',
      8: 'port',
      9: 'port',
      10: 'port',
      11: 'anchor',
      12: 'port',
      13: 'port',
      14: 'underway',
      15: 'underway',
      16: 'underway',
      17: 'underway',
      18: 'underway',
      19: 'anchor',
      20: 'underway',
      21: 'underway',
      22: 'underway',
      23: 'underway',
      24: 'port',
      25: 'port',
      26: 'port',
      27: 'port',
      28: 'port',
      29: 'port',
      30: 'port',
      31: 'port',
    },
  },
  {
    label: 'Jun',
    startDow: 0,
    daysInMonth: 30,
    states: {
      1: 'underway',
      2: 'underway',
      3: 'underway',
      4: 'underway',
      5: 'underway',
      6: 'underway',
      7: 'anchor',
      8: 'underway',
      9: 'underway',
      10: 'underway',
      11: 'underway',
      12: 'underway',
      13: 'underway',
      14: 'underway',
      15: 'port',
      16: 'port',
      17: 'port',
      18: 'port',
      19: 'anchor',
      20: 'port',
      21: 'underway',
      22: 'underway',
      23: 'underway',
      24: 'underway',
      25: 'underway',
      26: 'underway',
      27: 'underway',
      28: 'underway',
      29: 'anchor',
      30: 'underway',
    },
  },
  {
    label: 'Jul',
    startDow: 2,
    daysInMonth: 31,
    states: {
      1: 'underway',
      2: 'underway',
      3: 'underway',
      4: 'underway',
      5: 'port',
      6: 'port',
      7: 'port',
      8: 'port',
      9: 'port',
      10: 'port',
      11: 'port',
      12: 'anchor',
      13: 'underway',
      14: 'underway',
      15: 'underway',
      16: 'underway',
      17: 'underway',
      18: 'underway',
      19: 'underway',
      20: 'underway',
      21: 'port',
      22: 'port',
      23: 'port',
      24: 'leave',
      25: 'leave',
      26: 'leave',
      27: 'leave',
      28: 'leave',
      29: 'leave',
      30: 'leave',
      31: 'leave',
    },
  },
];

const CELL = 30;
const GAP = 4;
const HEADER = 34;
const DOW_H = 16;
const PAD_X = 16;
const PAD_Y = 14;
const COLS = 7;
const ROWS = 6;
const MONTH_W = PAD_X * 2 + COLS * CELL + (COLS - 1) * GAP;
const MONTH_H = PAD_Y + HEADER + DOW_H + ROWS * CELL + (ROWS - 1) * GAP + PAD_Y;
const MONTH_GAP = 20;
const WIDTH = MONTHS.length * MONTH_W + (MONTHS.length - 1) * MONTH_GAP;
const HEIGHT = MONTH_H;

function MonthPanel({
  month,
  offsetX,
  highlightDay,
}: {
  month: MonthSpec;
  offsetX: number;
  highlightDay?: number;
}) {
  const cells: Array<{ day: number; kind: DayKind; col: number; row: number }> = [];
  for (let day = 1; day <= month.daysInMonth; day++) {
    const idx = month.startDow + day - 1;
    cells.push({
      day,
      kind: month.states[day] ?? 'empty',
      col: idx % 7,
      row: Math.floor(idx / 7),
    });
  }

  return (
    <g transform={`translate(${offsetX}, 0)`}>
      <rect
        x={0}
        y={0}
        width={MONTH_W}
        height={MONTH_H}
        rx={14}
        fill="color-mix(in srgb, var(--wk-card) 55%, transparent)"
        stroke="var(--wk-line-strong)"
        strokeOpacity="0.45"
      />

      <text
        x={PAD_X}
        y={PAD_Y + 16}
        fill="var(--wk-text)"
        fillOpacity="0.72"
        fontSize="14"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fontWeight="650"
      >
        {month.label}
      </text>

      {CALENDAR_DOW_LABELS.map((d, i) => (
        <text
          key={`${month.label}-dow-${i}`}
          x={PAD_X + i * (CELL + GAP) + CELL / 2}
          y={PAD_Y + HEADER}
          textAnchor="middle"
          fill="var(--wk-text-muted)"
          fillOpacity="0.65"
          fontSize="9"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          fontWeight="600"
        >
          {d}
        </text>
      ))}

      {cells.map(({ day, kind, col, row }) => {
        const x = PAD_X + col * (CELL + GAP);
        const y = PAD_Y + HEADER + DOW_H + row * (CELL + GAP);
        const style = kind === 'empty' ? null : KIND_STYLE[kind];
        const isHi = highlightDay === day;
        return (
          <g key={`${month.label}-${day}`}>
            <rect
              x={x}
              y={y}
              width={CELL}
              height={CELL}
              rx={8}
              fill={style ? style.fill : 'color-mix(in srgb, var(--wk-text) 5%, transparent)'}
              stroke={isHi ? 'var(--wk-accent)' : 'transparent'}
              strokeWidth={isHi ? 1.5 : 0}
              className={isHi ? 'wk-hero-cal-pulse' : undefined}
            />
            <text
              x={x + CELL / 2}
              y={y + CELL / 2 + 3.8}
              textAnchor="middle"
              fill={style ? style.text : 'var(--wk-text-muted)'}
              fillOpacity={style ? 0.95 : 0.4}
              fontSize="11"
              fontFamily="ui-sans-serif, system-ui, sans-serif"
              fontWeight="600"
            >
              {day}
            </text>
          </g>
        );
      })}
    </g>
  );
}

export function HeroSeaServiceCalendar() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <style>{`
        .wk-hero-cal-pulse {
          animation: wk-hero-cal-pulse 2.8s ease-in-out infinite;
        }
        @keyframes wk-hero-cal-pulse {
          0%, 100% { stroke-opacity: 0.4; }
          50% { stroke-opacity: 0.95; }
        }
        @media (prefers-reduced-motion: reduce) {
          .wk-hero-cal-pulse { animation: none; }
        }
      `}</style>

      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(70% 50% at 50% 30%, color-mix(in srgb, var(--wk-accent) 8%, transparent) 0%, transparent 65%)',
        }}
      />

      {/* Calendars sit in the lower half — product visual, not a mid-headline collision */}
      <div className="absolute inset-x-0 bottom-[6%] top-[42%] flex items-end justify-center sm:bottom-[8%] sm:top-[40%]">
        <svg
          className="h-full w-[min(150vw,1120px)] opacity-[0.55] sm:opacity-[0.62]"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="xMidYMid meet"
        >
          {MONTHS.map((month, i) => (
            <MonthPanel
              key={month.label}
              month={month}
              offsetX={i * (MONTH_W + MONTH_GAP)}
              highlightDay={i === 1 ? 26 : undefined}
            />
          ))}
        </svg>
      </div>

      {/* Fade calendars under the copy band; keep sides soft */}
      <div
        className="absolute inset-0"
        style={{
          background: [
            'linear-gradient(180deg, var(--wk-bg) 0%, color-mix(in srgb, var(--wk-bg) 92%, transparent) 28%, color-mix(in srgb, var(--wk-bg) 55%, transparent) 48%, transparent 68%)',
            'linear-gradient(90deg, color-mix(in srgb, var(--wk-bg) 88%, transparent) 0%, transparent 12%, transparent 88%, color-mix(in srgb, var(--wk-bg) 88%, transparent) 100%)',
            'linear-gradient(180deg, transparent 70%, color-mix(in srgb, var(--wk-bg) 55%, transparent) 88%, color-mix(in srgb, var(--wk-bg) 85%, transparent) 100%)',
          ].join(','),
        }}
      />
    </div>
  );
}
