/**
 * Helper functions to work with Supabase database
 * These functions help translate Firestore-style nested paths to Supabase queries
 */

import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Parse a Firestore-style path like "users/{userId}/vessels/{vesselId}" 
 * into table name and filters
 */
export function parsePath(path: string): {
  table: string;
  filters: Array<{ column: string; value: string }>;
} {
  const parts = path.split('/');
  const filters: Array<{ column: string; value: string }> = [];
  let table = '';

  for (let i = 0; i < parts.length; i += 2) {
    const tableName = parts[i];
    const idValue = parts[i + 1];

    if (idValue) {
      // This is a filter
      if (table) {
        // Nested relationship - we'll need to handle this differently
        // For now, we'll use the last table name
      }
      filters.push({ column: `${tableName}_id`, value: idValue });
    } else {
      table = tableName;
    }
  }

  // If we have filters but no explicit table, use the last part
  if (!table && parts.length > 0) {
    table = parts[parts.length - 1];
  }

  return { table, filters };
}

/**
 * Build a Supabase query with filters
 */
export function buildQuery(
  supabase: SupabaseClient,
  table: string,
  filters: Array<{ column: string; value: string }>
) {
  let query = supabase.from(table).select('*');

  filters.forEach((filter) => {
    query = query.eq(filter.column, filter.value);
  });

  return query;
}

/**
 * Convert Firestore Timestamp to ISO string
 */
export function timestampToISO(timestamp: any): string {
  if (typeof timestamp === 'string') return timestamp;
  if (timestamp?.seconds) {
    return new Date(timestamp.seconds * 1000).toISOString();
  }
  if (timestamp instanceof Date) {
    return timestamp.toISOString();
  }
  return new Date().toISOString();
}

/**
 * Convert ISO string to Date
 */
export function isoToDate(iso: string): Date {
  return new Date(iso);
}

