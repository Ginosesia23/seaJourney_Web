/**
 * Place-name heuristics for AIS moored vs at-anchor decisions.
 *
 * Reverse geocoders often attach a locality (or even a "city") to coastal
 * nature parks and roadsteads. Those must not count as a berth / marina.
 */

/** True when the label clearly points at a marina, harbour, or yard berth. */
export function placeNameSuggestsBerth(placeName: string | null | undefined): boolean {
  if (!placeName) return false;
  const s = placeName.toLowerCase();
  return (
    /\bmarina\b/.test(s) ||
    /\bharbou?r\b/.test(s) ||
    /\bport\b/.test(s) ||
    /\bdock\b/.test(s) ||
    /\bquay\b/.test(s) ||
    /\bwharf\b/.test(s) ||
    /\bshipyard\b/.test(s) ||
    /\byacht\s*club\b/.test(s) ||
    /\bboatyard\b/.test(s) ||
    /\bmarina\b/.test(s)
  );
}

/**
 * True when the label is a park / reserve / open coastal feature — not a
 * place we should treat as Moored from geocode alone.
 */
export function placeNameSuggestsOpenWaterOrPark(
  placeName: string | null | undefined,
): boolean {
  if (!placeName) return false;
  const s = placeName.toLowerCase();
  return (
    /\bmarine\s+park\b/.test(s) ||
    /\bnational\s+park\b/.test(s) ||
    /\bnature\s+(park|reserve)\b/.test(s) ||
    /\bnatural\s+(park|reserve|marine)\b/.test(s) ||
    /\bprotected\s+area\b/.test(s) ||
    /\bparc\s+naturel\b/.test(s) ||
    /\br[eé]serve\b/.test(s) ||
    /\banchorage\b/.test(s) ||
    /\broadstead\b/.test(s) ||
    /\broads\b/.test(s) ||
    /\boffshore\b/.test(s)
  );
}

/**
 * Whether geocode evidence is strong enough to call Moored.
 * Parks / reserves never qualify; bare city/locality does unless it's a park name.
 */
export function geocodeSuggestsMoored(opts: {
  inPopulatedArea?: boolean | null;
  placeName?: string | null;
}): boolean {
  const name = opts.placeName ?? null;
  if (placeNameSuggestsOpenWaterOrPark(name)) return false;
  if (placeNameSuggestsBerth(name)) return true;
  return opts.inPopulatedArea === true;
}
