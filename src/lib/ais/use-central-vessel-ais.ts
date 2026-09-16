'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  AIS_REFRESH_INTERVAL_UNDERWAY_MS,
  getAisRefreshIntervalMs,
  isAisCacheFresh,
} from '@/lib/ais/constants';
import type { DailyStatus } from '@/lib/types';
import { useSupabase } from '@/supabase';

export type CentralVesselAis = {
  vesselId: string;
  state: DailyStatus | string;
  latitude: number | null;
  longitude: number | null;
  speed: number | null;
  rawNavigationStatus: string | null;
  fetchedAt: string | null;
  stale: boolean;
  source: 'cache' | 'datalastic';
  ageMinutes: number | null;
  refreshError: string | null;
};

type Options = {
  vesselId: string | null;
  accessToken: string | null;
  enabled?: boolean;
  /**
   * Client poll cadence. Defaults to the shortest (underway) interval so we
   * notice state changes quickly; the API still enforces adaptive freshness.
   */
  pollIntervalMs?: number;
};

function shouldRefreshCentralAis(
  fetchedAt: string | null | undefined,
  state: DailyStatus | string | null | undefined,
): boolean {
  return !isAisCacheFresh(fetchedAt, state);
}

/**
 * Loads central vessel AIS via the SeaJourney API and subscribes to
 * `vessel_ais_status` Realtime updates for live dashboard refreshes.
 */
export function useCentralVesselAis(options: Options) {
  const {
    vesselId,
    accessToken,
    enabled = true,
    pollIntervalMs = AIS_REFRESH_INTERVAL_UNDERWAY_MS,
  } = options;
  const { supabase } = useSupabase();
  const [ais, setAis] = useState<CentralVesselAis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCentralAis = useCallback(
    async (force = false) => {
      if (!vesselId || !accessToken || !enabled) return null;
      setLoading(true);
      setError(null);
      try {
        const url = `/api/ais/vessels/${encodeURIComponent(vesselId)}${
          force ? '?force=1' : ''
        }`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load AIS');

        const next: CentralVesselAis = {
          vesselId: data.vesselId,
          state: data.state,
          latitude: data.latitude ?? null,
          longitude: data.longitude ?? null,
          speed: data.speed ?? null,
          rawNavigationStatus: data.rawNavigationStatus ?? null,
          fetchedAt: data.fetchedAt ?? null,
          stale: !!data.stale,
          source: data.source === 'datalastic' ? 'datalastic' : 'cache',
          ageMinutes: data.ageMinutes ?? null,
          refreshError: data.refreshError ?? null,
        };
        setAis(next);
        return next;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'AIS load failed';
        setError(message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [accessToken, enabled, vesselId],
  );

  const aisRef = useRef(ais);
  useEffect(() => {
    aisRef.current = ais;
  }, [ais]);

  // Initial load + adaptive refresh polling
  useEffect(() => {
    if (!vesselId || !accessToken || !enabled) return;

    let cancelled = false;

    const load = async () => {
      if (cancelled) return;
      const current = aisRef.current;
      await fetchCentralAis(
        shouldRefreshCentralAis(current?.fetchedAt, current?.state),
      );
    };

    void load();

    const interval = window.setInterval(() => {
      const current = aisRef.current;
      if (shouldRefreshCentralAis(current?.fetchedAt, current?.state)) {
        void fetchCentralAis(false);
      }
    }, pollIntervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [accessToken, enabled, fetchCentralAis, pollIntervalMs, vesselId]);

  // Supabase Realtime — instant UI when backend updates vessel_ais_status
  useEffect(() => {
    if (!vesselId || !enabled) return;

    const channel = supabase
      .channel(`vessel-ais:${vesselId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'vessel_ais_status',
          filter: `vessel_id=eq.${vesselId}`,
        },
        (payload) => {
          const row = payload.new as Record<string, unknown> | null;
          if (!row) return;
          const fetchedAt = (row.fetched_at as string) ?? null;
          const state = (row.seajourney_state as string) ?? 'at-anchor';
          const fetchedMs = fetchedAt ? Date.parse(fetchedAt) : NaN;
          setAis({
            vesselId,
            state,
            latitude: row.latitude != null ? Number(row.latitude) : null,
            longitude: row.longitude != null ? Number(row.longitude) : null,
            speed: row.speed_kn != null ? Number(row.speed_kn) : null,
            rawNavigationStatus: (row.raw_navigation_status as string) ?? null,
            fetchedAt,
            stale: !isAisCacheFresh(fetchedAt, state),
            source: 'cache',
            ageMinutes: Number.isFinite(fetchedMs)
              ? Math.round((Date.now() - fetchedMs) / 60_000)
              : null,
            refreshError: (row.refresh_error as string) ?? null,
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled, supabase, vesselId]);

  return {
    ais,
    loading,
    error,
    refresh: fetchCentralAis,
    refreshIntervalMs: getAisRefreshIntervalMs(ais?.state),
  };
}
