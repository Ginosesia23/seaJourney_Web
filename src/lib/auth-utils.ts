'use client';

import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Signs out the user locally without invalidating the server-side session.
 * This allows the user to log out of the website without affecting their
 * mobile app session, and vice versa.
 * 
 * @param supabase - The Supabase client instance
 */
export async function signOutLocal(supabase: SupabaseClient): Promise<void> {
  // Get the Supabase project reference from the URL to construct the storage key
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const projectRef = supabaseUrl.split('//')[1]?.split('.')[0] || '';
  
  // Clear all Supabase-related localStorage items
  // Supabase stores sessions with keys like: sb-<project-ref>-auth-token
  const storageKeys = Object.keys(localStorage);
  storageKeys.forEach((key) => {
    if (key.includes('supabase') || (projectRef && key.startsWith(`sb-${projectRef}`))) {
      localStorage.removeItem(key);
    }
  });

  // Also clear sessionStorage as a precaution
  const sessionKeys = Object.keys(sessionStorage);
  sessionKeys.forEach((key) => {
    if (key.includes('supabase') || key.startsWith(`sb-${projectRef}`)) {
      sessionStorage.removeItem(key);
    }
  });

  // Clear the current session by setting it to null
  // This triggers the auth state change listener without calling the server
  // We use a try-catch because setSession might fail with invalid tokens,
  // but that's fine - we just want to clear the local state
  try {
    // Force clear the session by removing the session from the client
    // This will trigger onAuthStateChange with a null session
    await supabase.auth.setSession({
      access_token: '',
      refresh_token: '',
    } as any);
  } catch (error) {
    // Ignore errors - we're just clearing local state
    console.log('[AUTH] Local sign out: cleared storage, session will be cleared on next check');
  }

  // Force a session refresh to trigger the auth state change
  // This will detect the missing tokens and set session to null
  try {
    await supabase.auth.getSession();
  } catch (error) {
    // Ignore errors - session is already cleared
  }

  // Note: We're NOT calling supabase.auth.signOut() as that would invalidate
  // the session on the server side, affecting all devices (web and mobile app)
}

/**
 * Signs out the user globally, invalidating the session on all devices.
 * Use this when you want to log out from all devices (e.g., security concerns).
 * 
 * @param supabase - The Supabase client instance
 */
export async function signOutGlobal(supabase: SupabaseClient): Promise<void> {
  await supabase.auth.signOut();
}
