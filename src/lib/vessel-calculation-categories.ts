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

/** Human-readable labels and descriptions for the dashboard/calculations page */
export const VESSEL_CALCULATION_CATEGORY_LABELS: Record<
  VesselCalculationCategory,
  { label: string; shortDescription: string }
> = {
  yacht_class: {
    label: 'Yacht class',
    shortDescription: 'MCA/PYA rules: at sea, standby, yard and leave are calculated separately. Standby is limited by preceding voyage sea days.',
  },
  commercial_class: {
    label: 'Commercial class',
    shortDescription: 'All days onboard count as sea time except on-leave. No separate standby or yard breakdown.',
  },
  passenger_commercial_class: {
    label: 'Passenger commercial class',
    shortDescription: 'Same as commercial: all days onboard count as sea time except on-leave.',
  },
  fishing_class: {
    label: 'Fishing class',
    shortDescription: 'MCA-style rules: at sea, standby, yard and leave calculated as for yacht class.',
  },
  other_class: {
    label: 'Other class',
    shortDescription: 'MCA-style rules: at sea, standby, yard and leave calculated as for yacht class.',
  },
};

/** Vessel types grouped by calculation category (for display on calculations page) */
export const VESSEL_TYPES_BY_CATEGORY: Record<VesselCalculationCategory, readonly string[]> = {
  yacht_class: YACHT_CLASS_TYPES,
  commercial_class: COMMERCIAL_CLASS_TYPES,
  passenger_commercial_class: PASSENGER_COMMERCIAL_CLASS_TYPES,
  fishing_class: FISHING_CLASS_TYPES,
  other_class: OTHER_CLASS_TYPES,
};
