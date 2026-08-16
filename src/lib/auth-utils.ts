'use client';

import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Signs out only this browser/tab session.
 *
 * Uses Supabase's official `scope: 'local'` so:
 *  - the in-memory GoTrue client is cleaned up correctly
 *  - `SIGNED_OUT` fires and React auth state updates
 *  - sessions on other devices (e.g. the mobile app) stay valid
 *
 * Do NOT manually wipe localStorage + call `setSession('')` — that
 * leaves the client mid-flight with empty tokens, and the next login
 * can fail profile fetches until a hard refresh recreates the client.
 */
export async function signOutLocal(supabase: SupabaseClient): Promise<void> {
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error) {
    console.error('[AUTH] Local sign out failed:', error);
    // Best-effort fallback: still try to clear any residual storage so the
    // UI can recover even if the network call to revoke this session failed.
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
      const projectRef = supabaseUrl.split('//')[1]?.split('.')[0] || '';
      for (const key of Object.keys(localStorage)) {
        if (
          key.includes('supabase') ||
          (projectRef && key.startsWith(`sb-${projectRef}`))
        ) {
          localStorage.removeItem(key);
        }
      }
    } catch {
      /* ignore */
    }
  }
}

/**
 * Signs out the user globally, invalidating sessions on all devices.
 * Use this for security-sensitive flows (e.g. password change).
 */
export async function signOutGlobal(supabase: SupabaseClient): Promise<void> {
  const { error } = await supabase.auth.signOut({ scope: 'global' });
  if (error) {
    console.error('[AUTH] Global sign out failed:', error);
    throw error;
  }
}
