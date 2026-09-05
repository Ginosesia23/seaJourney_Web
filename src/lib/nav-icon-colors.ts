import type { CSSProperties } from 'react';

/** Section icon tints — inline hex so colors work regardless of Tailwind content scan. */
export const NAV_GROUP_ICON_HEX: Record<string, string> = {
  Overview: '#38bdf8', // sky-400
  'Sea time': '#22d3ee', // cyan-400
  Voyages: '#818cf8', // indigo-400
  Career: '#fbbf24', // amber-400
  'Vessel documents': '#60a5fa', // blue-400
  Crew: '#a78bfa', // violet-400
  Fleet: '#a78bfa',
  Account: '#94a3b8', // slate-400
  Revenue: '#34d399', // emerald-400
  People: '#fb7185', // rose-400
  Analytics: '#e879f9', // fuchsia-400
  Product: '#fb923c', // orange-400
  Platform: '#fb923c',
  AIS: '#2dd4bf', // teal-400
  Help: '#a8a29e', // stone-400
};

export function navIconPresentation(
  groupTitle: string,
  opts?: { isActive?: boolean; isLocked?: boolean; coloredByGroup?: boolean },
): { className: string; style: CSSProperties } {
  if (opts?.isLocked) {
    return {
      className: 'h-4 w-4 shrink-0 opacity-70',
      style: {},
    };
  }

  if (!opts?.coloredByGroup) {
    return {
      className: '',
      style: {},
    };
  }

  return {
    className: 'h-4 w-4 shrink-0',
    style: {
      color: NAV_GROUP_ICON_HEX[groupTitle] ?? 'hsl(var(--sidebar-foreground) / 0.72)',
      opacity: opts?.isActive ? 1 : 0.92,
    },
  };
}
