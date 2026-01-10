'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useSupabase } from '@/supabase';

export function AuthRecoveryHandler() {
  const router = useRouter();
  const pathname = usePathname();
  const { supabase } = useSupabase();
  const [hasChecked, setHasChecked] = useState(false);

  useEffect(() => {
    // Only run on root page
    if (pathname !== '/') return;

    const checkForRecoverySession = async () => {
      if (hasChecked) return;
      setHasChecked(true);

      // Check URL hash for recovery token (Supabase sends tokens in hash)
      const hashParams = window.location.hash;
      if (hashParams) {
        const params = new URLSearchParams(hashParams.substring(1));
        const type = params.get('type');
        const accessToken = params.get('access_token');

        if (type === 'recovery' && accessToken) {
          console.log('[AUTH RECOVERY HANDLER] Detected recovery token in hash, redirecting to /reset-password');
          // Redirect to reset password page with hash preserved
          router.replace(`/reset-password${hashParams}`);
          return;
        }
      }

      // Check query parameters (some email clients might strip hash)
      const searchParams = new URLSearchParams(window.location.search);
      const type = searchParams.get('type');
      const token = searchParams.get('token') || searchParams.get('token_hash');

      if (type === 'recovery' && token) {
        console.log('[AUTH RECOVERY HANDLER] Detected recovery token in query, redirecting to /reset-password');
        // Redirect to reset password page with query params
        router.replace(`/reset-password?${searchParams.toString()}`);
        return;
      }

      // Check for existing recovery session (Supabase might have already processed it)
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session) {
        // If we have a session and there's recovery-related data in URL, redirect
        if (hashParams || type === 'recovery') {
          console.log('[AUTH RECOVERY HANDLER] Found session with recovery indicators, redirecting to /reset-password');
          router.replace('/reset-password');
          return;
        }
      }

      // Listen for PASSWORD_RECOVERY events
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((event, session) => {
        console.log('[AUTH RECOVERY HANDLER] Auth state change:', event, !!session);
        if (event === 'PASSWORD_RECOVERY' && session) {
          console.log('[AUTH RECOVERY HANDLER] PASSWORD_RECOVERY event detected, redirecting to /reset-password');
          router.replace('/reset-password');
        }
      });

      // Also check session after a delay (Supabase might process hash asynchronously)
      setTimeout(async () => {
        const {
          data: { session: delayedSession },
        } = await supabase.auth.getSession();
        
        if (delayedSession && (hashParams || type === 'recovery')) {
          console.log('[AUTH RECOVERY HANDLER] Delayed check found session, redirecting to /reset-password');
          router.replace('/reset-password');
        }
      }, 1000);

      return () => {
        subscription.unsubscribe();
      };
    };

    checkForRecoverySession();
  }, [router, supabase, pathname, hasChecked]);

  return null; // This component doesn't render anything
}

