'use client';

import * as React from 'react';
import { useUser, useSupabase } from '@/supabase';
import {
  fetchCrewVesselFeatureBoost,
  getEffectiveCrewFeatureTier,
  type CrewVesselFeatureBoost,
  type CrewVesselFeatureBoostState,
} from '@/lib/crew-vessel-feature-boost';
import { isCrewLimitedAccount, isPersonalPlanPausedForVessel } from '@/supabase/database/subscription-helpers';

const EMPTY: CrewVesselFeatureBoostState = {
  boost: null,
  vesselId: null,
  vesselName: null,
  managerTier: null,
};

type CrewVesselFeatureBoostContextValue = CrewVesselFeatureBoostState & {
  isLoading: boolean;
  refresh: () => void;
};

const CrewVesselFeatureBoostContext =
  React.createContext<CrewVesselFeatureBoostContextValue>({
    ...EMPTY,
    isLoading: false,
    refresh: () => {},
  });

export function CrewVesselFeatureBoostProvider({
  children,
  userProfile,
}: {
  children: React.ReactNode;
  userProfile: unknown;
}) {
  const { user } = useUser();
  const { supabase } = useSupabase();
  const [state, setState] = React.useState<CrewVesselFeatureBoostState>(EMPTY);
  const [isLoading, setIsLoading] = React.useState(false);
  const [refreshKey, setRefreshKey] = React.useState(0);

  const needsBoost =
    !!userProfile &&
    (isCrewLimitedAccount(userProfile) || isPersonalPlanPausedForVessel(userProfile));

  React.useEffect(() => {
    if (!user?.id || !needsBoost) {
      setState(EMPTY);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    void fetchCrewVesselFeatureBoost(supabase, user.id)
      .then((result) => {
        if (!cancelled) setState(result);
      })
      .catch((err) => {
        console.error('[crew-vessel-feature-boost] fetch failed', err);
        if (!cancelled) setState(EMPTY);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user?.id, supabase, needsBoost, refreshKey]);

  React.useEffect(() => {
    if (!user?.id || !needsBoost) return;

    const channel = supabase
      .channel(`crew-vessel-boost:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'vessel_assignments',
          filter: `user_id=eq.${user.id}`,
        },
        () => setRefreshKey((k) => k + 1),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id, supabase, needsBoost]);

  const value = React.useMemo(
    () => ({
      ...state,
      isLoading,
      refresh: () => setRefreshKey((k) => k + 1),
    }),
    [state, isLoading],
  );

  return (
    <CrewVesselFeatureBoostContext.Provider value={value}>
      {children}
    </CrewVesselFeatureBoostContext.Provider>
  );
}

export function useCrewVesselFeatureBoost(): CrewVesselFeatureBoostContextValue {
  return React.useContext(CrewVesselFeatureBoostContext);
}

export function useEffectiveCrewFeatureTier(userProfile: unknown): string {
  const { boost } = useCrewVesselFeatureBoost();
  return React.useMemo(
    () => getEffectiveCrewFeatureTier(userProfile, boost),
    [userProfile, boost],
  );
}

export type { CrewVesselFeatureBoost };
