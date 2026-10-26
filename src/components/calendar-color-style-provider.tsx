'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { useTheme } from 'next-themes';

import {
  CALENDAR_COLOR_STYLE_STORAGE_KEY,
  DEFAULT_CALENDAR_COLOR_STYLE,
  getCalendarColorStyle,
  parseCalendarColorStyle,
  getCalendarAppearance,
  setCalendarAppearance,
  setCalendarColorStyle,
  type CalendarAppearance,
  type CalendarColorStyle,
} from '@/lib/calendar-state-colors';
import { useSupabase } from '@/supabase';

type CalendarColorStyleContextValue = {
  style: CalendarColorStyle;
  appearance: CalendarAppearance;
  setStyle: (style: CalendarColorStyle) => void;
};

const CalendarColorStyleContext = createContext<CalendarColorStyleContextValue>({
  style: DEFAULT_CALENDAR_COLOR_STYLE,
  appearance: 'light',
  setStyle: () => {},
});

function readDocumentAppearance(): CalendarAppearance {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

function readStoredStyle(): CalendarColorStyle {
  if (typeof window === 'undefined') return DEFAULT_CALENDAR_COLOR_STYLE;
  try {
    return (
      parseCalendarColorStyle(window.localStorage.getItem(CALENDAR_COLOR_STYLE_STORAGE_KEY)) ??
      DEFAULT_CALENDAR_COLOR_STYLE
    );
  } catch {
    return DEFAULT_CALENDAR_COLOR_STYLE;
  }
}

export function CalendarColorStyleProvider({
  children,
  userId,
  initialStyle,
}: {
  children: ReactNode;
  userId?: string | null;
  initialStyle?: CalendarColorStyle | null;
}) {
  const { session } = useSupabase();
  const { resolvedTheme } = useTheme();
  const [style, setStyleState] = useState<CalendarColorStyle>(
    () => initialStyle ?? readStoredStyle(),
  );
  const nextAppearance: CalendarAppearance =
    resolvedTheme === 'light' || resolvedTheme === 'dark'
      ? resolvedTheme
      : readDocumentAppearance();
  const [appearance, setAppearanceState] = useState<CalendarAppearance>(nextAppearance);

  if (getCalendarAppearance() !== nextAppearance) {
    setCalendarAppearance(nextAppearance);
  }
  if (appearance !== nextAppearance) {
    setAppearanceState(nextAppearance);
  }

  useEffect(() => {
    const next = initialStyle ?? readStoredStyle();
    setCalendarColorStyle(next);
    setStyleState(next);
  }, [initialStyle, userId]);

  useEffect(() => {
    setCalendarColorStyle(style);
  }, [style]);

  useEffect(() => {
    const root = document.documentElement;
    const sync = () => {
      const next = root.classList.contains('dark') ? 'dark' : 'light';
      setCalendarAppearance(next);
      setAppearanceState(next);
    };
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const setStyle = useCallback(
    (next: CalendarColorStyle) => {
      setCalendarColorStyle(next);
      setStyleState(next);
      try {
        window.localStorage.setItem(CALENDAR_COLOR_STYLE_STORAGE_KEY, next);
      } catch {
        // Ignore quota / private mode.
      }
      if (!userId || !session?.access_token) return;
      void fetch('/api/account/calendar-color-style', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ style: next }),
      }).catch(() => {
        // localStorage still holds the choice if the column is not applied yet.
      });
    },
    [session?.access_token, userId],
  );

  const value = useMemo(
    () => ({ style, appearance, setStyle }),
    [appearance, setStyle, style],
  );

  return (
    <CalendarColorStyleContext.Provider value={value}>
      {children}
    </CalendarColorStyleContext.Provider>
  );
}

export function useCalendarColorStyle(): CalendarColorStyleContextValue {
  return useContext(CalendarColorStyleContext);
}

export function useCalendarColorStyleValue(): CalendarColorStyle {
  return useCalendarColorStyle().style || getCalendarColorStyle();
}
