'use client';

import { createClient } from '@supabase/supabase-js';
import { supabaseConfig } from './config';

export function createSupabaseClient() {
  // Check if config values are available
  if (!supabaseConfig.url || !supabaseConfig.anonKey) {
    console.error('Missing Supabase configuration. Please check your environment variables.');
    throw new Error('Missing Supabase configuration');
  }

  return createClient(supabaseConfig.url, supabaseConfig.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

