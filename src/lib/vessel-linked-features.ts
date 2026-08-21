/**
 * Feature grants for vessel-linked secondary accounts (Vessel Roles).
 *
 * Core pages are always available. Extra pages are opt-in per account via
 * `users.linked_account_features`, approved by the vessel manager.
 *
 * Each grantable key maps to a platform feature flag (`FEATURE_FLAG_CATALOG`).
 * When the admin disables that flag, the grant option is hidden on Vessel Roles
 * and cannot be saved.
 */

import type { FeatureFlagKey } from '@/lib/feature-flags/catalog';

export const VESSEL_LINKED_FEATURE_KEYS = [
  'testimonials',
  'apply_tickets',
  'passage_logbook',
  'passages_map',
  'bridge_watch_log',
  'watch_roster',
  'visa_tracker',
  'ais_history',
  'certificates',
  'proof_of_service',
  'export_reports',
  'sea_time_request',
] as const;

export type VesselLinkedFeatureKey = (typeof VESSEL_LINKED_FEATURE_KEYS)[number];

export type VesselLinkedFeatureGroup = 'documents' | 'operations' | 'compliance';

export type VesselLinkedFeatureDefinition = {
  key: VesselLinkedFeatureKey;
  label: string;
  description: string;
  hrefs: string[];
  defaultGranted: boolean;
  group: VesselLinkedFeatureGroup;
  /** Admin platform flag that must be on for this grant to appear / apply. */
  platformFlagKey: FeatureFlagKey;
};

export const VESSEL_LINKED_FEATURE_GROUPS: Array<{
  key: VesselLinkedFeatureGroup;
  label: string;
  description: string;
}> = [
  {
    key: 'documents',
    label: 'Documents',
    description: 'Sea-service paperwork this account can view or produce.',
  },
  {
    key: 'operations',
    label: 'Operations',
    description: 'Live vessel tools — logs, watches, and AIS.',
  },
  {
    key: 'compliance',
    label: 'Compliance',
    description: 'Visa tracking and sea-time access requests.',
  },
];

export const VESSEL_LINKED_CORE_FEATURES: Array<{ label: string; description: string; captainOnly?: boolean }> = [
  { label: 'Home', description: 'Vessel dashboard overview' },
  { label: 'Daily log', description: 'Vessel daily state log' },
  { label: 'Calendar', description: 'Month view of vessel state' },
  { label: 'Inbox', description: 'Sign-offs and messages' },
  { label: 'Profile', description: 'This linked login’s account' },
  { label: 'Career documents', description: 'Documents generated for them' },
  { label: 'Signature', description: 'Sign documents for the vessel', captainOnly: true },
  { label: 'Sea-time requests', description: 'Approve crew sea-time access', captainOnly: true },
];

/** Pages every linked account can use — not stored in linked_account_features. */
export const VESSEL_LINKED_CORE_HREFS = [
  '/dashboard',
  '/dashboard/current',
  '/dashboard/calendar',
  '/dashboard/profile',
  '/dashboard/inbox',
  '/dashboard/feedback',
  '/dashboard/career-documents',
  '/dashboard/subscription',
] as const;

/**
 * Pages crew_limited (Invite Crew) accounts may use. Fixed set — not grantable
 * by the vessel manager.
 */
export const CREW_LIMITED_ALLOWED_HREFS = [
  '/dashboard',
  '/dashboard/current',
  '/dashboard/calendar',
  '/dashboard/profile',
  '/dashboard/inbox',
  '/dashboard/feedback',
  '/dashboard/career-documents',
  '/dashboard/subscription',
] as const;

/** Extra pages for linked captains (users.role = captain). */
export const VESSEL_LINKED_CAPTAIN_HREFS = [
  '/dashboard/settings/signature',
  '/dashboard/requests',
  '/dashboard/sign-offs',
] as const;

export const VESSEL_LINKED_FEATURES: VesselLinkedFeatureDefinition[] = [
  {
    key: 'testimonials',
    label: 'Testimonials',
    description: 'View and manage sea-time testimonials for this vessel.',
    hrefs: ['/dashboard/career-documents'],
    defaultGranted: true,
    group: 'documents',
    platformFlagKey: 'testimonials',
  },
  {
    key: 'apply_tickets',
    label: 'Apply for tickets',
    description: 'Certificate and ticket application templates.',
    hrefs: ['/dashboard/apply'],
    defaultGranted: false,
    group: 'documents',
    platformFlagKey: 'apply_tickets',
  },
  {
    key: 'certificates',
    label: 'Certificates',
    description: 'Certificate vault for this account.',
    hrefs: ['/dashboard/certificates'],
    defaultGranted: false,
    group: 'documents',
    platformFlagKey: 'certificates',
  },
  {
    key: 'proof_of_service',
    label: 'Proof of service',
    description: 'Proof-of-service documents.',
    hrefs: ['/dashboard/career-documents'],
    defaultGranted: false,
    group: 'documents',
    platformFlagKey: 'proof_of_service',
  },
  {
    key: 'export_reports',
    label: 'Export reports',
    description: 'Export sea-time and report PDFs.',
    hrefs: ['/dashboard/export'],
    defaultGranted: false,
    group: 'documents',
    platformFlagKey: 'export_reports',
  },
  {
    key: 'passage_logbook',
    label: 'Passage log',
    description: 'Voyage logbook for passages on this vessel.',
    hrefs: ['/dashboard/passage-logbook'],
    defaultGranted: false,
    group: 'operations',
    platformFlagKey: 'passage_logbook',
  },
  {
    key: 'passages_map',
    label: 'Passage tracks',
    description: 'AIS passage map for this vessel.',
    hrefs: ['/dashboard/passages-map'],
    defaultGranted: false,
    group: 'operations',
    platformFlagKey: 'passages_map',
  },
  {
    key: 'bridge_watch_log',
    label: 'Bridge watch',
    description: 'Bridge watch hours log.',
    hrefs: ['/dashboard/bridge-watch-log', '/dashboard/watch-schedule'],
    defaultGranted: false,
    group: 'operations',
    platformFlagKey: 'bridge_watch_log',
  },
  {
    key: 'watch_roster',
    label: 'Watch roster',
    description: 'Vessel watch plans and who is currently on watch.',
    hrefs: ['/dashboard/my-watch-schedule', '/dashboard/watch-schedule'],
    defaultGranted: false,
    group: 'operations',
    platformFlagKey: 'watch_schedule',
  },
  {
    key: 'ais_history',
    label: 'AIS history',
    description: 'Import and review historical AIS positions.',
    hrefs: ['/dashboard/ais-import'],
    defaultGranted: false,
    group: 'operations',
    platformFlagKey: 'ais_history_import',
  },
  {
    key: 'visa_tracker',
    label: 'Visa tracker',
    description: 'Schengen / visa day tracking.',
    hrefs: ['/dashboard/visa-tracker'],
    defaultGranted: false,
    group: 'compliance',
    platformFlagKey: 'visa_tracker',
  },
  {
    key: 'sea_time_request',
    label: 'Request sea-time access',
    description: 'Request access to vessel sea-time records.',
    hrefs: ['/dashboard/sea-time-request'],
    defaultGranted: false,
    group: 'compliance',
    platformFlagKey: 'sea_time_request',
  },
];

/** Features the vessel manager may grant while the matching admin flag is on. */
export function grantableVesselLinkedFeatures(
  isPlatformEnabled: (key: FeatureFlagKey) => boolean,
): VesselLinkedFeatureDefinition[] {
  return VESSEL_LINKED_FEATURES.filter((f) => isPlatformEnabled(f.platformFlagKey));
}

/** Drop grants whose platform feature flag is currently disabled. */
export function filterFeaturesByPlatformFlags(
  features: VesselLinkedFeatureKey[],
  isPlatformEnabled: (key: FeatureFlagKey) => boolean,
): VesselLinkedFeatureKey[] {
  const allowed = new Set(
    grantableVesselLinkedFeatures(isPlatformEnabled).map((f) => f.key),
  );
  return features.filter((key) => allowed.has(key));
}

export const DEFAULT_VESSEL_LINKED_FEATURES: VesselLinkedFeatureKey[] =
  VESSEL_LINKED_FEATURES.filter((f) => f.defaultGranted).map((f) => f.key);

const FEATURE_KEY_SET = new Set<string>(VESSEL_LINKED_FEATURE_KEYS);

export function isVesselLinkedFeatureKey(value: unknown): value is VesselLinkedFeatureKey {
  return typeof value === 'string' && FEATURE_KEY_SET.has(value);
}

export function sanitizeLinkedAccountFeatures(raw: unknown): VesselLinkedFeatureKey[] {
  if (!Array.isArray(raw)) return [...DEFAULT_VESSEL_LINKED_FEATURES];
  const seen = new Set<VesselLinkedFeatureKey>();
  for (const item of raw) {
    if (isVesselLinkedFeatureKey(item)) seen.add(item);
  }
  return VESSEL_LINKED_FEATURE_KEYS.filter((key) => seen.has(key));
}

/** Explicit grants. Missing / invalid payload falls back to defaults. */
export function resolveLinkedAccountFeatures(profile: unknown): VesselLinkedFeatureKey[] {
  if (!profile || typeof profile !== 'object') {
    return [...DEFAULT_VESSEL_LINKED_FEATURES];
  }
  const row = profile as Record<string, unknown>;
  const raw = row.linked_account_features ?? row.linkedAccountFeatures;
  if (raw == null) return [...DEFAULT_VESSEL_LINKED_FEATURES];
  return sanitizeLinkedAccountFeatures(raw);
}

function profileSubscriptionTier(profile: unknown): string {
  if (!profile || typeof profile !== 'object') return '';
  const row = profile as Record<string, unknown>;
  return String(row.subscription_tier ?? row.subscriptionTier ?? '').toLowerCase();
}

/**
 * True only for `vessel_linked` accounts that the vessel manager has granted
 * this extra feature. Paying crew / vessel plans should use their own tier
 * gates; `crew_limited` never qualifies.
 */
export function isVesselLinkedFeatureGranted(
  profile: unknown,
  key: VesselLinkedFeatureKey,
): boolean {
  if (profileSubscriptionTier(profile) !== 'vessel_linked') return false;
  return resolveLinkedAccountFeatures(profile).includes(key);
}

export function isLinkedVesselWatchViewer(profile: unknown): boolean {
  return (
    isVesselLinkedFeatureGranted(profile, 'watch_roster') ||
    isVesselLinkedFeatureGranted(profile, 'bridge_watch_log')
  );
}

/** Vessel this linked account belongs to (`managed_by_vessel_id`, else active vessel). */
export function vesselLinkedOwnedVesselId(profile: unknown): string | null {
  if (profileSubscriptionTier(profile) !== 'vessel_linked') return null;
  if (!profile || typeof profile !== 'object') return null;
  const row = profile as Record<string, unknown>;
  const managed = row.managed_by_vessel_id ?? row.managedByVesselId;
  if (typeof managed === 'string' && managed.trim()) return managed.trim();
  const active = row.active_vessel_id ?? row.activeVesselId;
  if (typeof active === 'string' && active.trim()) return active.trim();
  return null;
}

function hrefMatchesPath(pathname: string, href: string): boolean {
  const path = pathname.split('?')[0].replace(/\/$/, '') || pathname;
  if (href === '/dashboard') return path === '/dashboard';
  return path === href || path.startsWith(`${href}/`);
}

export function vesselLinkedAllowedHrefs(profile: unknown): string[] {
  const hrefs = new Set<string>(VESSEL_LINKED_CORE_HREFS);
  const role = (
    (profile as { role?: string } | null)?.role ||
    ''
  ).toString().toLowerCase();
  if (role === 'captain') {
    for (const href of VESSEL_LINKED_CAPTAIN_HREFS) hrefs.add(href);
  }
  const granted = new Set(resolveLinkedAccountFeatures(profile));
  for (const feature of VESSEL_LINKED_FEATURES) {
    if (!granted.has(feature.key)) continue;
    for (const href of feature.hrefs) hrefs.add(href);
  }
  return [...hrefs];
}

export function isVesselLinkedHrefAllowed(profile: unknown, pathname: string): boolean {
  return vesselLinkedAllowedHrefs(profile).some((href) => hrefMatchesPath(pathname, href));
}

export function isCrewLimitedHrefAllowed(pathname: string): boolean {
  return CREW_LIMITED_ALLOWED_HREFS.some((href) => hrefMatchesPath(pathname, href));
}

export function getVesselLinkedFeatureLabel(key: VesselLinkedFeatureKey): string {
  return VESSEL_LINKED_FEATURES.find((f) => f.key === key)?.label ?? key;
}
