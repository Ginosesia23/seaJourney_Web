'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  AIS_REFRESH_INTERVAL_UNDERWAY_MS,
  getAisRefreshIntervalMs,
  isVesselDueForProviderFetch,
} from '@/lib/ais/constants';
import type { DailyStatus } from '@/lib/types';
import { useSupabase } from '@/supabase';

export type CentralVesselAisToday = {
  date: string;
  currentState: DailyStatus | string | null;
  qualifyingDailyState: DailyStatus | string | null;
  underwaySeconds: number;
  anchorSeconds: number;
  mooredSeconds: number;
  distanceNm: number;
  underwayQualified: boolean;
  isFinal: boolean;
  underwayLabel: string | null;
};

export type CentralVesselAis = {
  vesselId: string;
  state: DailyStatus | string;
  latitude: number | null;
  longitude: number | null;
  speed: number | null;
  rawNavigationStatus: string | null;
  fetchedAt: string | null;
  nextAisCheckAt: string | null;
  aisTrackingMode: string | null;
  stale: boolean;
  source: 'cache' | 'datalastic';
  ageMinutes: number | null;
  refreshError: string | null;
  today: CentralVesselAisToday | null;
};

type Options = {
  vesselId: string | null;
  accessToken: string | null;
  enabled?: boolean;
  pollIntervalMs?: number;
};

function parseToday(data: Record<string, unknown>): CentralVesselAisToday | null {
  const today = data.today as Record<string, unknown> | null | undefined;
  if (!today || typeof today !== 'object') return null;
  return {
    date: String(today.date ?? ''),
    currentState: (today.currentState as string) ?? null,
    qualifyingDailyState: (today.qualifyingDailyState as string) ?? null,
    underwaySeconds: Number(today.underwaySeconds) || 0,
    anchorSeconds: Number(today.anchorSeconds) || 0,
    mooredSeconds: Number(today.mooredSeconds) || 0,
    distanceNm: Number(today.distanceNm) || 0,
    underwayQualified: !!today.underwayQualified,
    isFinal: !!today.isFinal,
    underwayLabel:
      typeof today.underwayLabel === 'string' ? today.underwayLabel : null,
  };
}

/**
 * Loads central vessel AIS via the SeaJourney API and subscribes to
 * `vessel_ais_status` + `vessel_daily_ais_summary` Realtime updates.
 *
 * Client polls only re-read the API cache — never force provider fetches.
 * Provider refresh is owned by the adaptive cron (`next_ais_check_at`).
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
          nextAisCheckAt: data.nextAisCheckAt ?? null,
          aisTrackingMode: data.aisTrackingMode ?? null,
          stale: !!data.stale,
          source: data.source === 'datalastic' ? 'datalastic' : 'cache',
          ageMinutes: data.ageMinutes ?? null,
          refreshError: data.refreshError ?? null,
          today: parseToday(data),
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

  useEffect(() => {
    if (!vesselId || !accessToken || !enabled) return;

    let cancelled = false;

    const load = async () => {
      if (cancelled) return;
      // Always cache-only — never pass force from the poll loop.
      await fetchCentralAis(false);
    };

    void load();

    const interval = window.setInterval(() => {
      void fetchCentralAis(false);
    }, pollIntervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [accessToken, enabled, fetchCentralAis, pollIntervalMs, vesselId]);

  // Live current AIS status
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
          const nextAisCheckAt = (row.next_ais_check_at as string) ?? null;
          const state = (row.seajourney_state as string) ?? 'at-anchor';
          const fetchedMs = fetchedAt ? Date.parse(fetchedAt) : NaN;
          setAis((prev) => ({
            vesselId,
            state,
            latitude: row.latitude != null ? Number(row.latitude) : null,
            longitude: row.longitude != null ? Number(row.longitude) : null,
            speed: row.speed_kn != null ? Number(row.speed_kn) : null,
            rawNavigationStatus: (row.raw_navigation_status as string) ?? null,
            fetchedAt,
            nextAisCheckAt,
            aisTrackingMode: (row.ais_tracking_mode as string) ?? null,
            stale: isVesselDueForProviderFetch(nextAisCheckAt),
            source: 'cache',
            ageMinutes: Number.isFinite(fetchedMs)
              ? Math.round((Date.now() - fetchedMs) / 60_000)
              : null,
            refreshError: (row.refresh_error as string) ?? null,
            today: prev?.today ?? null,
          }));
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'vessel_daily_ais_summary',
          filter: `vessel_id=eq.${vesselId}`,
        },
        (payload) => {
          const row = payload.new as Record<string, unknown> | null;
          if (!row) return;
          const underwaySeconds = Number(row.underway_seconds) || 0;
          const h = Math.floor(underwaySeconds / 3600);
          const m = Math.floor((underwaySeconds % 3600) / 60);
          const underwayLabel = h <= 0 ? `${m}m` : `${h}h ${String(m).padStart(2, '0')}m`;
          setAis((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              today: {
                date: String(row.date ?? ''),
                currentState: (row.current_state as string) ?? null,
                qualifyingDailyState:
                  (row.qualifying_daily_state as string) ?? null,
                underwaySeconds,
                anchorSeconds: Number(row.anchor_seconds) || 0,
                mooredSeconds: Number(row.moored_seconds) || 0,
                distanceNm: Number(row.distance_nm) || 0,
                underwayQualified: !!row.underway_qualified,
                isFinal: !!row.is_final,
                underwayLabel,
              },
            };
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
