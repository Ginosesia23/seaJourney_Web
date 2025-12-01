/**
 * Server-side Supabase client
 * Use this for server actions and API routes
 */

import { createClient } from '@supabase/supabase-js';
import { supabaseConfig } from './config';

export function createSupabaseServerClient() {
  return createClient(supabaseConfig.url, supabaseConfig.anonKey);
}

