import type { DailyStatus } from '@/lib/types';

/**
 * Standby indicator (calendar bottom strip, legend, month summary).
 * Base was Tailwind purple-600 `#9333ea`; darkened 20% (RGB × 0.8).
 */
export const STANDBY_INDICATOR_COLOR = '#7629BB';

/** Maps each logged state to its theme chart token (HSL components only, no hsl() wrapper). */
export const CALENDAR_STATE_CHART_VAR: Record<DailyStatus, string> = {
    underway: 'chart-blue',
    'at-anchor': 'chart-orange',
    'in-port': 'chart-green',
    'on-leave': 'chart-gray',
    'in-yard': 'chart-red',
};

/**
 * Light theme HSL for each chart token — must match `:root` chart variables in globals.css.
 * Excel applies the same black-mix ratio as {@link calendarStateSolid}.
 */
const LIGHT_THEME_CHART_HSL: Record<DailyStatus, readonly [number, number, number]> = {
    underway: [213, 60, 60],
    'at-anchor': [25, 95, 58],
    'in-port': [142, 76, 41],
    'on-leave': [213, 15, 55],
    'in-yard': [0, 84, 65],
};

/** Same proportion as `:root` `--calendar-state-mix-pct` for Excel parity with color-mix(black). */
const CALENDAR_SOLID_BLACK_MIX_RATIO = 0.16;

/** Matches `color-mix(..., var(--calendar-state-mix) var(--calendar-state-mix-pct))` in globals. */
const CALENDAR_SOLID_MIX = 'var(--calendar-state-mix) var(--calendar-state-mix-pct)';

function hslToRgbBytes(h: number, sPercent: number, lPercent: number): { r: number; g: number; b: number } {
    const s = sPercent / 100;
    const l = lPercent / 100;
    const hn = h / 360;
    let r: number;
    let g: number;
    let b: number;
    if (s === 0) {
        r = g = b = l;
    } else {
        const hue2rgb = (p: number, q: number, t: number) => {
            let tt = t;
            if (tt < 0) tt += 1;
            if (tt > 1) tt -= 1;
            if (tt < 1 / 6) return p + (q - p) * 6 * tt;
            if (tt < 1 / 2) return q;
            if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
            return p;
        };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, hn + 1 / 3);
        g = hue2rgb(p, q, hn);
        b = hue2rgb(p, q, hn - 1 / 3);
    }
    return {
        r: Math.round(r * 255),
        g: Math.round(g * 255),
        b: Math.round(b * 255),
    };
}

function byteToHex2(n: number): string {
    return n.toString(16).padStart(2, '0').toUpperCase();
}

/**
 * Excel solid fill ARGB (AARRGGBB) matching calendar day cells: chart color mixed toward black.
 */
export function calendarStateExcelSolidArgb(state: string | null | undefined): string {
    if (!state || !(state in CALENDAR_STATE_CHART_VAR)) {
        return 'FFFFFFFF';
    }
    const daily = state as DailyStatus;
    const [h, s, l] = LIGHT_THEME_CHART_HSL[daily];
    const rMix = CALENDAR_SOLID_BLACK_MIX_RATIO;
    const sMix = s * (1 - rMix);
    const lMix = l * (1 - rMix);
    const { r, g, b } = hslToRgbBytes(h, sMix, lMix);
    return `FF${byteToHex2(r)}${byteToHex2(g)}${byteToHex2(b)}`;
}

/** Day cells, legend tiles, solid borders — theme-aware via `--calendar-state-mix*` in globals.css. */
export function calendarStateSolid(state: DailyStatus): string {
    const v = CALENDAR_STATE_CHART_VAR[state];
    return `color-mix(in hsl, hsl(var(--${v})), ${CALENDAR_SOLID_MIX})`;
}

/**
 * Tinted wash for buttons and chrome. `opacityPercent` is how much of the darkened base to mix vs transparent
 * (higher = stronger tint), tuned to replace older `hsl(var(--chart-*) / 0.08)` style fills.
 */
export function calendarStateWash(state: DailyStatus, opacityPercent: number): string {
    const v = CALENDAR_STATE_CHART_VAR[state];
    const base = `color-mix(in hsl, hsl(var(--${v})), ${CALENDAR_SOLID_MIX})`;
    return `color-mix(in srgb, ${base} ${opacityPercent}%, transparent)`;
}

export function getCalendarStateChartVar(state: DailyStatus): string {
    return CALENDAR_STATE_CHART_VAR[state];
}
