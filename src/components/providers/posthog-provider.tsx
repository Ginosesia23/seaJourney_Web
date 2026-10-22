'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import posthog from 'posthog-js';
import { useUser } from '@/supabase';
import { useDoc } from '@/supabase/database';
import { hasPaidDashboardAccess } from '@/supabase/database/subscription-helpers';
import type { UserProfile } from '@/lib/types';

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';

let didInit = false;

const SUBSCRIPTION_PATHS = new Set(['/offers', '/dashboard/subscription']);
const ONBOARDED_KEY_PREFIX = 'sj_onboarding_completed:';

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

/** No-op until the provider has opted this visitor in (admins and localhost stay out). */
export function captureEvent(event: string, properties?: Record<string, unknown>) {
  if (!didInit || posthog.has_opted_out_capturing()) return;
  posthog.capture(event, properties);
}

/** Once per user per browser: the first time the account has dashboard access. */
function captureOnboardingCompleted(userId: string, role: string | undefined) {
  try {
    const key = `${ONBOARDED_KEY_PREFIX}${userId}`;
    if (window.localStorage.getItem(key)) return;
    window.localStorage.setItem(key, '1');
    posthog.capture('onboarding_completed', { role });
  } catch {
    // localStorage can be unavailable (private mode) — skip rather than spam.
  }
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

    if (hasPaidDashboardAccess(profile)) {
      captureOnboardingCompleted(user.id, raw?.role || undefined);
    }
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
    if (SUBSCRIPTION_PATHS.has(pathname)) {
      posthog.capture('subscription_viewed');
    }
  }, [pathname, shouldCapture]);

  return <>{children}</>;
}
