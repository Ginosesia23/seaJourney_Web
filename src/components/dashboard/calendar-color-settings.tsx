'use client';

import { Check } from 'lucide-react';

import { useCalendarColorStyle } from '@/components/calendar-color-style-provider';
import { cn } from '@/lib/utils';
import {
  calendarStatePalette,
  type CalendarAppearance,
  type CalendarColorStyle,
} from '@/lib/calendar-state-colors';
import type { DailyStatus } from '@/lib/types';

const PRESETS: Array<{
  id: CalendarColorStyle;
  title: string;
  description: string;
}> = [
  {
    id: 'dark',
    title: 'Dark squares',
    description: 'Saturated fills with white numbers. Default.',
  },
  {
    id: 'light',
    title: 'Light squares',
    description: 'Pale fills with colored numbers. Deepens in dark mode.',
  },
];

const PREVIEW_STATES: DailyStatus[] = [
  'underway',
  'at-anchor',
  'in-port',
  'in-yard',
  'on-leave',
];

function MiniPreview({
  style,
  appearance,
}: {
  style: CalendarColorStyle;
  appearance: CalendarAppearance;
}) {
  const palette = calendarStatePalette(style, appearance);
  return (
    <div
      className={cn(
        'grid grid-cols-5 gap-1 rounded-[5px] border p-1.5',
        appearance === 'dark' ? 'border-white/10 bg-[#0B1520]' : 'border-border bg-muted/30',
      )}
    >
      {PREVIEW_STATES.map((state) => {
        const swatch = palette[state];
        return (
          <div
            key={`${appearance}-${state}`}
            className="flex h-6 w-6 items-center justify-center rounded-[4px] text-[9px] font-semibold"
            style={{
              backgroundColor: swatch.fill,
              color: swatch.text,
              boxShadow: state === 'underway' ? `inset 0 0 0 1.5px ${swatch.today}` : undefined,
            }}
          >
            {state === 'underway' ? 12 : state === 'at-anchor' ? 13 : state === 'in-port' ? 14 : state === 'in-yard' ? 15 : 16}
          </div>
        );
      })}
    </div>
  );
}

export function CalendarColorSettings() {
  const { style, setStyle } = useCalendarColorStyle();

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {PRESETS.map((preset) => {
        const selected = style === preset.id;
        return (
          <button
            key={preset.id}
            type="button"
            onClick={() => setStyle(preset.id)}
            className={cn(
              'rounded-md border bg-background p-3 text-left transition-colors',
              selected
                ? 'border-foreground/20 ring-1 ring-foreground/15'
                : 'border-border hover:bg-muted/30',
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{preset.title}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{preset.description}</p>
              </div>
              {selected ? <Check className="h-4 w-4 shrink-0 text-emerald-600" /> : null}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Light
                </p>
                <MiniPreview style={preset.id} appearance="light" />
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Dark
                </p>
                <MiniPreview style={preset.id} appearance="dark" />
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
