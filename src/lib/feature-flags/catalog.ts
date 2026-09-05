/**
 * Catalog of product features that admins can enable/disable in production.
 * Keys must match rows in `platform_feature_flags` (seeded by SQL migration).
 *
 * Missing DB row → treated as enabled (fail-open until migration is applied).
 * Admins always bypass disabled flags in the UI so they can still test.
 */

export type FeatureAudience = 'crew' | 'vessel' | 'both';

export type FeatureFlagKey =
  | 'passages_map'
  | 'passage_logbook'
  | 'ais_history_import'
  | 'ais_live_tracking'
  | 'visa_tracker'
  | 'bridge_watch_log'
  | 'watch_schedule'
  | 'crew_rotation'
  | 'testimonials'
  | 'apply_tickets'
  | 'career_progress'
  | 'vessel_document_generator'
  | 'certificates'
  | 'proof_of_service'
  | 'sea_time_request'
  | 'export_reports'
  | 'vessel_team_accounts';

export type FeatureFlagDefinition = {
  key: FeatureFlagKey;
  label: string;
  description: string;
  audience: FeatureAudience;
  /** Dashboard routes hidden when disabled (non-admin). */
  routes: string[];
  /** Default when no DB row exists. */
  defaultEnabled: boolean;
  /** Lowest crew tier with access when globally enabled (higher tiers inherit). */
  defaultMinCrewTier?: string | null;
  /** Lowest vessel tier with access when globally enabled (higher tiers inherit). */
  defaultMinVesselTier?: string | null;
};

export const FEATURE_FLAG_CATALOG: FeatureFlagDefinition[] = [
  {
    key: 'passages_map',
    label: 'Passage tracks (AIS map)',
    description:
      'Visual AIS passage map for crew Professional and vessel Premium+.',
    audience: 'both',
    routes: ['/dashboard/passages-map'],
    defaultEnabled: true,
    defaultMinCrewTier: 'premium',
    defaultMinVesselTier: 'vessel_basic',
  },
  {
    key: 'passage_logbook',
    label: 'Passage log book',
    description: 'Manual / AIS-linked voyage logbook.',
    audience: 'both',
    routes: ['/dashboard/passage-logbook'],
    defaultEnabled: true,
    defaultMinCrewTier: 'premium',
    defaultMinVesselTier: 'vessel_lite',
  },
  {
    key: 'ais_history_import',
    label: 'AIS history import',
    description: 'Import historical AIS positions into the calendar / state log.',
    audience: 'both',
    routes: ['/dashboard/ais-import'],
    defaultEnabled: true,
    defaultMinCrewTier: 'premium',
    defaultMinVesselTier: 'vessel_basic',
  },
  {
    key: 'ais_live_tracking',
    label: 'Live AIS tracking',
    description:
      'Opt-in live AIS sync for crew and vessels (dashboard debug + cron eligibility).',
    audience: 'both',
    routes: [],
    defaultEnabled: true,
    defaultMinCrewTier: 'premium',
    defaultMinVesselTier: 'vessel_basic',
  },
  {
    key: 'visa_tracker',
    label: 'Visa tracker',
    description: 'Crew Schengen / visa day tracking.',
    audience: 'crew',
    routes: ['/dashboard/visa-tracker'],
    defaultEnabled: true,
    defaultMinCrewTier: 'premium',
  },
  {
    key: 'bridge_watch_log',
    label: 'Bridge watch log',
    description: 'Crew bridge watch hours log.',
    audience: 'crew',
    routes: ['/dashboard/bridge-watch-log'],
    defaultEnabled: true,
    defaultMinCrewTier: 'premium',
  },
  {
    key: 'watch_schedule',
    label: 'Watch roster',
    description: 'Vessel crew watch schedule and crew “My watch roster”.',
    audience: 'both',
    routes: ['/dashboard/watch-schedule', '/dashboard/my-watch-schedule'],
    defaultEnabled: true,
    defaultMinCrewTier: 'premium',
    defaultMinVesselTier: 'vessel_basic',
  },
  {
    key: 'crew_rotation',
    label: 'Onboard crew tracker',
    description: 'Vessel onboard / rotation tracker.',
    audience: 'vessel',
    routes: ['/dashboard/crew-rotation'],
    defaultEnabled: true,
    defaultMinVesselTier: 'vessel_basic',
  },
  {
    key: 'testimonials',
    label: 'Testimonials',
    description: 'Crew sea-time testimonials / applications list.',
    audience: 'crew',
    routes: ['/dashboard/career-documents', '/dashboard/applications'],
    defaultEnabled: true,
    defaultMinCrewTier: 'premium',
  },
  {
    key: 'apply_tickets',
    label: 'Apply for tickets',
    description: 'Crew ticket / certificate application templates.',
    audience: 'crew',
    routes: ['/dashboard/apply'],
    defaultEnabled: true,
    defaultMinCrewTier: 'premium',
  },
  {
    key: 'career_progress',
    label: 'Career progress',
    description:
      'Crew career ladder — next-ticket requirements and milestone tracking.',
    audience: 'crew',
    routes: ['/dashboard/career-progress'],
    defaultEnabled: true,
    defaultMinCrewTier: 'premium',
  },
  {
    key: 'vessel_document_generator',
    label: 'Vessel document generator',
    description: 'Vessel Form Builder / document generator.',
    audience: 'vessel',
    routes: ['/dashboard/documents'],
    defaultEnabled: true,
    defaultMinVesselTier: 'vessel_basic',
  },
  {
    key: 'certificates',
    label: 'Certificates',
    description: 'Crew certificate vault.',
    audience: 'crew',
    routes: ['/dashboard/certificates'],
    defaultEnabled: true,
    defaultMinCrewTier: 'premium',
  },
  {
    key: 'proof_of_service',
    label: 'Proof of service',
    description: 'Crew proof-of-service documents.',
    audience: 'crew',
    routes: ['/dashboard/career-documents', '/dashboard/proof-of-service'],
    defaultEnabled: true,
    defaultMinCrewTier: 'premium',
  },
  {
    key: 'sea_time_request',
    label: 'Sea-time access request',
    description: 'Crew request access to vessel sea-time data.',
    audience: 'crew',
    routes: ['/dashboard/sea-time-request'],
    defaultEnabled: true,
    defaultMinCrewTier: 'premium',
  },
  {
    key: 'export_reports',
    label: 'Export reports',
    description: 'Sea-time / report PDF exports.',
    audience: 'both',
    routes: ['/dashboard/export'],
    defaultEnabled: true,
    defaultMinCrewTier: 'premium',
    defaultMinVesselTier: 'vessel_lite',
  },
  {
    key: 'vessel_team_accounts',
    label: 'Vessel team accounts',
    description: 'Vessel Pro linked team accounts (Vessel Roles).',
    audience: 'vessel',
    routes: ['/dashboard/vessel-roles'],
    defaultEnabled: true,
    defaultMinVesselTier: 'vessel_basic',
  },
];

export const FEATURE_FLAG_KEYS = FEATURE_FLAG_CATALOG.map((f) => f.key);

export function getFeatureDefinition(
  key: string,
): FeatureFlagDefinition | undefined {
  return FEATURE_FLAG_CATALOG.find((f) => f.key === key);
}

function normalizeDashboardPath(pathname: string): string {
  return pathname.split('?')[0].replace(/\/$/, '') || pathname;
}

function routeMatchesPath(pathname: string, route: string): boolean {
  const path = normalizeDashboardPath(pathname);
  return path === route || path.startsWith(`${route}/`);
}

/** First matching feature flag for a route (legacy / single-flag callers). */
export function featureFlagForRoute(pathname: string): FeatureFlagKey | null {
  for (const feature of FEATURE_FLAG_CATALOG) {
    for (const route of feature.routes) {
      if (routeMatchesPath(pathname, route)) {
        return feature.key;
      }
    }
  }
  return null;
}

/** All feature flags that gate a dashboard route (some routes map to multiple flags). */
export function featureFlagsForRoute(pathname: string): FeatureFlagKey[] {
  const keys: FeatureFlagKey[] = [];
  for (const feature of FEATURE_FLAG_CATALOG) {
    for (const route of feature.routes) {
      if (routeMatchesPath(pathname, route)) {
        keys.push(feature.key);
        break;
      }
    }
  }
  return keys;
}

/** Resolve enabled map from catalog defaults + DB overrides. */
export function resolveFeatureEnabledMap(
  rows: Array<{ key: string; enabled: boolean }> | null | undefined,
): Record<FeatureFlagKey, boolean> {
  const map = {} as Record<FeatureFlagKey, boolean>;
  for (const def of FEATURE_FLAG_CATALOG) {
    map[def.key] = def.defaultEnabled;
  }
  for (const row of rows || []) {
    if ((FEATURE_FLAG_KEYS as string[]).includes(row.key)) {
      map[row.key as FeatureFlagKey] = !!row.enabled;
    }
  }
  return map;
}

export function isFeatureEnabledInMap(
  map: Record<string, boolean> | null | undefined,
  key: FeatureFlagKey,
  opts?: { isAdmin?: boolean },
): boolean {
  if (opts?.isAdmin) return true;
  if (!map) {
    const def = getFeatureDefinition(key);
    return def?.defaultEnabled ?? true;
  }
  if (key in map) return !!map[key];
  return getFeatureDefinition(key)?.defaultEnabled ?? true;
}
