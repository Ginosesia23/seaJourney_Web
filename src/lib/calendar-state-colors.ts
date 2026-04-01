import type { DailyStatus } from '@/lib/types';

/** Maps each logged state to its theme chart token (HSL components only, no hsl() wrapper). */
export const CALENDAR_STATE_CHART_VAR: Record<DailyStatus, string> = {
    underway: 'chart-blue',
    'at-anchor': 'chart-orange',
    'in-port': 'chart-green',
    'on-leave': 'chart-gray',
    'in-yard': 'chart-red',
};

/**
 * Light theme HSL for each chart token (hue, saturation %, lightness %).
 * Must stay in sync with `:root` chart variables in globals.css.
 */
const LIGHT_THEME_CHART_HSL: Record<DailyStatus, readonly [number, number, number]> = {
    underway: [213, 60, 55],
    'at-anchor': [25, 95, 53],
    'in-port': [142, 76, 36],
    'on-leave': [213, 15, 50],
    'in-yard': [0, 84, 60],
};

const BLACK_MIX = '16%';
/** Same proportion as BLACK_MIX, for Excel / non-CSS consumers. */
const BLACK_MIX_RATIO = 0.16;

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
 * Excel solid fill ARGB (AARRGGBB) matching calendar day cells: light-theme chart color
 * mixed toward black in HSL by the same ratio as {@link calendarStateSolid}.
 */
export function calendarStateExcelSolidArgb(state: string | null | undefined): string {
    if (!state || !(state in CALENDAR_STATE_CHART_VAR)) {
        return 'FFFFFFFF';
    }
    const daily = state as DailyStatus;
    const [h, s, l] = LIGHT_THEME_CHART_HSL[daily];
    // color-mix(in hsl, base, black 16%): achromatic black → keep hue of the chromatic color.
    const sMix = s * (1 - BLACK_MIX_RATIO);
    const lMix = l * (1 - BLACK_MIX_RATIO);
    const { r, g, b } = hslToRgbBytes(h, sMix, lMix);
    return `FF${byteToHex2(r)}${byteToHex2(g)}${byteToHex2(b)}`;
}

/** Darker than raw chart colors — day cells, legend tiles, solid borders. */
export function calendarStateSolid(state: DailyStatus): string {
    const v = CALENDAR_STATE_CHART_VAR[state];
    return `color-mix(in hsl, hsl(var(--${v})), black ${BLACK_MIX})`;
}

/**
 * Tinted wash for buttons and chrome. `opacityPercent` is how much of the darkened base to mix vs transparent
 * (higher = stronger tint), tuned to replace older `hsl(var(--chart-*) / 0.08)` style fills.
 */
export function calendarStateWash(state: DailyStatus, opacityPercent: number): string {
    const v = CALENDAR_STATE_CHART_VAR[state];
    const base = `color-mix(in hsl, hsl(var(--${v})), black ${BLACK_MIX})`;
    return `color-mix(in srgb, ${base} ${opacityPercent}%, transparent)`;
}

export function getCalendarStateChartVar(state: DailyStatus): string {
    return CALENDAR_STATE_CHART_VAR[state];
}
