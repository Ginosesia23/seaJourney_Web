'use client';

import { createClient } from '@supabase/supabase-js';
import { supabaseConfig } from '@/supabase/config';

/**
 * Creates a public/anonymous Supabase client for unauthenticated operations.
 * This is used for public verification pages that don't require authentication.
 */
export function createPublicSupabaseClient() {
  if (!supabaseConfig.url || !supabaseConfig.anonKey) {
    console.error('Missing Supabase configuration. Please check your environment variables.');
    throw new Error('Missing Supabase configuration');
  }

  return createClient(supabaseConfig.url, supabaseConfig.anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
