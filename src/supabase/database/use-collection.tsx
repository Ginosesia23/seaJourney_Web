'use client';

import { useState, useEffect } from 'react';
import { useSupabase } from '../provider';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

export type WithId<T> = T & { id: string };

export interface UseCollectionResult<T> {
  data: WithId<T>[] | null;
  isLoading: boolean;
  error: Error | null;
}

export function useCollection<T = any>(
  tableName: string | null | undefined,
  options?: {
    filter?: string;
    filterValue?: any;
    orderBy?: string;
    ascending?: boolean;
    realtime?: boolean;
  }
): UseCollectionResult<T> {
  const { supabase, user } = useSupabase();
  const [data, setData] = useState<WithId<T>[] | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!tableName) {
      setData(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    let query = supabase.from(tableName).select('*');

    // Apply filters
    if (options?.filter && options?.filterValue !== undefined) {
      query = query.eq(options.filter, options.filterValue);
    }

    // Apply ordering
    if (options?.orderBy) {
      query = query.order(options.orderBy, { ascending: options?.ascending ?? true });
    }

    // Fetch initial data
    const fetchData = async () => {
      const { data: fetchedData, error: fetchError } = await query;

      if (fetchError) {
        setError(fetchError);
        setData(null);
        setIsLoading(false);
        return;
      }

      const results: WithId<T>[] = (fetchedData || []).map((item: any) => ({
        ...item,
        id: item.id || item.uuid || String(item.created_at),
      }));

      setData(results);
      setIsLoading(false);

      // Set up realtime subscription if enabled
      if (options?.realtime !== false) {
        const channel = supabase
          .channel(`${tableName}-changes-${Date.now()}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: tableName,
            },
            async () => {
              // Refetch data on changes
              const { data: newData, error: newError } = await query;
              if (!newError && newData) {
                const updatedResults: WithId<T>[] = (newData || []).map((item: any) => ({
                  ...item,
                  id: item.id || item.uuid || String(item.created_at),
                }));
                setData(updatedResults);
              }
            }
          )
          .subscribe();

        return () => {
          supabase.removeChannel(channel);
        };
      }
    };

    fetchData();
  }, [tableName, user, options?.filter, options?.filterValue, options?.orderBy, options?.ascending, options?.realtime, supabase]);

  return { data, isLoading, error };
}

