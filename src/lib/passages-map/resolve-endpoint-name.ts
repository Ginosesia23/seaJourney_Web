/**
 * Server-side passage endpoint naming from GPS.
 *
 * Prefers curated yacht/port hubs, then BigDataCloud reverse geocode,
 * then a "Near X" curated fallback, then a compact lat/lon label.
 * Never persists "Open sea" when coordinates are available.
 */

import { reverseGeocodePlaceName } from '@/lib/geocoding/reverse-geocode';
import {
  CLOSE_MATCH_NM,
  NEAR_MATCH_NM,
  findNearestPort,
  formatLatLonLabel,
} from './nearest-port';

/** Prefer a short primary place name for logbook port fields. */
function shortenPlaceLabel(label: string | null | undefined): string | null {
  if (!label) return null;
  const trimmed = label.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) return `${parts[0]}, ${parts[1]}`;
  return parts[0] ?? trimmed;
}

/**
 * Resolve one endpoint name from GPS for persistence in passage_logs.
 */
export async function resolveEndpointNameFromGps(
  lat: number | null | undefined,
  lon: number | null | undefined,
): Promise<string> {
  if (
    lat == null ||
    lon == null ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lon)
  ) {
    return 'Unknown';
  }

  const close = findNearestPort(lat, lon, { maxDistanceNm: CLOSE_MATCH_NM });
  if (close) return close.name;

  try {
    const geo = await reverseGeocodePlaceName(lat, lon);
    const cleaned = shortenPlaceLabel(geo);
    if (cleaned) return cleaned;
  } catch {
    /* fall through */
  }

  const near = findNearestPort(lat, lon, { maxDistanceNm: NEAR_MATCH_NM });
  if (near) return `Near ${near.name}`;

  return formatLatLonLabel(lat, lon);
}

export async function resolvePassageEndpointNames(opts: {
  departureLat?: number | null;
  departureLon?: number | null;
  arrivalLat?: number | null;
  arrivalLon?: number | null;
}): Promise<{ departurePort: string; arrivalPort: string }> {
  const [departurePort, arrivalPort] = await Promise.all([
    resolveEndpointNameFromGps(opts.departureLat, opts.departureLon),
    resolveEndpointNameFromGps(opts.arrivalLat, opts.arrivalLon),
  ]);
  return { departurePort, arrivalPort };
}
