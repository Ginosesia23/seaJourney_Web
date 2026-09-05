/**
 * Navigation allowlist for crew_limited / personal-plan-paused crew.
 * Base pages are fixed; admin feature-flag tier rules can add product routes.
 */

import {
  FEATURE_FLAG_CATALOG,
  isFeatureEnabledInMap,
  type FeatureFlagKey,
} from '@/lib/feature-flags/catalog';
import {
  meetsFeatureTierAccess,
  resolveFeatureTierAccess,
  type FeatureTierAccess,
} from '@/lib/feature-flags/tier-access';
import type {
  CrewVesselFeatureBoost,
  CrewVesselFeatureBoostState,
} from '@/lib/crew-vessel-feature-boost';
import {
  isCrewLimitedAccount,
  isPersonalPlanPausedForVessel,
} from '@/supabase/database/subscription-helpers';
import { CREW_LIMITED_ALLOWED_HREFS } from '@/lib/vessel-linked-features';

function isCrewNavRestrictedForHrefCheck(
  profile: unknown,
  vesselBoost: CrewVesselFeatureBoost | null,
): boolean {
  if (vesselBoost) return false;
  if (isCrewLimitedAccount(profile)) return true;
  if (isPersonalPlanPausedForVessel(profile)) return true;
  return false;
}

function hrefMatchesPath(pathname: string, href: string): boolean {
  if (href === '/dashboard') return pathname === '/dashboard';
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Dashboard routes opened by platform feature flags for this profile. */
export function featureFlagRoutesAccessibleToProfile(opts: {
  profile: unknown;
  vesselContext?: Pick<CrewVesselFeatureBoostState, 'boost' | 'managerTier'>;
  enabledMap: Record<string, boolean>;
  tierAccess: Record<FeatureFlagKey, FeatureTierAccess>;
  isAdmin?: boolean;
}): string[] {
  if (opts.isAdmin) {
    return FEATURE_FLAG_CATALOG.flatMap((def) => def.routes);
  }

  const hrefs = new Set<string>();
  for (const def of FEATURE_FLAG_CATALOG) {
    if (def.audience === 'vessel') continue;
    if (!isFeatureEnabledInMap(opts.enabledMap, def.key, opts)) continue;
    const access =
      opts.tierAccess[def.key] ?? resolveFeatureTierAccess(def, null);
    if (
      !meetsFeatureTierAccess(opts.profile, def, access, {
        boost: opts.vesselContext?.boost ?? null,
        managerTier: opts.vesselContext?.managerTier ?? null,
      })
    ) {
      continue;
    }
    for (const route of def.routes) {
      if (route) hrefs.add(route);
    }
  }
  return [...hrefs];
}

export function resolveCrewRestrictedAllowedHrefs(opts: {
  profile: unknown;
  vesselContext?: Pick<CrewVesselFeatureBoostState, 'boost' | 'managerTier'>;
  enabledMap: Record<string, boolean>;
  tierAccess: Record<FeatureFlagKey, FeatureTierAccess>;
  isAdmin?: boolean;
}): Set<string> {
  const allowed = new Set<string>(CREW_LIMITED_ALLOWED_HREFS);
  for (const href of featureFlagRoutesAccessibleToProfile(opts)) {
    allowed.add(href);
  }
  return allowed;
}

export function isCrewRestrictedDashboardHrefAllowed(
  pathname: string,
  profile: unknown,
  vesselContext: Pick<CrewVesselFeatureBoostState, 'boost' | 'managerTier'>,
  opts: {
    enabledMap: Record<string, boolean>;
    tierAccess: Record<FeatureFlagKey, FeatureTierAccess>;
    isAdmin?: boolean;
  },
): boolean {
  if (!isCrewNavRestrictedForHrefCheck(profile, vesselContext.boost ?? null)) {
    return true;
  }

  const allowed = resolveCrewRestrictedAllowedHrefs({
    profile,
    vesselContext,
    ...opts,
  });

  for (const href of allowed) {
    if (hrefMatchesPath(pathname, href)) return true;
  }
  return false;
}
