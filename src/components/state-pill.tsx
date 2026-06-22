'use client';

import { cn } from '@/lib/utils';

/** CSS variable refs for use with alpha, e.g. hsl(var(--chart-blue) / 0.15) */
export const STATE_COLORS: Record<string, string> = {
  underway: 'var(--chart-blue)',
  'at-anchor': 'var(--chart-orange)',
  'in-port': 'var(--chart-green)',
  'on-leave': 'var(--chart-gray)',
  'in-yard': 'var(--chart-red)',
};

export const STATE_LABELS: Record<string, string> = {
  underway: 'Underway',
  'at-anchor': 'At anchor',
  'in-port': 'Moored / In port',
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
  if (!stateKey) return null;
  const varRef = STATE_COLORS[stateKey];
  const text = label ?? STATE_LABELS[stateKey] ?? stateKey;
  if (!varRef) {
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
        backgroundColor: `hsl(${varRef} / 0.15)`,
        borderColor: `hsl(${varRef} / 0.4)`,
        color: `hsl(${varRef})`,
      }}
    >
      {text}
    </span>
  );
}
