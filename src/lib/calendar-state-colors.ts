import type { CSSProperties } from 'react';
import type { DailyStatus } from '@/lib/types';

/**
 * Standby indicator (calendar bottom bar, legend, month summary).
 * Base was Tailwind purple-600 `#9333ea`; darkened 20% (RGB × 0.8).
 */
export const STANDBY_INDICATOR_COLOR = '#7629BB';
export const STANDBY_INDICATOR_COLOR_ON_DARK = '#A56BE0';

export type CalendarColorStyle = 'light' | 'dark';
/** App / system theme. Separate from the light-vs-saturated palette choice. */
export type CalendarAppearance = 'light' | 'dark';

export type CalendarStateSwatch = {
  /** Saturated color for charts, dots, and icons */
  accent: string;
  /** Text and icon on the day square */
  text: string;
  /** Day square fill */
  fill: string;
  /** Today outline */
  today: string;
};

export const CALENDAR_COLOR_STYLE_STORAGE_KEY = 'sea-calendar-color-style';
export const DEFAULT_CALENDAR_COLOR_STYLE: CalendarColorStyle = 'dark';

/** New pale squares with colored numbers (light UI). */
export const CALENDAR_STATE_COLORS_LIGHT: Record<DailyStatus, CalendarStateSwatch> = {
  underway: { accent: '#3EA7F5', text: '#3EA7F5', fill: '#DEF0FD', today: '#2D5F85' },
  'at-anchor': { accent: '#F87416', text: '#F87416', fill: '#FEE7D7', today: '#8D4511' },
  'in-port': { accent: '#41A060', text: '#41A060', fill: '#DFEFE4', today: '#2E5C38' },
  'in-yard': { accent: '#B93D30', text: '#B93D30', fill: '#F3DEDC', today: '#6D281F' },
  'on-leave': { accent: '#667071', text: '#667071', fill: '#E5E7E7', today: '#424341' },
};

/**
 * Same light-square language on a dark UI: deep tinted fills, bright numbers.
 * Accents stay the designed hues so charts and icons still match.
 */
export const CALENDAR_STATE_COLORS_LIGHT_ON_DARK: Record<DailyStatus, CalendarStateSwatch> = {
  underway: { accent: '#3EA7F5', text: '#8CC9F8', fill: '#1C4768', today: '#3EA7F5' },
  'at-anchor': { accent: '#F87416', text: '#F9A15A', fill: '#5C351D', today: '#F87416' },
  'in-port': { accent: '#41A060', text: '#7BC293', fill: '#1D4436', today: '#41A060' },
  'in-yard': { accent: '#B93D30', text: '#E08A82', fill: '#462325', today: '#B93D30' },
  'on-leave': { accent: '#667071', text: '#B4BBBB', fill: '#2A343C', today: '#9AA3A4' },
};

/** Previous saturated fills with white numbers. */
export const CALENDAR_STATE_COLORS_DARK: Record<DailyStatus, CalendarStateSwatch> = {
  underway: { accent: '#4D81B4', text: '#FFFFFF', fill: '#4D81B4', today: '#2D5F85' },
  'at-anchor': { accent: '#CF7427', text: '#FFFFFF', fill: '#CF7427', today: '#8D4511' },
  'in-port': { accent: '#159A4C', text: '#FFFFFF', fill: '#159A4C', today: '#2E5C38' },
  'in-yard': { accent: '#C94848', text: '#FFFFFF', fill: '#C94848', today: '#6D281F' },
  'on-leave': { accent: '#667483', text: '#FFFFFF', fill: '#667483', today: '#424341' },
};

export const CALENDAR_STATE_COLORS = CALENDAR_STATE_COLORS_DARK;

/** Maps each logged state to its theme chart token (HSL components only, no hsl() wrapper). */
export const CALENDAR_STATE_CHART_VAR: Record<DailyStatus, string> = {
  underway: 'chart-blue',
  'at-anchor': 'chart-orange',
  'in-port': 'chart-green',
  'on-leave': 'chart-gray',
  'in-yard': 'chart-red',
};

let currentStyle: CalendarColorStyle = DEFAULT_CALENDAR_COLOR_STYLE;
let currentAppearance: CalendarAppearance = 'light';

export function parseCalendarColorStyle(value: unknown): CalendarColorStyle | null {
  return value === 'light' || value === 'dark' ? value : null;
}

export function getCalendarColorStyle(): CalendarColorStyle {
  return currentStyle;
}

export function setCalendarColorStyle(style: CalendarColorStyle): void {
  currentStyle = style;
}

export function getCalendarAppearance(): CalendarAppearance {
  return currentAppearance;
}

export function setCalendarAppearance(appearance: CalendarAppearance): void {
  currentAppearance = appearance;
}

export function calendarStatePalette(
  style: CalendarColorStyle = currentStyle,
  appearance: CalendarAppearance = currentAppearance,
): Record<DailyStatus, CalendarStateSwatch> {
  if (style === 'dark') return CALENDAR_STATE_COLORS_DARK;
  return appearance === 'dark' ? CALENDAR_STATE_COLORS_LIGHT_ON_DARK : CALENDAR_STATE_COLORS_LIGHT;
}

function hexToArgb(hex: string): string {
  return `FF${hex.replace('#', '').toUpperCase()}`;
}

export function calendarStateSwatch(
  state: string | null | undefined,
  style: CalendarColorStyle = currentStyle,
  appearance: CalendarAppearance = currentAppearance,
): CalendarStateSwatch | null {
  if (!state || !(state in CALENDAR_STATE_COLORS_LIGHT)) return null;
  return calendarStatePalette(style, appearance)[state as DailyStatus];
}

/** Saturated color for charts, dots, and icons. */
export function calendarStateSolid(
  state: DailyStatus,
  style: CalendarColorStyle = currentStyle,
  appearance: CalendarAppearance = currentAppearance,
): string {
  return calendarStatePalette(style, appearance)[state].accent;
}

/** Day-square fill. */
export function calendarStateFill(
  state: DailyStatus,
  style: CalendarColorStyle = currentStyle,
  appearance: CalendarAppearance = currentAppearance,
): string {
  return calendarStatePalette(style, appearance)[state].fill;
}

/** Today outline. */
export function calendarStateTodayOutline(
  state: DailyStatus,
  style: CalendarColorStyle = currentStyle,
  appearance: CalendarAppearance = currentAppearance,
): string {
  return calendarStatePalette(style, appearance)[state].today;
}

export function calendarStandbyIndicatorColor(
  _style?: CalendarColorStyle,
  appearance: CalendarAppearance = currentAppearance,
): string {
  return appearance === 'dark' ? STANDBY_INDICATOR_COLOR_ON_DARK : STANDBY_INDICATOR_COLOR;
}

/**
 * Tinted chrome (picker tiles, chips). Mixes the accent color toward white.
 * Higher `opacityPercent` = stronger tint.
 */
export function calendarStateWash(
  state: DailyStatus,
  opacityPercent: number,
  style: CalendarColorStyle = currentStyle,
  appearance: CalendarAppearance = currentAppearance,
): string {
  const accent = calendarStatePalette(style, appearance)[state].accent;
  const ground = appearance === 'dark' ? '#0B1520' : 'white';
  return `color-mix(in srgb, ${accent} ${opacityPercent}%, ${ground})`;
}

/** Day cell: fill, number color, optional today inset outline. */
export function calendarDayCellStyle(
  state: DailyStatus,
  opts?: { today?: boolean },
  style: CalendarColorStyle = currentStyle,
  appearance: CalendarAppearance = currentAppearance,
): CSSProperties {
  const swatch = calendarStatePalette(style, appearance)[state];
  return {
    backgroundColor: swatch.fill,
    color: swatch.text,
    ...(opts?.today ? { boxShadow: `inset 0 0 0 2px ${swatch.today}` } : {}),
  };
}

/** Legend / picker icon tile. */
export function calendarStateIconTileStyle(
  state: DailyStatus,
  style: CalendarColorStyle = currentStyle,
  appearance: CalendarAppearance = currentAppearance,
): CSSProperties {
  const swatch = calendarStatePalette(style, appearance)[state];
  return {
    backgroundColor: swatch.fill,
    color: style === 'dark' ? '#FFFFFF' : swatch.text,
  };
}

export function calendarStateExcelSolidArgb(state: string | null | undefined): string {
  const swatch = calendarStateSwatch(state, currentStyle, 'light');
  return swatch ? hexToArgb(swatch.fill) : 'FFFFFFFF';
}

export function calendarStateExcelTextArgb(state: string | null | undefined): string {
  const swatch = calendarStateSwatch(state, currentStyle, 'light');
  return swatch ? hexToArgb(swatch.text) : 'FF000000';
}

export function getCalendarStateChartVar(state: DailyStatus): string {
  return CALENDAR_STATE_CHART_VAR[state];
}
