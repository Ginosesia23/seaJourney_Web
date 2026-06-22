export type ReverseGeocodeStructured = {
  /** Display label, e.g. "Genoa, Italy" or just "Italy" for offshore points. */
  label: string | null;
  /**
   * True only when BigDataCloud resolved the position to a specific city or
   * locality (not just a country/region). This is a much stricter signal of
   * "vessel is in a populated coastal area" than checking whether `label` has
   * a comma — `principalSubdivision` (state/province) is set even for points
   * many NM offshore.
   */
  inPopulatedArea: boolean;
};

/** In-memory cache for the lifetime of the server process. */
const geocodeCache = new Map<string, ReverseGeocodeStructured | null>();

function coordCacheKey(lat: number, lon: number): string {
  return `${lat.toFixed(3)},${lon.toFixed(3)}`;
}

function buildStructuredResult(data: Record<string, unknown>): ReverseGeocodeStructured {
  const city = typeof data.city === 'string' ? data.city.trim() : '';
  const locality = typeof data.locality === 'string' ? data.locality.trim() : '';
  const region =
    typeof data.principalSubdivision === 'string' ? data.principalSubdivision.trim() : '';
  const country = typeof data.countryName === 'string' ? data.countryName.trim() : '';

  const primary = city || locality || region;
  let label: string | null;
  if (!primary && !country) {
    label = null;
  } else if (!primary) {
    label = country;
  } else if (country && primary !== country && !primary.includes(country)) {
    label = `${primary}, ${country}`;
  } else {
    label = primary;
  }

  return {
    label,
    inPopulatedArea: Boolean(city || locality),
  };
}

/**
 * Resolve lat/lon to a short place name plus a populated-area flag.
 * Uses BigDataCloud's free client endpoint — no API key required.
 */
export async function reverseGeocodeStructured(
  lat: number,
  lon: number,
): Promise<ReverseGeocodeStructured | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const key = coordCacheKey(lat, lon);
  if (geocodeCache.has(key)) {
    return geocodeCache.get(key) ?? null;
  }

  try {
    const url = new URL('https://api.bigdatacloud.net/data/reverse-geocode-client');
    url.searchParams.set('latitude', String(lat));
    url.searchParams.set('longitude', String(lon));
    url.searchParams.set('localityLanguage', 'en');

    const res = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
      cache: 'force-cache',
      next: { revalidate: 60 * 60 * 24 * 7 },
    });

    if (!res.ok) {
      geocodeCache.set(key, null);
      return null;
    }

    const data = (await res.json()) as Record<string, unknown>;
    const result = buildStructuredResult(data);
    geocodeCache.set(key, result);
    return result;
  } catch {
    geocodeCache.set(key, null);
    return null;
  }
}

/** Convenience wrapper preserving the original "label only" API. */
export async function reverseGeocodePlaceName(
  lat: number,
  lon: number,
): Promise<string | null> {
  const r = await reverseGeocodeStructured(lat, lon);
  return r?.label ?? null;
}

export async function reverseGeocodeStructuredBatch(
  coordinates: Array<{ lat: number; lon: number }>,
): Promise<Map<string, ReverseGeocodeStructured | null>> {
  const results = new Map<string, ReverseGeocodeStructured | null>();
  const unique = new Map<string, { lat: number; lon: number }>();

  for (const { lat, lon } of coordinates) {
    const key = coordCacheKey(lat, lon);
    if (!unique.has(key)) unique.set(key, { lat, lon });
  }

  await Promise.all(
    [...unique.entries()].map(async ([key, { lat, lon }]) => {
      const r = await reverseGeocodeStructured(lat, lon);
      results.set(key, r);
    }),
  );

  return results;
}

export async function reverseGeocodePlaceNamesBatch(
  coordinates: Array<{ lat: number; lon: number }>,
): Promise<Map<string, string | null>> {
  const structured = await reverseGeocodeStructuredBatch(coordinates);
  const labels = new Map<string, string | null>();
  for (const [key, value] of structured) {
    labels.set(key, value?.label ?? null);
  }
  return labels;
}

export { coordCacheKey as geocodeCoordCacheKey };
