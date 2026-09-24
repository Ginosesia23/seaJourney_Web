'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { useSupabase, useUser } from '@/supabase';
import { useDoc } from '@/supabase/database';
import type { UserProfile } from '@/lib/types';

/** Default auto-refresh cadence for the monitor (DB reads only). */
export const AIS_MONITOR_POLL_MS = 30_000;

/**
 * UX-only gate: redirects non-admins away. Real enforcement is server-side in
 * every /api/admin/ais-monitor/* route (requireAdmin).
 */
export function useAdminGate(): { isAdmin: boolean; isChecking: boolean } {
  const { user } = useUser();
  const router = useRouter();
  const { data: profile, isLoading } = useDoc<UserProfile>('users', user?.id);
  const role = (profile as { role?: string } | null)?.role;
  const isAdmin = role === 'admin';

  useEffect(() => {
    if (!isLoading && profile && !isAdmin) router.push('/dashboard');
  }, [isAdmin, isLoading, profile, router]);

  return { isAdmin, isChecking: isLoading || (!profile && !!user) };
}

type QueryState<T> = {
  data: T | null;
  error: string | null;
  hint: string | null;
  isLoading: boolean;
  isRefreshing: boolean;
  lastUpdated: Date | null;
  refetch: () => Promise<void>;
};

/**
 * Fetch an admin AIS Monitor endpoint with the caller's bearer token and poll
 * while the tab is visible. Only ever calls /api/admin/ais-monitor/* — these
 * routes read the database and never contact the AIS provider.
 */
export function useAdminMonitorQuery<T>(
  path: string | null,
  opts: { enabled: boolean; pollMs?: number | null },
): QueryState<T> {
  const { supabase } = useSupabase();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const inFlight = useRef(false);
  const requestSeq = useRef(0);

  const run = useCallback(
    async (background: boolean) => {
      if (!path || !opts.enabled) return;
      if (background && inFlight.current) return;
      inFlight.current = true;
      const seq = ++requestSeq.current;
      if (background) setIsRefreshing(true);
      else setIsLoading(true);
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const res = await fetch(path, {
          headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
          cache: 'no-store',
        });
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          hint?: string | null;
        };
        if (seq !== requestSeq.current) return;
        if (!res.ok) {
          setError(body.error || `Request failed (${res.status})`);
          setHint(body.hint ?? null);
          if (!background) setData(null);
          return;
        }
        setData(body as T);
        setError(null);
        setHint(null);
        setLastUpdated(new Date());
      } catch (e) {
        if (seq === requestSeq.current) setError(e instanceof Error ? e.message : 'Request failed');
      } finally {
        if (seq === requestSeq.current) {
          inFlight.current = false;
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [path, opts.enabled, supabase],
  );

  useEffect(() => {
    void run(false);
  }, [run]);

  useEffect(() => {
    const pollMs = opts.pollMs;
    if (!pollMs || !opts.enabled || !path) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void run(true);
    }, pollMs);
    return () => window.clearInterval(id);
  }, [opts.pollMs, opts.enabled, path, run]);

  const refetch = useCallback(() => run(true), [run]);

  return useMemo(
    () => ({ data, error, hint, isLoading, isRefreshing, lastUpdated, refetch }),
    [data, error, hint, isLoading, isRefreshing, lastUpdated, refetch],
  );
}
