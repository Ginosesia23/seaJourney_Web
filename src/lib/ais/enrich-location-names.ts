import type { AisHistoryPreviewDay } from '@/lib/ais/historical-import';
import {
  geocodeCoordCacheKey,
  reverseGeocodePlaceNamesBatch,
} from '@/lib/geocoding/reverse-geocode';

export async function enrichPreviewDaysWithLocationNames(
  days: AisHistoryPreviewDay[],
): Promise<AisHistoryPreviewDay[]> {
  const coordinates = days
    .filter(
      (day): day is AisHistoryPreviewDay & { latitude: number; longitude: number } =>
        day.latitude != null && day.longitude != null,
    )
    .map((day) => ({ lat: day.latitude, lon: day.longitude }));

  if (coordinates.length === 0) {
    return days.map((day) => ({ ...day, locationName: null }));
  }

  const namesByKey = await reverseGeocodePlaceNamesBatch(coordinates);

  return days.map((day) => {
    if (day.latitude == null || day.longitude == null) {
      return { ...day, locationName: null };
    }

    const key = geocodeCoordCacheKey(day.latitude, day.longitude);
    return {
      ...day,
      locationName: namesByKey.get(key) ?? null,
    };
  });
}
