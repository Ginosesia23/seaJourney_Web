'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSupabase, useUser } from '@/supabase';
import { useDoc } from '@/supabase/database';
import type { UserProfile } from '@/lib/types';
import {
  FEATURE_FLAG_CATALOG,
  featureFlagsForRoute,
  getFeatureDefinition,
  isFeatureEnabledInMap,
  resolveFeatureEnabledMap,
  type FeatureFlagKey,
} from '@/lib/feature-flags/catalog';
import {
  meetsFeatureTierAccess,
  resolveFeatureTierAccess,
  type FeatureTierAccess,
} from '@/lib/feature-flags/tier-access';
import { useCrewVesselFeatureBoost } from '@/contexts/crew-vessel-feature-boost-context';

type FlagsMap = Record<FeatureFlagKey, boolean>;
type TierAccessMap = Record<FeatureFlagKey, FeatureTierAccess>;

const defaultMap = (): FlagsMap => resolveFeatureEnabledMap([]);

const defaultTierAccess = (): TierAccessMap => {
  const map = {} as TierAccessMap;
  for (const def of FEATURE_FLAG_CATALOG) {
    map[def.key] = resolveFeatureTierAccess(def, null);
  }
  return map;
};

/**
 * Client-side feature flags for crew/vessel UI.
 * Admins always see features as enabled (can still manage them on the admin page).
 */
export function useFeatureFlags() {
  const { supabase } = useSupabase();
  const { user } = useUser();
  const { data: profile } = useDoc<UserProfile>('users', user?.id);
  const { boost: vesselBoost, managerTier } = useCrewVesselFeatureBoost();
  const isAdmin =
    ((profile as { role?: string } | null)?.role || '').toLowerCase() ===
    'admin';

  const [flags, setFlags] = useState<FlagsMap>(defaultMap);
  const [tierAccess, setTierAccess] = useState<TierAccessMap>(defaultTierAccess);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setFlags(defaultMap());
        setTierAccess(defaultTierAccess());
        return;
      }
      const res = await fetch('/api/feature-flags', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (!res.ok) {
        setFlags(defaultMap());
        setTierAccess(defaultTierAccess());
        return;
      }
      const json = (await res.json()) as {
        flags?: Record<string, boolean>;
        tierAccess?: Record<string, FeatureTierAccess>;
      };
      setFlags(
        resolveFeatureEnabledMap(
          Object.entries(json.flags || {}).map(([key, enabled]) => ({
            key,
            enabled: !!enabled,
          })),
        ),
      );
      const nextTier = defaultTierAccess();
      for (const def of FEATURE_FLAG_CATALOG) {
        const row = json.tierAccess?.[def.key];
        if (!row) {
          nextTier[def.key] = resolveFeatureTierAccess(def, null);
          continue;
        }
        nextTier[def.key] = {
          crewTiers:
            row.crewTiers !== undefined
              ? row.crewTiers
              : resolveFeatureTierAccess(def, {
                  min_crew_tier: row.minCrewTier,
                  min_vessel_tier: row.minVesselTier,
                }).crewTiers,
          vesselTiers:
            row.vesselTiers !== undefined
              ? row.vesselTiers
              : resolveFeatureTierAccess(def, {
                  min_crew_tier: row.minCrewTier,
                  min_vessel_tier: row.minVesselTier,
                }).vesselTiers,
          minCrewTier: row.minCrewTier ?? null,
          minVesselTier: row.minVesselTier ?? null,
        };
      }
      setTierAccess(nextTier);
    } catch {
      setFlags(defaultMap());
      setTierAccess(defaultTierAccess());
    } finally {
      setIsLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 30_000);
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);

  const meetsTier = useCallback(
    (key: FeatureFlagKey) => {
      if (isAdmin) return true;
      if (!profile) return false;
      const def = getFeatureDefinition(key);
      if (!def) return true;
      return meetsFeatureTierAccess(
        profile,
        def,
        tierAccess[key] ?? resolveFeatureTierAccess(def, null),
        { boost: vesselBoost, managerTier },
      );
    },
    [isAdmin, profile, tierAccess, vesselBoost, managerTier],
  );

  const isEnabled = useCallback(
    (key: FeatureFlagKey) => {
      if (isAdmin) return true;
      if (!profile || isLoading) return false;
      if (!isFeatureEnabledInMap(flags, key, { isAdmin })) return false;
      return meetsTier(key);
    },
    [flags, isAdmin, isLoading, meetsTier, profile],
  );

  const isRouteEnabled = useCallback(
    (pathname: string) => {
      if (isAdmin) return true;
      const keys = featureFlagsForRoute(pathname);
      if (keys.length === 0) return true;
      return keys.some((key) => isEnabled(key));
    },
    [isAdmin, isEnabled],
  );

  return {
    flags,
    tierAccess,
    isLoading,
    isEnabled,
    meetsTier,
    isRouteEnabled,
    refresh,
    isAdmin,
  };
}
