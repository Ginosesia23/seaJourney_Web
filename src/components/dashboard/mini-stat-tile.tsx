'use client';

/**
 * MiniStatTile — compact stat card used inside the crew profile
 * "Sea time & days breakdown" rail. Designed to fit two-up in a
 * narrow sidebar (lg layout) while remaining tappable on mobile.
 *
 * Each tile has:
 *   - a small uppercase label
 *   - a large tabular-nums value (so 99 and 100 align nicely)
 *   - a coloured left-edge accent matching the day-state palette
 *     used elsewhere (Underway=blue, In port=green, At anchor=orange,
 *     Standby=purple); `muted` is the neutral tone for secondary
 *     metrics like "In yard" or "Total days".
 */

import React from 'react';
import { cn } from '@/lib/utils';

export type MiniStatTone =
  | 'blue'
  | 'green'
  | 'orange'
  | 'purple'
  | 'muted';

const TONE: Record<
  MiniStatTone,
  { container: string; value: string; accent: string }
> = {
  blue: {
    container: 'border-blue-200/70 bg-blue-50/60 dark:border-blue-900/60 dark:bg-blue-950/30',
    value: 'text-blue-700 dark:text-blue-300',
    accent: 'bg-blue-500',
  },
  green: {
    container: 'border-emerald-200/70 bg-emerald-50/60 dark:border-emerald-900/60 dark:bg-emerald-950/30',
    value: 'text-emerald-700 dark:text-emerald-300',
    accent: 'bg-emerald-500',
  },
  orange: {
    container: 'border-orange-200/70 bg-orange-50/60 dark:border-orange-900/60 dark:bg-orange-950/30',
    value: 'text-orange-700 dark:text-orange-300',
    accent: 'bg-orange-500',
  },
  purple: {
    container: 'border-[#7629BB]/25 bg-[#7629BB]/5 dark:border-purple-900/60 dark:bg-purple-950/30',
    value: 'text-[#7629BB] dark:text-purple-300',
    accent: 'bg-[#7629BB]',
  },
  muted: {
    container: 'border-border bg-muted/40',
    value: 'text-foreground',
    accent: 'bg-muted-foreground/40',
  },
};

export interface MiniStatTileProps {
  label: string;
  value: number | string;
  tone?: MiniStatTone;
  /** Optional secondary line under the value (e.g. unit, percentage). */
  hint?: string;
}

export function MiniStatTile({
  label,
  value,
  tone = 'muted',
  hint,
}: MiniStatTileProps) {
  const t = TONE[tone];
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-lg border px-3 py-2.5',
        t.container,
      )}
    >
      {/* Left accent stripe so the colour is readable even when the
          background tint is very subtle in dark mode. */}
      <span className={cn('absolute left-0 top-0 h-full w-1', t.accent)} aria-hidden />
      <div className="pl-1">
        <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground leading-tight">
          {label}
        </div>
        <div className={cn('mt-0.5 text-lg font-semibold tabular-nums leading-tight', t.value)}>
          {value}
        </div>
        {hint && (
          <div className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
            {hint}
          </div>
        )}
      </div>
    </div>
  );
}
