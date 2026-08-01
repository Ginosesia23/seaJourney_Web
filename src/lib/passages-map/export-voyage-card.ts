/**
 * Composite the MapLibre canvas into a shareable "voyage card" PNG —
 * dark glass frame, title, stats, subtle SeaJourney wordmark.
 *
 * Uses only the Canvas 2D API (no html2canvas) so export stays offline
 * and crisp at 2× device pixels when available.
 */

export type VoyageCardStats = {
  title: string;
  subtitle?: string;
  vessels?: string[];
  passageCount?: number;
  totalDistanceNm?: number;
  /** e.g. "July 2026" or "All time" */
  periodLabel?: string;
};

export type ExportVoyageCardResult = {
  blob: Blob;
  filename: string;
};

/**
 * Draw `mapCanvas` into a framed card and return a PNG blob ready to
 * download. Rejects if the map canvas has no pixels yet.
 */
export async function buildVoyageCardPng(
  mapCanvas: HTMLCanvasElement,
  stats: VoyageCardStats,
): Promise<ExportVoyageCardResult> {
  if (!mapCanvas.width || !mapCanvas.height) {
    throw new Error('Map is not ready to export yet.');
  }

  const outW = 1600;
  const outH = 1000;
  const pad = 36;
  const headerH = 92;
  const footerH = 56;

  const out = document.createElement('canvas');
  out.width = outW;
  out.height = outH;
  const ctx = out.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D unavailable.');

  // Background atmosphere
  const bg = ctx.createLinearGradient(0, 0, outW, outH);
  bg.addColorStop(0, '#07101f');
  bg.addColorStop(1, '#0b1528');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, outW, outH);

  // Soft vignette
  const vig = ctx.createRadialGradient(
    outW / 2,
    outH / 2,
    outH * 0.2,
    outW / 2,
    outH / 2,
    outH * 0.75,
  );
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, outW, outH);

  // Map frame
  const mapX = pad;
  const mapY = pad + headerH;
  const mapW = outW - pad * 2;
  const mapH = outH - pad * 2 - headerH - footerH;

  ctx.save();
  roundRect(ctx, mapX, mapY, mapW, mapH, 18);
  ctx.clip();

  // Cover-fit the map canvas into the frame
  const srcW = mapCanvas.width;
  const srcH = mapCanvas.height;
  const scale = Math.max(mapW / srcW, mapH / srcH);
  const drawW = srcW * scale;
  const drawH = srcH * scale;
  const dx = mapX + (mapW - drawW) / 2;
  const dy = mapY + (mapH - drawH) / 2;
  ctx.drawImage(mapCanvas, dx, dy, drawW, drawH);

  // Gentle top/bottom scrims over the map so type stays readable if
  // we ever overlay — kept light so the track remains the hero.
  const scrim = ctx.createLinearGradient(0, mapY, 0, mapY + mapH);
  scrim.addColorStop(0, 'rgba(2,6,23,0.15)');
  scrim.addColorStop(0.55, 'rgba(2,6,23,0)');
  scrim.addColorStop(1, 'rgba(2,6,23,0.25)');
  ctx.fillStyle = scrim;
  ctx.fillRect(mapX, mapY, mapW, mapH);
  ctx.restore();

  // Frame border
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1.5;
  roundRect(ctx, mapX, mapY, mapW, mapH, 18);
  ctx.stroke();

  // Header type
  ctx.fillStyle = 'rgba(125, 211, 252, 0.85)';
  ctx.font = '600 12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillText('SEAJOURNEY  ·  PASSAGE MAP', pad, pad + 28);

  ctx.fillStyle = '#ffffff';
  ctx.font = '600 34px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  const title = truncate(ctx, stats.title || 'Voyage', mapW - 8);
  ctx.fillText(title, pad, pad + 64);

  if (stats.subtitle) {
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '500 15px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillText(truncate(ctx, stats.subtitle, mapW - 8), pad, pad + 88);
  }

  // Footer stats
  const footerY = outH - pad - 18;
  const chips: string[] = [];
  if (stats.periodLabel) chips.push(stats.periodLabel);
  if (typeof stats.passageCount === 'number') {
    chips.push(
      `${stats.passageCount.toLocaleString()} passage${stats.passageCount === 1 ? '' : 's'}`,
    );
  }
  if (typeof stats.totalDistanceNm === 'number') {
    chips.push(`${Math.round(stats.totalDistanceNm).toLocaleString()} NM`);
  }
  if (stats.vessels?.length) {
    chips.push(
      stats.vessels.length === 1
        ? stats.vessels[0]!
        : `${stats.vessels.length} vessels`,
    );
  }

  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '500 14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillText(chips.join('   ·   '), pad, footerY);

  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.font = '500 12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  const brand = 'seajourney.app';
  const brandW = ctx.measureText(brand).width;
  ctx.fillText(brand, outW - pad - brandW, footerY);

  const blob = await new Promise<Blob>((resolve, reject) => {
    out.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('PNG encode failed'))),
      'image/png',
    );
  });

  const stamp = new Date().toISOString().slice(0, 10);
  const slug = (stats.periodLabel || 'voyage')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return {
    blob,
    filename: `seajourney-passage-map-${slug || 'voyage'}-${stamp}.png`,
  };
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function truncate(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) {
    t = t.slice(0, -1);
  }
  return `${t}…`;
}
