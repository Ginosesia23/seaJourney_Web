'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { useTheme } from 'next-themes';

/**
 * Aligns the document/next-themes class with marketing pages that expect a
 * fixed look. The landing page defaults to dark (visitors can switch to light
 * via its own theme button). Offers/roadmap stay dark; other main-site pages
 * stay light. Dashboard keeps whatever the user chose in-app.
 */
export function MainSiteThemeWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { setTheme } = useTheme();
  const isDashboardRoute = pathname?.startsWith('/dashboard');
  const isLandingRoute = pathname === '/';
  const isOffersRoute = pathname === '/offers';
  const isRoadmapRoute = pathname === '/roadmap';
  const isDarkRoute = isLandingRoute || isOffersRoute || isRoadmapRoute;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isDashboardRoute) return;

    // Landing uses its own light override via data-wk-force; keep the document
    // on dark by default so the first paint matches. If the visitor chose light
    // on the landing page, honour that preference for the html class too.
    if (isLandingRoute) {
      let landingMode: 'light' | 'dark' = 'dark';
      try {
        const saved = window.localStorage.getItem('wk-theme-mode');
        if (saved === 'light' || saved === 'dark') landingMode = saved;
      } catch {
        /* ignore */
      }
      if (landingMode === 'light') {
        document.documentElement.classList.add('light');
        document.documentElement.classList.remove('dark');
        setTheme('light');
      } else {
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('light');
        setTheme('dark');
      }
      return;
    }

    if (isDarkRoute) {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
      setTheme('dark');
    } else {
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
      setTheme('light');
    }
  }, [
    pathname,
    isDashboardRoute,
    isLandingRoute,
    isOffersRoute,
    isRoadmapRoute,
    isDarkRoute,
    setTheme,
  ]);

  return <>{children}</>;
}
