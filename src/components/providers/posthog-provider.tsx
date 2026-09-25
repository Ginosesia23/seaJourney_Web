'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import posthog from 'posthog-js';
import { useUser } from '@/supabase';
import { useDoc } from '@/supabase/database';
import type { UserProfile } from '@/lib/types';

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';

let didInit = false;

/** Local dev traffic would otherwise pollute the production project. */
function isLocalHost(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host.endsWith('.local');
}

const POSTHOG_ENABLED =
  Boolean(POSTHOG_KEY) &&
  (process.env.NEXT_PUBLIC_POSTHOG_CAPTURE_LOCALHOST === 'true' || !isLocalHost());

function initPostHog() {
  if (didInit || typeof window === 'undefined' || !POSTHOG_KEY) return;
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    capture_pageview: false,
    capture_pageleave: true,
    capture_exceptions: true,
    persistence: 'localStorage+cookie',
    // Nothing is sent until we know who the visitor is (admins stay out).
    opt_out_capturing_by_default: true,
  });
  didInit = true;
}

function profileRole(profile: UserProfile | null | undefined): string {
  return String((profile as { role?: string } | null)?.role || '').toLowerCase();
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, isUserLoading } = useUser();
  const { data: profile, isLoading: isProfileLoading } = useDoc<UserProfile>('users', user?.id);

  const isAdmin = profileRole(profile) === 'admin';
  // useDoc reports "not loading" for a render before the profile fetch
  // starts — wait for the signed-in user's own row before deciding.
  const identityReady =
    !isUserLoading &&
    (!user?.id || (!isProfileLoading && (profile as { id?: string } | null)?.id === user.id));
  const shouldCapture = POSTHOG_ENABLED && identityReady && !isAdmin;

  useEffect(() => {
    if (!POSTHOG_ENABLED) return;
    initPostHog();
    if (!identityReady) return;

    if (isAdmin) {
      // No reset(): it mints a fresh anonymous distinct_id on every load.
      if (!posthog.has_opted_out_capturing()) posthog.opt_out_capturing();
      return;
    }

    if (posthog.has_opted_out_capturing()) posthog.opt_in_capturing();

    if (!user?.id) return;

    const raw = profile as {
      role?: string;
      username?: string;
      firstName?: string;
      lastName?: string;
      first_name?: string;
      last_name?: string;
    } | null;
    const first = raw?.firstName || raw?.first_name || '';
    const last = raw?.lastName || raw?.last_name || '';
    const name = `${first} ${last}`.trim();
    posthog.identify(user.id, {
      email: user.email,
      role: raw?.role || undefined,
      username: raw?.username || undefined,
      name: name || undefined,
      seaJourney_user_id: user.id,
    });
  }, [identityReady, isAdmin, user?.id, user?.email, profile]);

  useEffect(() => {
    if (!shouldCapture || !pathname) return;
    initPostHog();
    if (typeof posthog.has_opted_out_capturing === 'function' && posthog.has_opted_out_capturing()) {
      return;
    }
    posthog.capture('$pageview', {
      $current_url: window.location.href,
      $pathname: pathname,
    });
  }, [pathname, shouldCapture]);

  return <>{children}</>;
}
