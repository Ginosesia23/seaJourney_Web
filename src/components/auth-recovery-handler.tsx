'use client';

import { useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useSupabase } from '@/supabase';
import {
  getRecoveryFromHash,
  hasRecoveryInSearch,
} from '@/lib/auth-recovery';

/**
 * On the marketing home page only: forward real Supabase recovery links to
 * /reset-password. Ignores unrelated hashes like #membership.
 */
export function AuthRecoveryHandler() {
  const router = useRouter();
  const pathname = usePathname();
  const { supabase } = useSupabase();
  const handledRef = useRef(false);

  useEffect(() => {
    if (pathname !== '/') return;
    if (handledRef.current) return;
    handledRef.current = true;

    const hash = window.location.hash;
    const search = window.location.search;

    const fromHash = getRecoveryFromHash(hash);
    if (fromHash) {
      router.replace(`/reset-password${hash}`);
      return;
    }

    if (hasRecoveryInSearch(search)) {
      router.replace(`/reset-password${search}`);
      return;
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        router.replace('/reset-password');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router, supabase, pathname]);

  return null;
}
