/**
 * Tier-based access for platform feature flags.
 *
 * Crew tiers are selected independently (no auto-cascade). Selecting
 * "crew limited" does not grant Standard / Premium / Professional.
 *
 * Vessel tiers still use a minimum: that plan and every higher plan inherit.
 *
 * Vessel-managed crew (crew_limited / paused personal plan) are gated by the
 * crew_limited chip + optional vessel minimum — not by boosted "effective"
 * crew tier — so Premium vessel crew can get a feature without giving it to
 * self-paying Standard+ accounts.
 *
 * Storage in `min_crew_tier`:
 * - null → all crew tiers
 * - "premium" (legacy) → Premium and above (expanded on read)
 * - "set:crew_limited,premium" → exact independent set
 */

import type {
  FeatureAudience,
  FeatureFlagDefinition,
  FeatureFlagKey,
} from '@/lib/feature-flags/catalog';
import { getFeatureDefinition } from '@/lib/feature-flags/catalog';
import {
  getEffectiveCrewFeatureTier,
  type CrewVesselFeatureBoost,
} from '@/lib/crew-vessel-feature-boost';
import {
  canonicalizeVesselTier,
  hasActiveSubscription,
  isCrewLimitedAccount,
  isPersonalPlanPausedForVessel,
} from '@/supabase/database/subscription-helpers';
import {
  isVesselLinkedFeatureGranted,
  type VesselLinkedFeatureKey,
} from '@/lib/vessel-linked-features';

export type CrewTierSlug =
  | 'free'
  | 'crew_limited'
  | 'standard'
  | 'premium'
  | 'pro'
  | 'professional';

export type VesselTierSlug =
  | 'free'
  | 'vessel_lite'
  | 'vessel_basic'
  | 'vessel_pro'
  | 'vessel_fleet';

export type FeatureTierAccess = {
  /** Exact crew tiers with access. null = all crew tiers. */
  crewTiers: CrewTierSlug[] | null;
  /**
   * @deprecated Derived for compatibility / vessel-only summaries.
   * Lowest selected paid/self-serve crew tier when using legacy min encoding.
   */
  minCrewTier: CrewTierSlug | null;
  /** Exact vessel tiers with access. null = all, [] = none. */
  vesselTiers: VesselTierSlug[] | null;
  /** Lowest selected vessel tier (compat). null when all or none. */
  minVesselTier: VesselTierSlug | null;
};

/** Vessel assignment context for crew tier checks (boost + manager plan tier). */
export type FeatureAccessVesselContext = {
  boost?: CrewVesselFeatureBoost | null;
  managerTier?: string | null;
};

export function normalizeFeatureAccessVesselContext(
  input?: CrewVesselFeatureBoost | FeatureAccessVesselContext | null,
): FeatureAccessVesselContext {
  if (input == null || typeof input === 'string') {
    return { boost: input ?? null, managerTier: null };
  }
  return {
    boost: input.boost ?? null,
    managerTier: input.managerTier ?? null,
  };
}

/** Crew on a vessel-managed plan (crew_limited or personal plan paused on assignment). */
export function isVesselManagedCrewAccount(profile: unknown): boolean {
  return (
    isCrewLimitedAccount(profile) || isPersonalPlanPausedForVessel(profile)
  );
}

export const CREW_TIER_LADDER: CrewTierSlug[] = [
  'free',
  'crew_limited',
  'standard',
  'premium',
  'professional',
];

/** Self-serve / paid crew ladder — cascade still optional among these only. */
export const CREW_SELF_SERVE_LADDER: CrewTierSlug[] = [
  'free',
  'standard',
  'premium',
  'professional',
];

export const VESSEL_TIER_LADDER: VesselTierSlug[] = [
  'free',
  'vessel_lite',
  'vessel_basic',
  'vessel_pro',
  'vessel_fleet',
];

export const CREW_TIER_LABELS: Record<CrewTierSlug, string> = {
  free: 'Free',
  crew_limited: 'Crew limited',
  standard: 'Standard',
  premium: 'Premium',
  pro: 'Professional',
  professional: 'Professional',
};

export const VESSEL_TIER_LABELS: Record<VesselTierSlug, string> = {
  free: 'Free',
  vessel_lite: 'Vessel Standard',
  vessel_basic: 'Vessel Premium',
  vessel_pro: 'Vessel Professional',
  vessel_fleet: 'Vessel Fleet',
};

const CREW_TIER_RANK: Record<CrewTierSlug, number> = {
  free: 0,
  crew_limited: 1,
  standard: 2,
  premium: 3,
  pro: 4,
  professional: 4,
};

const VESSEL_TIER_RANK: Record<VesselTierSlug, number> = {
  free: 0,
  vessel_lite: 1,
  vessel_basic: 2,
  vessel_pro: 3,
  vessel_fleet: 4,
};

const CREW_SET_PREFIX = 'set:';

export function normalizeCrewTierSlug(
  tier: string | null | undefined,
): CrewTierSlug | null {
  if (!tier) return null;
  const t = tier.toLowerCase().trim();
  if (t === 'professional' || t === 'pro') return 'professional';
  if (CREW_TIER_LADDER.includes(t as CrewTierSlug)) return t as CrewTierSlug;
  return null;
}

export function normalizeVesselTierSlug(
  tier: string | null | undefined,
): VesselTierSlug | null {
  if (!tier) return null;
  const t = canonicalizeVesselTier(tier) as VesselTierSlug;
  if (VESSEL_TIER_LADDER.includes(t)) return t;
  return null;
}

export function crewTierRank(tier: string | null | undefined): number {
  const slug = normalizeCrewTierSlug(tier);
  if (!slug) return 0;
  return CREW_TIER_RANK[slug];
}

export function vesselTierRank(tier: string | null | undefined): number {
  const slug = normalizeVesselTierSlug(tier);
  if (!slug) return 0;
  return VESSEL_TIER_RANK[slug];
}

function getRoleLower(profile: unknown): string {
  const p = profile as Record<string, unknown> | null | undefined;
  return (p?.role || 'crew').toString().toLowerCase();
}

function getTierLower(profile: unknown): string {
  const p = profile as Record<string, unknown> | null | undefined;
  return (p?.subscription_tier || p?.subscriptionTier || 'free')
    .toString()
    .toLowerCase()
    .trim();
}

export function effectiveCrewTierRank(
  profile: unknown,
  vesselBoost?: CrewVesselFeatureBoost | null,
): number {
  const effective = getEffectiveCrewFeatureTier(profile, vesselBoost ?? null);
  return crewTierRank(effective);
}

export function effectiveVesselTierRank(profile: unknown): number {
  return vesselTierRank(getTierLower(profile));
}

/** Canonical crew tier for set membership (pro → professional). */
export function canonicalCrewTierForAccess(
  tier: string | null | undefined,
): CrewTierSlug {
  const slug = normalizeCrewTierSlug(tier);
  if (!slug) return 'free';
  if (slug === 'pro') return 'professional';
  return slug;
}

export function dedupeCrewTiers(tiers: Iterable<CrewTierSlug>): CrewTierSlug[] {
  const seen = new Set<CrewTierSlug>();
  const out: CrewTierSlug[] = [];
  for (const raw of tiers) {
    const slug = canonicalCrewTierForAccess(raw);
    if (seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
  }
  return out.sort((a, b) => crewTierRank(a) - crewTierRank(b));
}

/** True when the set covers every selectable crew ladder tier. */
export function isFullCrewTierSet(tiers: CrewTierSlug[] | null): boolean {
  if (!tiers) return true;
  const set = new Set(dedupeCrewTiers(tiers));
  return CREW_TIER_LADDER.every((t) => set.has(canonicalCrewTierForAccess(t)));
}

/**
 * Parse DB `min_crew_tier` into an independent crew tier set.
 * null → all tiers. Legacy single slug → that tier and above.
 */
export function parseCrewTiersAccess(
  raw: string | null | undefined,
): CrewTierSlug[] | null {
  if (raw == null || raw === '') return null;
  const value = raw.trim();
  if (value.startsWith(CREW_SET_PREFIX)) {
    const parts = value
      .slice(CREW_SET_PREFIX.length)
      .split(',')
      .map((p) => normalizeCrewTierSlug(p.trim()))
      .filter((p): p is CrewTierSlug => !!p);
    return dedupeCrewTiers(parts);
  }
  const min = normalizeCrewTierSlug(value);
  if (!min) return null;
  return inheritedTiersFromMin(min, CREW_TIER_LADDER, crewTierRank);
}

/** Encode an independent crew tier set for `min_crew_tier` storage. */
export function encodeCrewTiersAccess(
  tiers: CrewTierSlug[] | null | undefined,
): string | null {
  if (tiers == null || isFullCrewTierSet(tiers)) return null;
  const unique = dedupeCrewTiers(tiers);
  return `${CREW_SET_PREFIX}${unique.join(',')}`;
}

/** Lowest tier in a set (for legacy minCrewTier field). */
export function minCrewTierFromSet(
  tiers: CrewTierSlug[] | null,
): CrewTierSlug | null {
  if (!tiers || tiers.length === 0) return null;
  return dedupeCrewTiers(tiers)[0] ?? null;
}

export function crewTierSetAllows(
  tiers: CrewTierSlug[] | null,
  candidate: CrewTierSlug,
): boolean {
  if (!tiers) return true;
  const want = canonicalCrewTierForAccess(candidate);
  return tiers.some((t) => canonicalCrewTierForAccess(t) === want);
}

/** Toggle a crew tier. Turning off also clears every lower tier. Turning on is independent. */
export function toggleCrewTierInSet(
  tier: CrewTierSlug,
  selected: boolean,
  current: CrewTierSlug[] | null,
): CrewTierSlug[] | null {
  const base = current == null ? [...CREW_TIER_LADDER] : [...current];
  const set = new Set(dedupeCrewTiers(base));
  const key = canonicalCrewTierForAccess(tier);
  const tierRank = crewTierRank(key);

  if (selected) {
    set.add(key);
  } else {
    for (const t of CREW_TIER_LADDER) {
      if (crewTierRank(t) <= tierRank) set.delete(canonicalCrewTierForAccess(t));
    }
  }

  const next = dedupeCrewTiers(set);
  if (next.length === 0) return [];
  if (isFullCrewTierSet(next)) return null;
  return next;
}

/** All tiers on a ladder that inherit access from a minimum tier. */
export function inheritedTiersFromMin<T extends string>(
  minTier: T | null,
  ladder: readonly T[],
  rankFn: (tier: string) => number,
): T[] {
  if (!minTier) return [...ladder];
  const minRank = rankFn(minTier);
  return ladder.filter((tier) => rankFn(tier) >= minRank);
}

/** Lowest tier slug that covers the checked set (smart cascade target). */
export function minTierFromInheritedSet<T extends string>(
  checked: Iterable<T>,
  ladder: readonly T[],
  rankFn: (tier: string) => number,
): T | null {
  let best: T | null = null;
  let bestRank = Number.POSITIVE_INFINITY;
  for (const tier of checked) {
    const rank = rankFn(tier);
    if (rank < bestRank) {
      bestRank = rank;
      best = tier;
    }
  }
  return best;
}

export function dedupeVesselTiers(
  tiers: Iterable<VesselTierSlug>,
): VesselTierSlug[] {
  const seen = new Set<VesselTierSlug>();
  const out: VesselTierSlug[] = [];
  for (const raw of tiers) {
    const slug = normalizeVesselTierSlug(raw);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
  }
  return out.sort((a, b) => vesselTierRank(a) - vesselTierRank(b));
}

export function isFullVesselTierSet(tiers: VesselTierSlug[] | null): boolean {
  if (!tiers) return true;
  const set = new Set(dedupeVesselTiers(tiers));
  return VESSEL_TIER_LADDER.every((t) => set.has(t));
}

/**
 * Parse DB `min_vessel_tier` into a vessel tier set.
 * null → all tiers. Legacy single slug → that tier and above. `set:` → exact.
 */
export function parseVesselTiersAccess(
  raw: string | null | undefined,
): VesselTierSlug[] | null {
  if (raw == null || raw === '') return null;
  const value = raw.trim();
  if (value.startsWith(CREW_SET_PREFIX)) {
    const parts = value
      .slice(CREW_SET_PREFIX.length)
      .split(',')
      .map((p) => normalizeVesselTierSlug(p.trim()))
      .filter((p): p is VesselTierSlug => !!p);
    return dedupeVesselTiers(parts);
  }
  const min = normalizeVesselTierSlug(value);
  if (!min) return null;
  return inheritedTiersFromMin(min, VESSEL_TIER_LADDER, vesselTierRank);
}

/** Encode vessel tier set for `min_vessel_tier` storage. */
export function encodeVesselTiersAccess(
  tiers: VesselTierSlug[] | null | undefined,
): string | null {
  if (tiers == null || isFullVesselTierSet(tiers)) return null;
  const unique = dedupeVesselTiers(tiers);
  if (unique.length === 0) return CREW_SET_PREFIX;
  const min = unique[0];
  const expected = inheritedTiersFromMin(min, VESSEL_TIER_LADDER, vesselTierRank);
  if (
    unique.length === expected.length &&
    unique.every((t, i) => t === expected[i])
  ) {
    return min;
  }
  return `${CREW_SET_PREFIX}${unique.join(',')}`;
}

export function minVesselTierFromSet(
  tiers: VesselTierSlug[] | null,
): VesselTierSlug | null {
  if (!tiers || tiers.length === 0) return null;
  return dedupeVesselTiers(tiers)[0] ?? null;
}

export function vesselTierSetAllows(
  tiers: VesselTierSlug[] | null,
  candidate: string | null | undefined,
): boolean {
  if (!tiers) return true;
  if (tiers.length === 0) return false;
  const want = normalizeVesselTierSlug(candidate);
  if (!want) return false;
  return tiers.includes(want);
}

/**
 * Toggle vessel tier chips:
 * - Turning ON → that plan and every higher plan
 * - Turning OFF → that plan and every lower plan
 * null = all selected, [] = none selected
 */
export function toggleVesselTiersInSet(
  tier: VesselTierSlug,
  selected: boolean,
  current: VesselTierSlug[] | null,
): VesselTierSlug[] | null {
  const set = new Set(
    current == null ? [...VESSEL_TIER_LADDER] : dedupeVesselTiers(current),
  );
  const tierRank = vesselTierRank(tier);

  if (selected) {
    for (const t of VESSEL_TIER_LADDER) {
      if (vesselTierRank(t) >= tierRank) set.add(t);
    }
  } else {
    for (const t of VESSEL_TIER_LADDER) {
      if (vesselTierRank(t) <= tierRank) set.delete(t);
    }
  }

  const next = dedupeVesselTiers(set);
  if (next.length === 0) return [];
  if (isFullVesselTierSet(next)) return null;
  return next;
}

/** @deprecated Prefer toggleVesselTiersInSet. Kept for callers using min-tier model. */
export function toggleTierSelection<T extends string>(
  tier: T,
  selected: boolean,
  ladder: readonly T[],
  rankFn: (t: string) => number,
  currentMin: T | null,
): T | null {
  const currentSet: T[] | null = currentMin
    ? inheritedTiersFromMin(currentMin, ladder, rankFn)
    : null;
  const set = new Set(currentSet == null ? [...ladder] : currentSet);
  const tierRank = rankFn(tier);

  if (selected) {
    for (const t of ladder) {
      if (rankFn(t) >= tierRank) set.add(t);
    }
  } else {
    for (const t of ladder) {
      if (rankFn(t) <= tierRank) set.delete(t);
    }
  }

  if (set.size === 0) return null;
  if (set.size === ladder.length) return null;
  return minTierFromInheritedSet(set, ladder, rankFn);
}

/** Map platform flag keys to vessel-linked grant keys where they differ. */
export function vesselLinkedKeyForFeatureFlag(
  key: FeatureFlagKey,
): VesselLinkedFeatureKey | null {
  if (key === 'ais_history_import') return 'ais_history';
  if (key === 'watch_schedule') return 'watch_roster';
  if (key === 'vessel_document_generator') return null;
  if (key === 'crew_rotation') return null;
  if (key === 'vessel_team_accounts') return null;
  if (
    key === 'passages_map' ||
    key === 'passage_logbook' ||
    key === 'visa_tracker' ||
    key === 'bridge_watch_log' ||
    key === 'testimonials' ||
    key === 'apply_tickets' ||
    key === 'career_progress' ||
    key === 'certificates' ||
    key === 'proof_of_service' ||
    key === 'sea_time_request' ||
    key === 'export_reports'
  ) {
    return key;
  }
  return null;
}

export function resolveFeatureTierAccess(
  def: FeatureFlagDefinition,
  row?: { min_crew_tier?: string | null; min_vessel_tier?: string | null } | null,
): FeatureTierAccess {
  let crewTiers: CrewTierSlug[] | null = null;
  if (def.audience === 'vessel') {
    crewTiers = null;
  } else if (
    row &&
    'min_crew_tier' in (row as object) &&
    row.min_crew_tier !== undefined
  ) {
    if (row.min_crew_tier == null || row.min_crew_tier === '') {
      crewTiers = null;
    } else {
      crewTiers = parseCrewTiersAccess(row.min_crew_tier);
    }
  } else {
    const fallback = normalizeCrewTierSlug(def.defaultMinCrewTier ?? null);
    crewTiers = fallback
      ? inheritedTiersFromMin(fallback, CREW_TIER_LADDER, crewTierRank)
      : null;
  }

  let vesselTiers: VesselTierSlug[] | null = null;
  if (
    row &&
    'min_vessel_tier' in (row as object) &&
    row.min_vessel_tier !== undefined
  ) {
    if (row.min_vessel_tier == null || row.min_vessel_tier === '') {
      vesselTiers = null;
    } else {
      vesselTiers = parseVesselTiersAccess(row.min_vessel_tier);
    }
  } else {
    const fallback = normalizeVesselTierSlug(def.defaultMinVesselTier ?? null);
    vesselTiers = fallback
      ? inheritedTiersFromMin(fallback, VESSEL_TIER_LADDER, vesselTierRank)
      : null;
  }

  return {
    crewTiers,
    minCrewTier: minCrewTierFromSet(crewTiers),
    vesselTiers,
    minVesselTier: minVesselTierFromSet(vesselTiers),
  };
}

export function meetsFeatureTierAccess(
  profile: unknown,
  def: FeatureFlagDefinition,
  access: FeatureTierAccess,
  vesselContext?: CrewVesselFeatureBoost | FeatureAccessVesselContext | null,
): boolean {
  const role = getRoleLower(profile);
  if (role === 'admin') return true;

  const { managerTier } = normalizeFeatureAccessVesselContext(vesselContext);
  const vesselTiers = access.vesselTiers ?? null;

  if (role === 'vessel') {
    if (def.audience === 'crew') return false;
    if (!vesselTiers) return true;
    if (vesselTiers.length === 0) return false;
    return vesselTierSetAllows(vesselTiers, getTierLower(profile));
  }

  if (role === 'crew' || role === 'captain') {
    if (def.audience === 'vessel') return false;
    const linkedKey = vesselLinkedKeyForFeatureFlag(def.key);
    if (
      linkedKey &&
      hasActiveSubscription(profile) &&
      isVesselLinkedFeatureGranted(profile, linkedKey)
    ) {
      return true;
    }

    const crewTiers = access.crewTiers;
    const emptyCrewSet = Array.isArray(crewTiers) && crewTiers.length === 0;
    if (emptyCrewSet) return false;

    if (isVesselManagedCrewAccount(profile)) {
      if (!crewTierSetAllows(crewTiers, 'crew_limited')) return false;
      if (vesselTiers != null) {
        if (vesselTiers.length === 0) return false;
        if (!managerTier) return false;
        if (!vesselTierSetAllows(vesselTiers, managerTier)) return false;
      }
      return true;
    }

    const ownTier = canonicalCrewTierForAccess(getTierLower(profile));
    if (!crewTierSetAllows(crewTiers, ownTier)) return false;
    return true;
  }

  return true;
}

export function formatTierAccessSummary(
  audience: FeatureAudience,
  access: FeatureTierAccess,
): string {
  const parts: string[] = [];
  if (audience === 'crew' || audience === 'both') {
    if (access.crewTiers == null) {
      parts.push('Crew: All tiers');
    } else if (access.crewTiers.length === 0) {
      parts.push('Crew: None');
    } else {
      const labels = dedupeCrewTiers(access.crewTiers)
        .map((t) => CREW_TIER_LABELS[t])
        .filter((label, i, arr) => arr.indexOf(label) === i);
      parts.push(`Crew: ${labels.join(', ')}`);
    }
  }
  if (audience === 'vessel' || audience === 'both' || audience === 'crew') {
    const vesselTiers = access.vesselTiers;
    if (vesselTiers == null) {
      if (audience !== 'crew') parts.push('Vessel: All tiers');
    } else if (vesselTiers.length === 0) {
      parts.push(audience === 'crew' ? 'Vessel package: None' : 'Vessel: None');
    } else {
      const labels = dedupeVesselTiers(vesselTiers).map(
        (t) => VESSEL_TIER_LABELS[t],
      );
      parts.push(
        audience === 'crew'
          ? `Vessel package: ${labels.join(', ')}`
          : `Vessel: ${labels.join(', ')}`,
      );
    }
  }
  if (parts.length === 0) return 'All tiers';
  return parts.join(' · ');
}
