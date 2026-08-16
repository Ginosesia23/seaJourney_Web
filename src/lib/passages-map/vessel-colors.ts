/**
 * Stable per-vessel track colours for Passages Map.
 *
 * Order is intentional and shared across tracks + live APIs so every
 * user sees the same legend: 1st vessel blue, 2nd green, 3rd purple,
 * 4th orange, then cyan / pink / gold / indigo, then wrap.
 *
 * Selection accents are paired per slot so a selected passage always
 * contrasts the vessel's resting track colour.
 */

export type VesselSelectionPalette = {
  line: string;
  glow: string;
  sheen: string;
  casing: string;
};

const SELECTED_SKY: VesselSelectionPalette = {
  line: '#38bdf8',
  glow: '#0ea5e9',
  sheen: '#e0f2fe',
  casing: '#0c4a6e',
};

const SELECTED_EMERALD: VesselSelectionPalette = {
  line: '#34d399',
  glow: '#10b981',
  sheen: '#d1fae5',
  casing: '#064e3b',
};

const SELECTED_AMBER: VesselSelectionPalette = {
  line: '#fbbf24',
  glow: '#f59e0b',
  sheen: '#fef3c7',
  casing: '#78350f',
};

const SELECTED_ROSE: VesselSelectionPalette = {
  line: '#fb7185',
  glow: '#f43f5e',
  sheen: '#ffe4e6',
  casing: '#881337',
};

/**
 * Resting track colours — index 0 = first vessel in the stable roster.
 * Saturated enough to read on dark and light basemaps.
 */
export const VESSEL_TRACK_COLORS = [
  '#2563eb', // 1 blue
  '#16a34a', // 2 green
  '#9333ea', // 3 purple
  '#ea580c', // 4 orange
  '#0891b2', // 5 cyan
  '#db2777', // 6 pink
  '#ca8a04', // 7 gold
  '#4f46e5', // 8 indigo
] as const;

/** Contrasting highlight for each track slot (same index). */
export const VESSEL_SELECTION_PALETTES: readonly VesselSelectionPalette[] = [
  SELECTED_AMBER, // blue → amber
  SELECTED_SKY, // green → sky
  SELECTED_AMBER, // purple → amber
  SELECTED_SKY, // orange → sky
  SELECTED_AMBER, // cyan → amber
  SELECTED_EMERALD, // pink → emerald
  SELECTED_SKY, // gold → sky
  SELECTED_ROSE, // indigo → rose
];

export function vesselColorAtIndex(index: number): string {
  const n = VESSEL_TRACK_COLORS.length;
  const i = ((index % n) + n) % n;
  return VESSEL_TRACK_COLORS[i]!;
}

export function selectionPaletteAtIndex(index: number): VesselSelectionPalette {
  const n = VESSEL_SELECTION_PALETTES.length;
  const i = ((index % n) + n) % n;
  return VESSEL_SELECTION_PALETTES[i]!;
}

/**
 * Resolve selection paint from a vessel's resting hex. Exact palette
 * hits use the paired accent; unknown colours fall back to sky vs
 * emerald by hue distance (legacy hashed colours).
 */
export function selectionPaletteForVesselColor(
  colorHex: string,
): VesselSelectionPalette {
  const normalized = normalizeHex(colorHex);
  if (normalized) {
    const idx = VESSEL_TRACK_COLORS.findIndex(
      (c) => c.toLowerCase() === normalized,
    );
    if (idx >= 0) return selectionPaletteAtIndex(idx);
  }

  const hue = hexToHue(colorHex);
  if (hue == null) return SELECTED_SKY;
  const distBlue = circularHueDistance(hue, 205);
  const distGreen = circularHueDistance(hue, 155);
  return distBlue <= distGreen ? SELECTED_EMERALD : SELECTED_SKY;
}

/**
 * Assign colours by stable roster order: name (case-insensitive), then
 * id. Returns a map of vesselId → { colorHex, colorIndex }.
 */
export function assignOrderedVesselColors(
  vessels: ReadonlyArray<{ id: string; name?: string | null }>,
): Map<string, { colorHex: string; colorIndex: number }> {
  const sorted = [...vessels].sort((a, b) => {
    const an = (a.name || '').trim().toLowerCase();
    const bn = (b.name || '').trim().toLowerCase();
    if (an !== bn) return an.localeCompare(bn);
    return a.id.localeCompare(b.id);
  });

  const out = new Map<string, { colorHex: string; colorIndex: number }>();
  sorted.forEach((v, index) => {
    out.set(v.id, {
      colorIndex: index,
      colorHex: vesselColorAtIndex(index),
    });
  });
  return out;
}

function normalizeHex(hex: string): string | null {
  const raw = hex.replace('#', '').trim().toLowerCase();
  if (raw.length === 3) {
    return `#${raw
      .split('')
      .map((c) => c + c)
      .join('')}`;
  }
  if (raw.length === 6) return `#${raw}`;
  return null;
}

function circularHueDistance(a: number, b: number): number {
  return Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
}

function hexToHue(hex: string): number | null {
  const normalized = normalizeHex(hex);
  if (!normalized) return null;
  const full = normalized.slice(1);
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  if (![r, g, b].every(Number.isFinite)) return null;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d < 1e-6) return 0;
  let h = 0;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return h;
}
