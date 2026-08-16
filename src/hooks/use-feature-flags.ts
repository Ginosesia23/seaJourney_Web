'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSupabase, useUser } from '@/supabase';
import { useDoc } from '@/supabase/database';
import type { UserProfile } from '@/lib/types';
import {
  FEATURE_FLAG_CATALOG,
  isFeatureEnabledInMap,
  resolveFeatureEnabledMap,
  type FeatureFlagKey,
} from '@/lib/feature-flags/catalog';

type FlagsMap = Record<FeatureFlagKey, boolean>;

const defaultMap = (): FlagsMap => resolveFeatureEnabledMap([]);

/**
 * Client-side feature flags for crew/vessel UI.
 * Admins always see features as enabled (can still manage them on the admin page).
 */
export function useFeatureFlags() {
  const { supabase } = useSupabase();
  const { user } = useUser();
  const { data: profile } = useDoc<UserProfile>('users', user?.id);
  const isAdmin =
    ((profile as { role?: string } | null)?.role || '').toLowerCase() ===
    'admin';

  const [flags, setFlags] = useState<FlagsMap>(defaultMap);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setFlags(defaultMap());
        return;
      }
      const res = await fetch('/api/feature-flags', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (!res.ok) {
        setFlags(defaultMap());
        return;
      }
      const json = (await res.json()) as { flags?: Record<string, boolean> };
      setFlags(resolveFeatureEnabledMap(
        Object.entries(json.flags || {}).map(([key, enabled]) => ({
          key,
          enabled: !!enabled,
        })),
      ));
    } catch {
      setFlags(defaultMap());
    } finally {
      setIsLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 60_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const isEnabled = useCallback(
    (key: FeatureFlagKey) =>
      isFeatureEnabledInMap(flags, key, { isAdmin }),
    [flags, isAdmin],
  );

  const isRouteEnabled = useCallback(
    (pathname: string) => {
      if (isAdmin) return true;
      const path = pathname.split('?')[0].replace(/\/$/, '') || pathname;
      for (const feature of FEATURE_FLAG_CATALOG) {
        for (const route of feature.routes) {
          if (path === route || path.startsWith(`${route}/`)) {
            return isEnabled(feature.key);
          }
        }
      }
      return true;
    },
    [isAdmin, isEnabled],
  );

  return { flags, isLoading, isEnabled, isRouteEnabled, refresh, isAdmin };
}
