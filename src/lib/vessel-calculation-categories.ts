/**
 * Vessel calculation categories for sea time.
 * Different vessel types use different rules (yacht/MCA vs commercial).
 */

export type VesselCalculationCategory =
  | 'yacht_class'
  | 'commercial_class'
  | 'passenger_commercial_class'
  | 'fishing_class'
  | 'other_class';

const YACHT_CLASS_TYPES = [
  'motor-yacht',
  'sailing-yacht',
  'catamaran',
  'superyacht',
  'megayacht',
  'passenger-yacht',
] as const;

const COMMERCIAL_CLASS_TYPES = ['cargo-ship', 'container-ship', 'tanker'] as const;

const PASSENGER_COMMERCIAL_CLASS_TYPES = ['cruise-ship', 'ferry'] as const;

const FISHING_CLASS_TYPES = ['fishing-vessel', 'trawler'] as const;

const OTHER_CLASS_TYPES = ['research-vessel', 'offshore-vessel', 'other'] as const;

const vesselTypeToCategory: Record<string, VesselCalculationCategory> = {};
YACHT_CLASS_TYPES.forEach((t) => { vesselTypeToCategory[t] = 'yacht_class'; });
COMMERCIAL_CLASS_TYPES.forEach((t) => { vesselTypeToCategory[t] = 'commercial_class'; });
PASSENGER_COMMERCIAL_CLASS_TYPES.forEach((t) => { vesselTypeToCategory[t] = 'passenger_commercial_class'; });
FISHING_CLASS_TYPES.forEach((t) => { vesselTypeToCategory[t] = 'fishing_class'; });
OTHER_CLASS_TYPES.forEach((t) => { vesselTypeToCategory[t] = 'other_class'; });

/**
 * Get the calculation category for a vessel type (e.g. from vessel.type).
 * Unknown types default to yacht_class (current MCA-style rules).
 */
export function getVesselCalculationCategory(
  vesselType: string | null | undefined
): VesselCalculationCategory {
  if (!vesselType || typeof vesselType !== 'string') return 'yacht_class';
  const category = vesselTypeToCategory[vesselType.trim().toLowerCase()];
  return category ?? 'yacht_class';
}

/**
 * For commercial_class and passenger_commercial_class, all days onboard count as sea time
 * except on-leave. So: at_sea = total - leave, standby = 0, yard = 0.
 * Yacht, fishing, and other use the existing MCA-style rules.
 */
export function isAllDaysExceptLeaveCountAsSea(
  category: VesselCalculationCategory
): boolean {
  return category === 'commercial_class' || category === 'passenger_commercial_class';
}
