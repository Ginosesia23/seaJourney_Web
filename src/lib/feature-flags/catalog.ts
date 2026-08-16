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
  },
  {
    key: 'passage_logbook',
    label: 'Passage log book',
    description: 'Manual / AIS-linked voyage logbook.',
    audience: 'both',
    routes: ['/dashboard/passage-logbook'],
    defaultEnabled: true,
  },
  {
    key: 'ais_history_import',
    label: 'AIS history import',
    description: 'Import historical AIS positions into the calendar / state log.',
    audience: 'both',
    routes: ['/dashboard/ais-import'],
    defaultEnabled: true,
  },
  {
    key: 'ais_live_tracking',
    label: 'Live AIS tracking',
    description:
      'Opt-in live AIS sync for crew and vessels (dashboard debug + cron eligibility).',
    audience: 'both',
    routes: [],
    defaultEnabled: true,
  },
  {
    key: 'visa_tracker',
    label: 'Visa tracker',
    description: 'Crew Schengen / visa day tracking.',
    audience: 'crew',
    routes: ['/dashboard/visa-tracker'],
    defaultEnabled: true,
  },
  {
    key: 'bridge_watch_log',
    label: 'Bridge watch log',
    description: 'Crew bridge watch hours log.',
    audience: 'crew',
    routes: ['/dashboard/bridge-watch-log'],
    defaultEnabled: true,
  },
  {
    key: 'watch_schedule',
    label: 'Watch roster',
    description: 'Vessel crew watch schedule and crew “My watch roster”.',
    audience: 'both',
    routes: ['/dashboard/watch-schedule', '/dashboard/my-watch-schedule'],
    defaultEnabled: true,
  },
  {
    key: 'crew_rotation',
    label: 'Onboard crew tracker',
    description: 'Vessel onboard / rotation tracker.',
    audience: 'vessel',
    routes: ['/dashboard/crew-rotation'],
    defaultEnabled: true,
  },
  {
    key: 'testimonials',
    label: 'Testimonials',
    description: 'Crew sea-time testimonials / applications list.',
    audience: 'crew',
    routes: ['/dashboard/applications'],
    defaultEnabled: true,
  },
  {
    key: 'apply_tickets',
    label: 'Apply for tickets',
    description: 'Crew ticket / certificate application templates.',
    audience: 'crew',
    routes: ['/dashboard/apply'],
    defaultEnabled: true,
  },
  {
    key: 'vessel_document_generator',
    label: 'Vessel document generator',
    description: 'Vessel Form Builder / document generator.',
    audience: 'vessel',
    routes: ['/dashboard/documents'],
    defaultEnabled: true,
  },
  {
    key: 'certificates',
    label: 'Certificates',
    description: 'Crew certificate vault.',
    audience: 'crew',
    routes: ['/dashboard/certificates'],
    defaultEnabled: true,
  },
  {
    key: 'proof_of_service',
    label: 'Proof of service',
    description: 'Crew proof-of-service documents.',
    audience: 'crew',
    routes: ['/dashboard/proof-of-service'],
    defaultEnabled: true,
  },
  {
    key: 'sea_time_request',
    label: 'Sea-time access request',
    description: 'Crew request access to vessel sea-time data.',
    audience: 'crew',
    routes: ['/dashboard/sea-time-request'],
    defaultEnabled: true,
  },
  {
    key: 'export_reports',
    label: 'Export reports',
    description: 'Sea-time / report PDF exports.',
    audience: 'both',
    routes: ['/dashboard/export'],
    defaultEnabled: true,
  },
  {
    key: 'vessel_team_accounts',
    label: 'Vessel team accounts',
    description: 'Vessel Pro linked team accounts (Vessel Roles).',
    audience: 'vessel',
    routes: ['/dashboard/vessel-roles'],
    defaultEnabled: true,
  },
];

export const FEATURE_FLAG_KEYS = FEATURE_FLAG_CATALOG.map((f) => f.key);

export function getFeatureDefinition(
  key: string,
): FeatureFlagDefinition | undefined {
  return FEATURE_FLAG_CATALOG.find((f) => f.key === key);
}

export function featureFlagForRoute(pathname: string): FeatureFlagKey | null {
  const path = pathname.split('?')[0].replace(/\/$/, '') || pathname;
  for (const feature of FEATURE_FLAG_CATALOG) {
    for (const route of feature.routes) {
      if (path === route || path.startsWith(`${route}/`)) {
        return feature.key;
      }
    }
  }
  return null;
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
