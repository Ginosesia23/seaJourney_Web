'use client';

import * as React from 'react';

import { useIsMobile } from '@/hooks/use-mobile';
import {
  ACTIVITY_RAIL_REFRESH_EVENT,
  emptyActivityRailCounts,
  type ActivityRailCounts,
  type ActivityRailItem,
  type ActivityRailPayload,
} from '@/lib/activity-rail';
import { toast } from '@/hooks/use-toast';
import { useSupabase } from '@/supabase';

const COOKIE_NAME = 'activity_rail_state';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
const SHORTCUT = '.';
const POLL_MS = 60_000;
const DEBOUNCE_MS = 350;

const RAIL_REALTIME_TABLES = [
  'daily_state_logs',
  'certificates',
  'visa_tracker',
  'users',
  'vessels',
  'vessel_assignments',
  'testimonials',
  'vessel_sea_time_offers',
  'vessel_sea_time_access_requests',
  'vessel_plan_coverage_requests',
  'sea_time_requests',
  'vessel_claim_requests',
  'captain_role_applications',
  'trb_signoff_requests',
  'trb_batch_signoff_requests',
  'ais_state_reports',
  'feedback',
  'passage_logs',
] as const;

type ActivityRailContextValue = {
  open: boolean;
  setOpen: (open: boolean | ((value: boolean) => boolean)) => void;
  toggle: () => void;
  openMobile: boolean;
  setOpenMobile: (open: boolean) => void;
  isMobile: boolean;
  items: ActivityRailItem[];
  counts: ActivityRailCounts;
  isLoading: boolean;
  refresh: (opts?: { silent?: boolean }) => void;
  dismissMilestone: (item: ActivityRailItem) => void;
};

const ActivityRailContext = React.createContext<ActivityRailContextValue | null>(
  null,
);

function readStoredOpen(): boolean {
  if (typeof document === 'undefined') return true;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${COOKIE_NAME}=(true|false)`),
  );
  if (!match) return true;
  return match[1] === 'true';
}

export function useActivityRail() {
  const context = React.useContext(ActivityRailContext);
  if (!context) {
    throw new Error('useActivityRail must be used within ActivityRailProvider.');
  }
  return context;
}

export function ActivityRailProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const isMobile = useIsMobile();
  const { session, supabase, user } = useSupabase();
  const [open, setOpenState] = React.useState(true);
  const [hydrated, setHydrated] = React.useState(false);
  const [openMobile, setOpenMobile] = React.useState(false);
  const [items, setItems] = React.useState<ActivityRailItem[]>([]);
  const [counts, setCounts] = React.useState<ActivityRailCounts>(
    emptyActivityRailCounts(),
  );
  const [isLoading, setIsLoading] = React.useState(true);

  const tokenRef = React.useRef(session?.access_token);
  tokenRef.current = session?.access_token;
  const abortRef = React.useRef<AbortController | null>(null);
  const debounceRef = React.useRef<number | null>(null);
  const seenMilestoneIdsRef = React.useRef<Set<string>>(new Set());
  const milestonesHydratedRef = React.useRef(false);

  React.useEffect(() => {
    setOpenState(readStoredOpen());
    setHydrated(true);
  }, []);

  const setOpen = React.useCallback(
    (value: boolean | ((current: boolean) => boolean)) => {
      setOpenState((current) => {
        const next = typeof value === 'function' ? value(current) : value;
        document.cookie = `${COOKIE_NAME}=${next}; path=/; max-age=${COOKIE_MAX_AGE}`;
        return next;
      });
    },
    [],
  );

  const toggle = React.useCallback(() => {
    if (isMobile) {
      setOpenMobile((current) => !current);
      return;
    }
    setOpen((current) => !current);
  }, [isMobile, setOpen]);

  const refresh = React.useCallback((opts?: { silent?: boolean }) => {
    const token = tokenRef.current;
    if (!token) {
      setIsLoading(false);
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    if (!opts?.silent) setIsLoading(true);
    void (async () => {
      try {
        const res = await fetch('/api/activity-rail', {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (!res.ok) throw new Error('Failed to load activity rail');
        const json = (await res.json()) as ActivityRailPayload;
        const nextItems = Array.isArray(json.items) ? json.items : [];
        const newMilestones = nextItems.filter(
          (item) =>
            item.kind === 'log_milestone' &&
            !seenMilestoneIdsRef.current.has(item.id),
        );
        if (milestonesHydratedRef.current) {
          for (const milestone of newMilestones) {
            toast({
              title: milestone.title,
              description: milestone.description,
            });
          }
        }
        milestonesHydratedRef.current = true;
        for (const milestone of newMilestones) {
          seenMilestoneIdsRef.current.add(milestone.id);
        }
        setItems(nextItems);
        setCounts(json.counts || emptyActivityRailCounts());
      } catch (error) {
        if ((error as { name?: string })?.name === 'AbortError') return;
        console.error('[activity-rail]', error);
        if (!opts?.silent) {
          setItems([]);
          setCounts(emptyActivityRailCounts());
        }
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    })();
  }, []);

  const scheduleSilentRefresh = React.useCallback(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      refresh({ silent: true });
    }, DEBOUNCE_MS);
  }, [refresh]);

  const dismissMilestone = React.useCallback(
    (item: ActivityRailItem) => {
      const [metric, thresholdRaw] = String(item.meta || '').split(':');
      const threshold = Number(thresholdRaw);
      if (
        (metric !== 'sea_days' &&
          metric !== 'distance_nm' &&
          metric !== 'passages') ||
        !Number.isFinite(threshold)
      ) {
        return;
      }
      seenMilestoneIdsRef.current.add(item.id);
      setItems((current) => current.filter((row) => row.id !== item.id));
      setCounts((current) => {
        const milestones = Math.max(0, current.milestones - 1);
        const total = Math.max(0, current.total - 1);
        return { ...current, milestones, total };
      });
      const token = tokenRef.current;
      if (!token) return;
      void (async () => {
        try {
          const res = await fetch('/api/activity-rail/milestones', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ metric, threshold }),
          });
          const json = await res.json().catch(() => ({}));
          if (!res.ok) {
            toast({
              title: 'Could not dismiss milestone',
              description:
                typeof json.error === 'string'
                  ? json.error
                  : 'Please try again.',
              variant: 'destructive',
            });
            refresh({ silent: true });
          }
        } catch (error) {
          console.error('[activity-rail] dismiss milestone', error);
          refresh({ silent: true });
        }
      })();
    },
    [refresh],
  );

  React.useEffect(() => {
    seenMilestoneIdsRef.current = new Set();
    milestonesHydratedRef.current = false;
    refresh();
    return () => {
      abortRef.current?.abort();
    };
  }, [refresh, user?.id]);

  React.useEffect(() => {
    const onFocus = () => refresh({ silent: true });
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh({ silent: true });
    };
    const onLocalChange = () => scheduleSilentRefresh();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener(ACTIVITY_RAIL_REFRESH_EVENT, onLocalChange);
    const interval = window.setInterval(() => refresh({ silent: true }), POLL_MS);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener(ACTIVITY_RAIL_REFRESH_EVENT, onLocalChange);
      window.clearInterval(interval);
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [refresh, scheduleSilentRefresh]);

  React.useEffect(() => {
    if (!user?.id) return;
    let channel = supabase.channel(`activity-rail-${user.id}`);
    for (const table of RAIL_REALTIME_TABLES) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        scheduleSilentRefresh,
      );
    }
    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, user?.id, scheduleSilentRefresh]);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== SHORTCUT || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      toggle();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggle]);

  const value = React.useMemo<ActivityRailContextValue>(
    () => ({
      open: hydrated ? open : true,
      setOpen,
      toggle,
      openMobile,
      setOpenMobile,
      isMobile,
      items,
      counts,
      isLoading,
      refresh,
      dismissMilestone,
    }),
    [
      hydrated,
      open,
      setOpen,
      toggle,
      openMobile,
      isMobile,
      items,
      counts,
      isLoading,
      refresh,
      dismissMilestone,
    ],
  );

  return (
    <ActivityRailContext.Provider value={value}>
      {children}
    </ActivityRailContext.Provider>
  );
}
