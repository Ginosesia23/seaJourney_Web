'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSupabase } from '../provider';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

export type WithId<T> = T & { id: string };

export interface UseDocResult<T> {
  data: WithId<T> | null;
  isLoading: boolean;
  error: Error | null;
  forceRefetch: () => void;
}

export function useDoc<T = any>(
  tableName: string | null | undefined,
  docId: string | null | undefined,
  options?: {
    realtime?: boolean;
  }
): UseDocResult<T> {
  const { supabase, user } = useSupabase();
  const [data, setData] = useState<WithId<T> | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  const [refetchTrigger, setRefetchTrigger] = useState(0);

  const forceRefetch = useCallback(() => {
    setRefetchTrigger((prev) => prev + 1);
  }, []);

  const fetchDoc = useCallback(async () => {
    if (!tableName || !docId || !user) {
      setData(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    console.log(`[useDoc] Fetching ${tableName} with id:`, docId);
    
    const { data: fetchedData, error: fetchError } = await supabase
      .from(tableName)
      .select('*')
      .eq('id', docId)
      .single();

    if (fetchError) {
      console.error(`[useDoc] Error fetching ${tableName}:`, {
        table: tableName,
        docId,
        error: fetchError,
        code: fetchError.code,
        message: fetchError.message,
        details: fetchError.details,
        hint: fetchError.hint,
      });
      setError(fetchError);
      setData(null);
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
      setData({
        ...fetchedData,
        id: fetchedData.id || docId,
      } as WithId<T>);
    } else {
      setData(null);
    }
    setIsLoading(false);
  }, [tableName, docId, user, supabase, refetchTrigger]);

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
              setData({
                ...payload.new,
                id: payload.new.id || docId,
              } as WithId<T>);
            } else if (payload.eventType === 'DELETE') {
              setData(null);
            } else {
              fetchDoc();
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [tableName, docId, user, fetchDoc, options?.realtime, supabase]);

  return { data, isLoading, error, forceRefetch };
}

