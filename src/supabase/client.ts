'use client';

import { createClient } from '@supabase/supabase-js';
import { supabaseConfig } from './config';

export function createSupabaseClient() {
  return createClient(supabaseConfig.url, supabaseConfig.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

