/**
 * Bridge between AIS Passages Map features and the Passage Log Book.
 *
 * When a tier allows both, we treat AIS geometry as the track source of
 * truth and `passage_logs` as the documentary logbook. Linking is done
 * via `ais_fingerprint` (+ `source: 'ais'`) so the same voyage is not
 * recorded twice independently.
 */

export type AisTrackData = {
  aisFingerprint: string;
  vesselId: string;
  startTime: string;
  endTime: string;
  distanceNm?: number | null;
  avgSpeedKn?: number | null;
  maxSpeedKn?: number | null;
  pointCount?: number | null;
  coordinates?: [number, number][];
};

export function buildAisPassageFingerprint(
  vesselId: string,
  startTime: string,
  endTime: string,
): string {
  return `${vesselId}|${startTime}|${endTime}`;
}

/** Inclusive overlap ratio of [a] relative to the union of both intervals (0–1). */
export function timeOverlapRatio(
  aStartMs: number,
  aEndMs: number,
  bStartMs: number,
  bEndMs: number,
): number {
  const start = Math.max(aStartMs, bStartMs);
  const end = Math.min(aEndMs, bEndMs);
  if (end <= start) return 0;
  const overlap = end - start;
  const union =
    Math.max(aEndMs, bEndMs) - Math.min(aStartMs, bStartMs);
  if (union <= 0) return 0;
  return overlap / union;
}

export function intervalsOverlap(
  aStart: Date | string,
  aEnd: Date | string,
  bStart: Date | string,
  bEnd: Date | string,
): boolean {
  const a0 = new Date(aStart).getTime();
  const a1 = new Date(aEnd).getTime();
  const b0 = new Date(bStart).getTime();
  const b1 = new Date(bEnd).getTime();
  if (![a0, a1, b0, b1].every(Number.isFinite)) return false;
  return a0 <= b1 && b0 <= a1;
}

export type PassageOverlapCandidate = {
  id: string;
  vessel_id: string;
  start_time: string;
  end_time: string;
  source?: string | null;
  ais_fingerprint?: string | null;
  track_data?: unknown;
};

/** Prefer fingerprint match; else time overlap on the same vessel. */
export function findLinkedOrOverlappingPassage(
  logs: PassageOverlapCandidate[],
  opts: {
    vesselId: string;
    startTime: string;
    endTime: string;
    fingerprint?: string | null;
    /** Minimum IoU to treat as the same voyage (default 0.45). */
    minOverlapRatio?: number;
  },
): PassageOverlapCandidate | null {
  const minRatio = opts.minOverlapRatio ?? 0.45;
  if (opts.fingerprint) {
    const byFp = logs.find(
      (l) =>
        l.vessel_id === opts.vesselId &&
        (l.ais_fingerprint === opts.fingerprint ||
          (l.track_data as AisTrackData | null)?.aisFingerprint ===
            opts.fingerprint),
    );
    if (byFp) return byFp;
  }

  const startMs = new Date(opts.startTime).getTime();
  const endMs = new Date(opts.endTime).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;

  let best: PassageOverlapCandidate | null = null;
  let bestRatio = 0;
  for (const log of logs) {
    if (log.vessel_id !== opts.vesselId) continue;
    const ratio = timeOverlapRatio(
      startMs,
      endMs,
      new Date(log.start_time).getTime(),
      new Date(log.end_time).getTime(),
    );
    if (ratio >= minRatio && ratio > bestRatio) {
      best = log;
      bestRatio = ratio;
    }
  }
  return best;
}

export function fingerprintSetFromLogs(
  logs: PassageOverlapCandidate[],
): Set<string> {
  const set = new Set<string>();
  for (const log of logs) {
    if (log.ais_fingerprint) set.add(log.ais_fingerprint);
    const td = log.track_data as AisTrackData | null | undefined;
    if (td?.aisFingerprint) set.add(td.aisFingerprint);
  }
  return set;
}

export function isAisSourcedPassage(source?: string | null): boolean {
  const s = (source || '').toLowerCase();
  return s === 'ais' || s === 'ais_assisted' || s === 'ais_promoted';
}

export function passageSourceLabel(source?: string | null): string {
  const s = (source || 'manual').toLowerCase();
  if (s === 'ais' || s === 'ais_promoted') return 'AIS';
  if (s === 'ais_assisted') return 'AIS-assisted';
  if (s === 'calendar') return 'Calendar';
  return 'Manual';
}

export type LogbookLinkRow = {
  passageId: string;
  vesselId: string;
  fingerprint: string | null;
  startTime: string;
  endTime: string;
  source: string | null;
};

/**
 * True when an AIS map voyage is already represented in the logbook —
 * either by exact fingerprint or by time-overlap on the same vessel.
 */
export function isAisVoyageLinkedToLogbook(
  opts: {
    vesselId: string;
    startTime: string;
    endTime: string;
    fingerprint?: string | null;
  },
  fingerprints: Set<string>,
  links: LogbookLinkRow[],
): boolean {
  const fingerprint =
    opts.fingerprint ||
    buildAisPassageFingerprint(opts.vesselId, opts.startTime, opts.endTime);
  if (fingerprints.has(fingerprint)) return true;
  return !!findLinkedOrOverlappingPassage(
    links.map((l) => ({
      id: l.passageId,
      vessel_id: l.vesselId,
      start_time: l.startTime,
      end_time: l.endTime,
      ais_fingerprint: l.fingerprint,
      source: l.source,
    })),
    {
      vesselId: opts.vesselId,
      startTime: opts.startTime,
      endTime: opts.endTime,
      fingerprint,
    },
  );
}

export function endpointsFromLineCoordinates(
  coordinates: [number, number][] | undefined,
): {
  departureLon: number | null;
  departureLat: number | null;
  arrivalLon: number | null;
  arrivalLat: number | null;
} {
  if (!coordinates || coordinates.length < 2) {
    return {
      departureLon: null,
      departureLat: null,
      arrivalLon: null,
      arrivalLat: null,
    };
  }
  const [dLon, dLat] = coordinates[0];
  const [aLon, aLat] = coordinates[coordinates.length - 1];
  return {
    departureLon: dLon,
    departureLat: dLat,
    arrivalLon: aLon,
    arrivalLat: aLat,
  };
}

/** AIS passage feature as used for matching against logbook rows. */
export type AisPassageCandidate = {
  vesselId: string;
  startTime: string;
  endTime: string;
  distanceNm?: number | null;
  avgSpeedKn?: number | null;
  maxSpeedKn?: number | null;
  pointCount?: number | null;
  coordinates?: [number, number][];
};

export function isPlaceholderPort(port?: string | null): boolean {
  const p = (port || '').trim().toLowerCase();
  if (!p) return true;
  return (
    p === 'to be confirmed' ||
    p === 'tbc' ||
    p === 'open sea' ||
    p === 'open-sea' ||
    p === 'unknown' ||
    p === '—' ||
    p === '-'
  );
}

export function passageNeedsAisEnrichment(log: {
  distance_nm?: number | null;
  avg_speed_knots?: number | null;
  ais_fingerprint?: string | null;
  departure_port?: string | null;
  arrival_port?: string | null;
  departure_lat?: number | null;
  arrival_lat?: number | null;
}): boolean {
  if (!log.ais_fingerprint) return true;
  if (log.distance_nm == null || !(Number(log.distance_nm) > 0)) return true;
  if (log.avg_speed_knots == null || !(Number(log.avg_speed_knots) > 0)) return true;
  if (isPlaceholderPort(log.departure_port) || isPlaceholderPort(log.arrival_port))
    return true;
  if (log.departure_lat == null || log.arrival_lat == null) return true;
  return false;
}

/**
 * Find the best AIS map passage for a logbook row (inverse of
 * findLinkedOrOverlappingPassage). Fingerprint first, else best IoU.
 */
export function findBestAisMatchForLog(
  log: PassageOverlapCandidate,
  aisPassages: AisPassageCandidate[],
  opts?: { minOverlapRatio?: number },
): { match: AisPassageCandidate; overlapRatio: number; method: 'fingerprint' | 'overlap' } | null {
  const minRatio = opts?.minOverlapRatio ?? 0.45;
  const fingerprint =
    log.ais_fingerprint ||
    (log.track_data as AisTrackData | null | undefined)?.aisFingerprint ||
    null;

  if (fingerprint) {
    const byFp = aisPassages.find(
      (a) =>
        a.vesselId === log.vessel_id &&
        buildAisPassageFingerprint(a.vesselId, a.startTime, a.endTime) ===
          fingerprint,
    );
    if (byFp) {
      return { match: byFp, overlapRatio: 1, method: 'fingerprint' };
    }
  }

  const startMs = new Date(log.start_time).getTime();
  const endMs = new Date(log.end_time).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;

  let best: AisPassageCandidate | null = null;
  let bestRatio = 0;
  for (const a of aisPassages) {
    if (a.vesselId !== log.vessel_id) continue;
    const ratio = timeOverlapRatio(
      startMs,
      endMs,
      new Date(a.startTime).getTime(),
      new Date(a.endTime).getTime(),
    );
    if (ratio >= minRatio && ratio > bestRatio) {
      best = a;
      bestRatio = ratio;
    }
  }
  if (!best) return null;
  return { match: best, overlapRatio: bestRatio, method: 'overlap' };
}

export type EnrichmentPatch = {
  startTime?: string;
  endTime?: string;
  distanceNm?: number;
  avgSpeedKnots?: number;
  departurePort?: string;
  arrivalPort?: string;
  departureLat?: number;
  departureLon?: number;
  arrivalLat?: number;
  arrivalLon?: number;
  aisFingerprint: string;
  trackData: AisTrackData;
  source?: string;
  fieldsFilled: string[];
};

/**
 * Build a fill-missing patch from an AIS match. Never overwrites
 * user-entered distance/speed/ports unless opts say so.
 */
export function buildEnrichmentPatch(
  log: {
    start_time: string;
    end_time: string;
    distance_nm?: number | null;
    avg_speed_knots?: number | null;
    departure_port?: string | null;
    arrival_port?: string | null;
    departure_lat?: number | null;
    departure_lon?: number | null;
    arrival_lat?: number | null;
    arrival_lon?: number | null;
    source?: string | null;
    ais_fingerprint?: string | null;
  },
  ais: AisPassageCandidate,
  opts?: {
    updateTimes?: boolean;
    overwriteDistance?: boolean;
    overwritePorts?: boolean;
    departurePortHint?: string | null;
    arrivalPortHint?: string | null;
  },
): EnrichmentPatch | null {
  const updateTimes = opts?.updateTimes !== false;
  const overwriteDistance = opts?.overwriteDistance === true;
  const overwritePorts = opts?.overwritePorts === true;
  const fingerprint = buildAisPassageFingerprint(
    ais.vesselId,
    ais.startTime,
    ais.endTime,
  );
  const ends = endpointsFromLineCoordinates(ais.coordinates);
  const fieldsFilled: string[] = [];
  const patch: EnrichmentPatch = {
    aisFingerprint: fingerprint,
    trackData: {
      aisFingerprint: fingerprint,
      vesselId: ais.vesselId,
      startTime: ais.startTime,
      endTime: ais.endTime,
      distanceNm: ais.distanceNm ?? null,
      avgSpeedKn: ais.avgSpeedKn ?? null,
      maxSpeedKn: ais.maxSpeedKn ?? null,
      pointCount: ais.pointCount ?? null,
      coordinates: ais.coordinates,
    },
    fieldsFilled,
  };

  if (updateTimes) {
    if (log.start_time !== ais.startTime) {
      patch.startTime = ais.startTime;
      fieldsFilled.push('startTime');
    }
    if (log.end_time !== ais.endTime) {
      patch.endTime = ais.endTime;
      fieldsFilled.push('endTime');
    }
  }

  const hasDistance = log.distance_nm != null && Number(log.distance_nm) > 0;
  if ((!hasDistance || overwriteDistance) && ais.distanceNm != null && ais.distanceNm > 0) {
    patch.distanceNm = ais.distanceNm;
    fieldsFilled.push('distanceNm');
  }

  const hasSpeed =
    log.avg_speed_knots != null && Number(log.avg_speed_knots) > 0;
  if ((!hasSpeed || overwriteDistance) && ais.avgSpeedKn != null && ais.avgSpeedKn > 0) {
    patch.avgSpeedKnots = ais.avgSpeedKn;
    fieldsFilled.push('avgSpeedKnots');
  }

  const depHint = opts?.departurePortHint?.trim() || null;
  const arrHint = opts?.arrivalPortHint?.trim() || null;
  if (overwritePorts || isPlaceholderPort(log.departure_port)) {
    if (depHint) {
      patch.departurePort = depHint;
      fieldsFilled.push('departurePort');
    }
  }
  if (overwritePorts || isPlaceholderPort(log.arrival_port)) {
    if (arrHint) {
      patch.arrivalPort = arrHint;
      fieldsFilled.push('arrivalPort');
    }
  }

  if (log.departure_lat == null && ends.departureLat != null) {
    patch.departureLat = ends.departureLat;
    patch.departureLon = ends.departureLon ?? undefined;
    fieldsFilled.push('departureCoords');
  }
  if (log.arrival_lat == null && ends.arrivalLat != null) {
    patch.arrivalLat = ends.arrivalLat;
    patch.arrivalLon = ends.arrivalLon ?? undefined;
    fieldsFilled.push('arrivalCoords');
  }

  // Always link fingerprint / track snapshot when applying.
  fieldsFilled.push('aisFingerprint');

  const src = (log.source || '').toLowerCase();
  if (src !== 'ais' && src !== 'ais_assisted' && src !== 'ais_promoted') {
    patch.source = 'ais_assisted';
    fieldsFilled.push('source');
  }

  // Nothing actionable beyond re-linking fingerprint?
  const actionable = fieldsFilled.some(
    (f) => f !== 'aisFingerprint' && f !== 'source',
  );
  if (!actionable && log.ais_fingerprint === fingerprint) {
    return null;
  }
  return patch;
}
