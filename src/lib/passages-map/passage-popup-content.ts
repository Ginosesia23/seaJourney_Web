/**
 * Popup HTML for a passage on the Passages Map.
 *
 * Kept as a plain string builder (rather than a React component) so it
 * can live inside a MapLibre `Popup.setHTML(...)` call. MapLibre popups
 * are rendered in a detached DOM subtree that React won't own — trying
 * to render React into them requires createPortal + a mount/unmount
 * dance that's not worth the ceremony for a hover tooltip.
 *
 * IMPORTANT: `properties` comes straight from a MapLibre feature, which
 * means every value is either a primitive or, in some cases, a
 * JSON-serialized string (MapLibre serialises non-primitive property
 * values on GeoJSON sources when it hands them to the renderer). We
 * defensively parse only what we need and always fall back to a dash.
 */

export type PassagePopupProps = {
  vesselName: string;
  colorHex: string;
  passageIndex?: number;
  startTime?: string;
  endTime?: string;
  durationMs?: number;
  distanceNm?: number;
  avgSpeedKn?: number | null;
  maxSpeedKn?: number | null;
  pointCount?: number;
  /**
   * Optional short route label like "Palma → Antibes". Rendered right
   * below the vessel name and above the date range so users can read
   * the passage at a glance without scanning coordinates. Pass
   * `undefined` when the passage's endpoints don't match any curated
   * port and we'd only end up saying "Open sea → Open sea".
   */
  routeLabel?: string;
  /**
   * Hover-scrub sample along the line — when set, the popup leads with
   * the interpolated clock time / local speed / progress under the
   * pointer, with the whole-passage summary underneath.
   */
  scrub?: {
    lat: number;
    lon: number;
    atMs?: number | null;
    speedKn?: number | null;
    bearingDeg?: number | null;
    progress?: number;
    distanceFromStartNm?: number;
    distanceRemainingNm?: number;
    remainingMs?: number | null;
    totalDistanceNm?: number;
  };
};

/**
 * Render a passage popup as a self-contained HTML fragment. Styling
 * relies on the `.passages-map-popup` class we inject alongside the
 * MapLibre canvas styles, so the popup automatically inherits the
 * dark-glass premium look of the rest of the map UI without depending
 * on the app's Tailwind stylesheet reaching into the popup subtree.
 */
export function renderPassagePopupHtml(props: PassagePopupProps): string {
  const {
    vesselName,
    colorHex,
    passageIndex,
    startTime,
    endTime,
    durationMs,
    distanceNm,
    avgSpeedKn,
    maxSpeedKn,
    pointCount,
    routeLabel,
    scrub,
  } = props;

  const passageLabel =
    typeof passageIndex === 'number' ? `Passage #${passageIndex + 1}` : 'Passage';

  const dateRange = formatDateRange(startTime, endTime);
  const duration = formatDuration(durationMs);
  const distance =
    typeof distanceNm === 'number'
      ? `${formatNumber(distanceNm, distanceNm < 10 ? 1 : 0)} NM`
      : '—';
  const avgSpeed =
    typeof avgSpeedKn === 'number' ? `${formatNumber(avgSpeedKn, 1)} kn avg` : null;
  const maxSpeed =
    typeof maxSpeedKn === 'number' ? `${formatNumber(maxSpeedKn, 1)} kn peak` : null;
  const speedLine = [avgSpeed, maxSpeed].filter(Boolean).join(' · ');
  const points =
    typeof pointCount === 'number' ? `${formatNumber(pointCount, 0)} AIS fixes` : '';

  const scrubBlock = scrub
    ? (() => {
        const when =
          typeof scrub.atMs === 'number' && Number.isFinite(scrub.atMs)
            ? new Date(scrub.atMs).toLocaleString(undefined, {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })
            : null;
        const sog =
          typeof scrub.speedKn === 'number'
            ? `${formatNumber(scrub.speedKn, 1)} kn`
            : '—';
        const hdg =
          typeof scrub.bearingDeg === 'number'
            ? `${scrub.bearingDeg}°`
            : '—';
        const gps = formatLatLon(scrub.lat, scrub.lon);
        const pct =
          typeof scrub.progress === 'number'
            ? Math.round(Math.min(1, Math.max(0, scrub.progress)) * 100)
            : 0;
        const along =
          typeof scrub.distanceFromStartNm === 'number'
            ? `${formatNumber(scrub.distanceFromStartNm, scrub.distanceFromStartNm < 10 ? 1 : 0)} NM`
            : null;
        const remainNm =
          typeof scrub.distanceRemainingNm === 'number'
            ? `${formatNumber(scrub.distanceRemainingNm, scrub.distanceRemainingNm < 10 ? 1 : 0)} NM left`
            : null;
        const remainTime =
          typeof scrub.remainingMs === 'number'
            ? formatDuration(scrub.remainingMs)
            : null;
        const remainBits = [remainNm, remainTime && remainTime !== '—' ? remainTime : null]
          .filter(Boolean)
          .join(' · ');

        return `
          <div class="passages-popup-scrub">
            <div class="passages-popup-scrub-top">
              <p class="passages-popup-label">Scrub</p>
              <p class="passages-popup-scrub-pct">${pct}%</p>
            </div>
            ${when ? `<p class="passages-popup-scrub-time">${escapeHtml(when)}</p>` : ''}
            <div class="passages-popup-scrub-bar" aria-hidden="true">
              <span class="passages-popup-scrub-bar-fill" style="width:${pct}%"></span>
              <span class="passages-popup-scrub-bar-knob" style="left:${pct}%"></span>
            </div>
            <div class="passages-popup-scrub-grid">
              <div>
                <p class="passages-popup-label">Speed</p>
                <p class="passages-popup-value passages-popup-value--sm">${escapeHtml(sog)}</p>
              </div>
              <div>
                <p class="passages-popup-label">Course</p>
                <p class="passages-popup-value passages-popup-value--sm">${escapeHtml(hdg)}</p>
              </div>
            </div>
            <p class="passages-popup-scrub-meta">${escapeHtml(gps)}</p>
            <p class="passages-popup-scrub-meta">${escapeHtml(
              [along && `${along} in`, remainBits].filter(Boolean).join(' · '),
            )}</p>
          </div>`;
      })()
    : '';

  return `
    <div class="passages-popup-body${scrub ? ' passages-popup-body--scrub' : ''}">
      <div class="passages-popup-header">
        <span class="passages-popup-swatch" style="background:${escapeAttr(colorHex)};box-shadow:0 0 10px ${escapeAttr(colorHex)}55"></span>
        <div class="passages-popup-title">
          <p class="passages-popup-vessel">${escapeHtml(vesselName)}</p>
          <p class="passages-popup-eyebrow">${escapeHtml(passageLabel)}</p>
        </div>
      </div>
      ${routeLabel ? `<p class="passages-popup-route">${escapeHtml(routeLabel)}</p>` : ''}
      ${scrubBlock}
      ${!scrub && dateRange ? `<p class="passages-popup-range">${escapeHtml(dateRange)}</p>` : ''}
      <div class="passages-popup-grid">
        <div>
          <p class="passages-popup-label">Distance</p>
          <p class="passages-popup-value">${escapeHtml(distance)}</p>
        </div>
        <div>
          <p class="passages-popup-label">Duration</p>
          <p class="passages-popup-value">${escapeHtml(duration)}</p>
        </div>
      </div>
      ${
        speedLine
          ? `<p class="passages-popup-foot">${escapeHtml(speedLine)}${points ? ` · ${escapeHtml(points)}` : ''}</p>`
          : points
            ? `<p class="passages-popup-foot">${escapeHtml(points)}</p>`
            : ''
      }
    </div>
  `.trim();
}

/**
 * Same CSS as the rest of the map overlay's "dark glass" language so the
 * popup drops into the map without visual mismatch. Injected once at
 * module scope by the caller.
 */
export const PASSAGE_POPUP_STYLE = `
  .passages-map-popup .maplibregl-popup-content {
    background: transparent !important;
    padding: 0 !important;
    box-shadow: none !important;
  }
  .passages-map-popup .maplibregl-popup-tip {
    border-top-color: rgba(2, 6, 23, 0.92) !important;
    border-bottom-color: rgba(2, 6, 23, 0.92) !important;
  }
  .passages-popup-body {
    min-width: 220px;
    max-width: 260px;
    padding: 10px 12px 11px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.10);
    background: rgba(2, 6, 23, 0.92);
    backdrop-filter: blur(10px);
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.45);
    color: rgba(255, 255, 255, 0.92);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 12px;
    line-height: 1.35;
  }
  .passages-popup-header {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .passages-popup-swatch {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .passages-popup-title {
    min-width: 0;
    flex: 1;
  }
  .passages-popup-vessel {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    color: #fff;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .passages-popup-eyebrow {
    margin: 1px 0 0;
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.5);
  }
  .passages-popup-eyebrow--live {
    color: rgba(52, 211, 153, 0.9);
  }
  .passages-popup-body--live {
    border-color: rgba(52, 211, 153, 0.22);
  }
  .passages-popup-grid--live {
    grid-template-columns: 1fr;
    gap: 6px;
  }
  .passages-popup-value--sm {
    font-size: 12px;
    font-weight: 500;
    word-break: break-word;
  }
  .passages-popup-route {
    margin: 8px 0 2px;
    font-size: 12px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.92);
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .passages-popup-range {
    margin: 2px 0 6px;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.7);
  }
  .passages-popup-scrub {
    margin: 8px 0 4px;
    padding: 9px 10px 8px;
    border-radius: 9px;
    background: linear-gradient(180deg, rgba(56, 189, 248, 0.12), rgba(56, 189, 248, 0.05));
    border: 1px solid rgba(56, 189, 248, 0.22);
  }
  .passages-popup-body--scrub {
    min-width: 236px;
  }
  .passages-popup-scrub-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .passages-popup-scrub-pct {
    margin: 0;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: rgba(125, 211, 252, 0.95);
    font-variant-numeric: tabular-nums;
  }
  .passages-popup-scrub-time {
    margin: 4px 0 0;
    font-size: 13px;
    font-weight: 600;
    color: #fff;
    font-variant-numeric: tabular-nums;
  }
  .passages-popup-scrub-bar {
    position: relative;
    height: 4px;
    margin: 9px 0 10px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.10);
  }
  .passages-popup-scrub-bar-fill {
    display: block;
    height: 100%;
    border-radius: 999px;
    background: linear-gradient(90deg, rgba(56, 189, 248, 0.55), rgba(125, 211, 252, 0.95));
  }
  .passages-popup-scrub-bar-knob {
    position: absolute;
    top: 50%;
    width: 9px;
    height: 9px;
    margin-left: -4.5px;
    margin-top: -4.5px;
    border-radius: 50%;
    background: #e0f2fe;
    box-shadow: 0 0 0 2px rgba(14, 165, 233, 0.55), 0 0 10px rgba(56, 189, 248, 0.65);
  }
  .passages-popup-scrub-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px 12px;
    margin-bottom: 6px;
  }
  .passages-popup-scrub-meta {
    margin: 2px 0 0;
    font-size: 10.5px;
    color: rgba(186, 230, 253, 0.78);
    font-variant-numeric: tabular-nums;
  }
  .passages-popup-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px 12px;
    margin-top: 6px;
  }
  .passages-popup-label {
    margin: 0;
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.10em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.42);
  }
  .passages-popup-value {
    margin: 2px 0 0;
    font-size: 13px;
    font-weight: 600;
    color: #fff;
    font-variant-numeric: tabular-nums;
  }
  .passages-popup-foot {
    margin: 8px 0 0;
    padding-top: 7px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    font-size: 11px;
    color: rgba(255, 255, 255, 0.6);
  }
`;

// ─── Formatting helpers ───────────────────────────────────────────────

function formatNumber(n: number, digits: number): string {
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatDateRange(start?: string, end?: string): string {
  if (!start) return '';
  const startDate = new Date(start);
  const endDate = end ? new Date(end) : null;
  if (Number.isNaN(startDate.getTime())) return '';

  const sameDay =
    endDate &&
    !Number.isNaN(endDate.getTime()) &&
    startDate.toDateString() === endDate.toDateString();

  if (sameDay && endDate) {
    // "12 Aug 2026 · 09:14 → 15:42"
    return `${startDate.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })} · ${startDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })} → ${endDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
  }
  if (endDate && !Number.isNaN(endDate.getTime())) {
    return `${startDate.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} → ${endDate.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  }
  return startDate.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(ms?: number): string {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return '—';
  const totalMinutes = Math.round(ms / 60_000);
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes - days * 24 * 60) / 60);
  const minutes = totalMinutes - days * 24 * 60 - hours * 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (days === 0 && minutes > 0) parts.push(`${minutes}m`);
  if (parts.length === 0) parts.push(`${minutes}m`);
  return parts.join(' ');
}

export type LiveTrackPopupProps = {
  vesselName: string;
  /** Accent for the LIVE badge / swatch — typically emerald. */
  colorHex: string;
  lat?: number;
  lon?: number;
  speedKn?: number | null;
  heading?: number | null;
  course?: number | null;
  state?: string;
  navStatus?: string | null;
  destination?: string | null;
  aisPositionAt?: string | null;
  isStale?: boolean;
  /** Active passage started at (ISO). */
  startTime?: string;
  distanceNm?: number;
  pointCount?: number;
  routeLabel?: string;
};

/**
 * Hover popup for an in-progress (live) track — GPS, SOG, COG/HDG, AIS
 * nav status, destination, and how far the active passage has run.
 */
export function renderLiveTrackPopupHtml(props: LiveTrackPopupProps): string {
  const {
    vesselName,
    colorHex,
    lat,
    lon,
    speedKn,
    heading,
    course,
    state,
    navStatus,
    destination,
    aisPositionAt,
    isStale,
    startTime,
    distanceNm,
    pointCount,
    routeLabel,
  } = props;

  const gps =
    typeof lat === 'number' && typeof lon === 'number'
      ? formatLatLon(lat, lon)
      : '—';
  const speed =
    typeof speedKn === 'number' ? `${formatNumber(speedKn, 1)} kn` : '—';
  const bearing =
    typeof heading === 'number'
      ? `${Math.round(heading)}° HDG`
      : typeof course === 'number'
        ? `${Math.round(course)}° COG`
        : null;
  const stateLabel = formatLiveState(state);
  const navLabel = navStatus && navStatus.trim() ? navStatus.trim() : null;
  const destLabel =
    destination && destination.trim() && destination.trim() !== '0'
      ? destination.trim()
      : null;
  const fixAge = formatFixAge(aisPositionAt);
  const runDistance =
    typeof distanceNm === 'number'
      ? `${formatNumber(distanceNm, distanceNm < 10 ? 1 : 0)} NM so far`
      : null;
  const runStarted = startTime ? formatStarted(startTime) : null;
  const fixes =
    typeof pointCount === 'number' ? `${formatNumber(pointCount, 0)} fixes` : null;

  const rows: Array<{ label: string; value: string }> = [
    { label: 'Position', value: gps },
    { label: 'Speed', value: speed },
  ];
  if (bearing) rows.push({ label: 'Course', value: bearing });
  if (navLabel) rows.push({ label: 'AIS status', value: navLabel });
  if (destLabel) rows.push({ label: 'Destination', value: destLabel });
  if (runDistance) rows.push({ label: 'Active run', value: runDistance });

  const grid = rows
    .map(
      (r) => `
        <div>
          <p class="passages-popup-label">${escapeHtml(r.label)}</p>
          <p class="passages-popup-value passages-popup-value--sm">${escapeHtml(r.value)}</p>
        </div>`,
    )
    .join('');

  const footBits = [runStarted, fixes, fixAge, isStale ? 'stale fix' : null].filter(
    Boolean,
  ) as string[];

  return `
    <div class="passages-popup-body passages-popup-body--live">
      <div class="passages-popup-header">
        <span class="passages-popup-swatch" style="background:${escapeAttr(colorHex)};box-shadow:0 0 10px ${escapeAttr(colorHex)}66"></span>
        <div class="passages-popup-title">
          <p class="passages-popup-vessel">${escapeHtml(vesselName)}</p>
          <p class="passages-popup-eyebrow passages-popup-eyebrow--live">
            Live · ${escapeHtml(stateLabel)}
          </p>
        </div>
      </div>
      ${routeLabel ? `<p class="passages-popup-route">${escapeHtml(routeLabel)}</p>` : ''}
      <div class="passages-popup-grid passages-popup-grid--live">${grid}</div>
      ${
        footBits.length
          ? `<p class="passages-popup-foot">${escapeHtml(footBits.join(' · '))}</p>`
          : ''
      }
    </div>
  `.trim();
}

function formatLatLon(lat: number, lon: number): string {
  const latAbs = Math.abs(lat).toFixed(4);
  const lonAbs = Math.abs(lon).toFixed(4);
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `${latAbs}° ${ns}, ${lonAbs}° ${ew}`;
}

function formatLiveState(state?: string): string {
  if (!state) return 'Underway';
  if (state === 'underway') return 'Underway';
  if (state === 'at-anchor') return 'At anchor';
  if (state === 'in-port') return 'In port';
  if (state === 'in-yard') return 'In yard';
  return state;
}

function formatStarted(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `since ${d.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

function formatFixAge(iso?: string | null): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  const mins = Math.max(0, Math.round((Date.now() - ms) / 60_000));
  if (mins < 1) return 'fix just now';
  if (mins < 60) return `fix ${mins}m ago`;
  const hours = Math.round(mins / 60);
  return `fix ${hours}h ago`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}
