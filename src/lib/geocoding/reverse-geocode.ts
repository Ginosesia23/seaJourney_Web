/** In-memory cache for the lifetime of the server process. */
const geocodeCache = new Map<string, string | null>();

function coordCacheKey(lat: number, lon: number): string {
  return `${lat.toFixed(3)},${lon.toFixed(3)}`;
}

function buildPlaceLabel(data: Record<string, unknown>): string | null {
  const city = typeof data.city === 'string' ? data.city.trim() : '';
  const locality = typeof data.locality === 'string' ? data.locality.trim() : '';
  const region =
    typeof data.principalSubdivision === 'string' ? data.principalSubdivision.trim() : '';
  const country = typeof data.countryName === 'string' ? data.countryName.trim() : '';

  const primary = city || locality || region;
  if (!primary && !country) return null;
  if (!primary) return country;
  if (country && primary !== country && !primary.includes(country)) {
    return `${primary}, ${country}`;
  }
  return primary;
}

/**
 * Resolve lat/lon to a short place name (city/locality + country when available).
 * Uses BigDataCloud's free client endpoint — no API key required.
 */
export async function reverseGeocodePlaceName(
  lat: number,
  lon: number,
): Promise<string | null> {
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
    const label = buildPlaceLabel(data);
    geocodeCache.set(key, label);
    return label;
  } catch {
    geocodeCache.set(key, null);
    return null;
  }
}

export async function reverseGeocodePlaceNamesBatch(
  coordinates: Array<{ lat: number; lon: number }>,
): Promise<Map<string, string | null>> {
  const results = new Map<string, string | null>();
  const unique = new Map<string, { lat: number; lon: number }>();

  for (const { lat, lon } of coordinates) {
    const key = coordCacheKey(lat, lon);
    if (!unique.has(key)) unique.set(key, { lat, lon });
  }

  await Promise.all(
    [...unique.entries()].map(async ([key, { lat, lon }]) => {
      const name = await reverseGeocodePlaceName(lat, lon);
      results.set(key, name);
    }),
  );

  return results;
}

export { coordCacheKey as geocodeCoordCacheKey };
