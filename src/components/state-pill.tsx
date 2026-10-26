'use client';

import { useCalendarColorStyle } from '@/components/calendar-color-style-provider';
import { calendarStateSwatch } from '@/lib/calendar-state-colors';
import { cn } from '@/lib/utils';

/** Text/icon hex for each logged state. */
export const STATE_COLORS: Record<string, string> = {
  underway: '#3EA7F5',
  'at-anchor': '#F87416',
  'in-port': '#41A060',
  'on-leave': '#667071',
  'in-yard': '#B93D30',
};

export const STATE_LABELS: Record<string, string> = {
  underway: 'Underway',
  'at-anchor': 'At anchor',
  'in-port': 'Moored',
  'on-leave': 'On leave',
  'in-yard': 'In yard',
};

interface StatePillProps {
  /** State key: underway, at-anchor, in-port, on-leave, in-yard */
  stateKey: string | null;
  /** Optional override for display text (defaults to STATE_LABELS[stateKey]) */
  label?: string | null;
  className?: string;
}

export function StatePill({ stateKey, label, className }: StatePillProps) {
  useCalendarColorStyle();
  if (!stateKey) return null;
  const swatch = calendarStateSwatch(stateKey);
  const text = label ?? STATE_LABELS[stateKey] ?? stateKey;
  if (!swatch) {
    return (
      <span className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium', className)}>
        {text}
      </span>
    );
  }
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
        className
      )}
      style={{
        backgroundColor: swatch.fill,
        borderColor: swatch.accent,
        color: swatch.text,
      }}
    >
      {text}
    </span>
  );
}
