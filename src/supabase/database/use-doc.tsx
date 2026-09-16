'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSupabase } from '../provider';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

export type WithId<T> = T & { id: string };

export interface UseDocResult<T> {
  data: WithId<T> | null;
  isLoading: boolean;
  error: Error | null;
  forceRefetch: () => void;
}

const DOC_CACHE_TTL_MS = 5 * 60 * 1000;

type DocCacheEntry = {
  data: WithId<any>;
  fetchedAt: number;
};

/** Survives client navigations so remounted pages don't flash a loading shell. */
const docMemoryCache = new Map<string, DocCacheEntry>();

function docCacheKey(tableName: string, docId: string) {
  return `${tableName}:${docId}`;
}

function readDocCache<T>(
  tableName: string | null | undefined,
  docId: string | null | undefined,
): WithId<T> | null {
  if (!tableName || !docId) return null;
  const hit = docMemoryCache.get(docCacheKey(tableName, docId));
  if (!hit) return null;
  if (Date.now() - hit.fetchedAt > DOC_CACHE_TTL_MS) {
    docMemoryCache.delete(docCacheKey(tableName, docId));
    return null;
  }
  return hit.data as WithId<T>;
}

function writeDocCache<T>(tableName: string, docId: string, data: WithId<T>) {
  docMemoryCache.set(docCacheKey(tableName, docId), {
    data,
    fetchedAt: Date.now(),
  });
}

function clearDocCache(tableName: string, docId: string) {
  docMemoryCache.delete(docCacheKey(tableName, docId));
}

export function useDoc<T = any>(
  tableName: string | null | undefined,
  docId: string | null | undefined,
  options?: {
    realtime?: boolean;
  }
): UseDocResult<T> {
  const { supabase, user } = useSupabase();
  const cached = readDocCache<T>(tableName, docId);
  const [data, setData] = useState<WithId<T> | null>(() => cached);
  const [isLoading, setIsLoading] = useState<boolean>(
    () => !!tableName && !!docId && !cached,
  );
  const [error, setError] = useState<Error | null>(null);
  const [refetchTrigger, setRefetchTrigger] = useState(0);
  const dataRef = useRef<WithId<T> | null>(cached);

  const forceRefetch = useCallback(() => {
    setRefetchTrigger((prev) => prev + 1);
  }, []);

  // Depend on the user id rather than the whole user object, so that a
  // token refresh (which produces a new user object with the same id) does
  // NOT trigger a refetch. This is what makes the dashboard appear to
  // "reload" every time the browser tab regains focus.
  const userId = user?.id ?? null;

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const fetchDoc = useCallback(async () => {
    if (!tableName || !docId || !userId) {
      setData(null);
      dataRef.current = null;
      setIsLoading(false);
      setError(null);
      return;
    }

    // Stale-while-revalidate: only block UI on the first load for this doc.
    // Background refetches must not flip isLoading — remounted pages hydrate
    // from module cache so navigating away/back stays painted.
    const memoryHit = readDocCache<T>(tableName, docId);
    if (memoryHit && (!dataRef.current || dataRef.current.id !== docId)) {
      dataRef.current = memoryHit;
      setData(memoryHit);
    }

    const hasCachedRow =
      (!!dataRef.current && dataRef.current.id === docId) || !!memoryHit;
    if (!hasCachedRow) {
      setIsLoading(true);
    }
    setError(null);

    console.log(`[useDoc] Fetching ${tableName} with id:`, docId);

    const { data: fetchedData, error: fetchError } = await supabase
      .from(tableName)
      .select('*')
      .eq('id', docId)
      .single();

    if (fetchError) {
      // Only log error if it's not a "not found" error (PGRST116) or permission error (PGRST301)
      // These are expected in some cases and don't need to be logged as errors
      if (fetchError.code !== 'PGRST116' && fetchError.code !== 'PGRST301') {
        try {
          const errorDetails: any = {
            table: tableName,
            docId,
            code: fetchError.code || 'UNKNOWN',
            message: fetchError.message || 'Unknown error',
          };

          // Only add these if they exist and are serializable
          if (fetchError.details) errorDetails.details = fetchError.details;
          if (fetchError.hint) errorDetails.hint = fetchError.hint;

          console.error(`[useDoc] Error fetching ${tableName}:`, errorDetails);
        } catch (e) {
          // If error object can't be serialized, log a simple message
          console.error(
            `[useDoc] Error fetching ${tableName} with id ${docId}:`,
            fetchError.message || 'Unknown error',
          );
        }
      }
      setError(fetchError);
      if (!hasCachedRow) {
        setData(null);
        dataRef.current = null;
        clearDocCache(tableName, docId);
      }
      setIsLoading(false);
      return;
    }

    console.log(`[useDoc] Successfully fetched ${tableName}:`, {
      table: tableName,
      docId,
      hasData: !!fetchedData,
      data: fetchedData,
    });

    if (fetchedData) {
      const next = {
        ...fetchedData,
        id: fetchedData.id || docId,
      } as WithId<T>;
      dataRef.current = next;
      writeDocCache(tableName, docId, next);
      setData(next);
    } else {
      dataRef.current = null;
      clearDocCache(tableName, docId);
      setData(null);
    }
    setIsLoading(false);
  }, [tableName, docId, userId, supabase, refetchTrigger]);

  useEffect(() => {
    fetchDoc();

    // Set up realtime subscription if enabled
    if (tableName && docId && options?.realtime !== false) {
      const channel = supabase
        .channel(`${tableName}-${docId}-changes`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: tableName,
            filter: `id=eq.${docId}`,
          },
          (payload: RealtimePostgresChangesPayload<any>) => {
            if (payload.new) {
              const next = {
                ...payload.new,
                id: payload.new.id || docId,
              } as WithId<T>;
              dataRef.current = next;
              writeDocCache(tableName, docId, next);
              setData(next);
            } else if (payload.eventType === 'DELETE') {
              dataRef.current = null;
              clearDocCache(tableName, docId);
              setData(null);
            } else {
              fetchDoc();
            }
          },
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [tableName, docId, userId, fetchDoc, options?.realtime, supabase]);

  return { data, isLoading, error, forceRefetch };
}
