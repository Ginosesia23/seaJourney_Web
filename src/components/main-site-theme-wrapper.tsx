'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { useTheme } from 'next-themes';

/**
 * Wrapper component that forces light mode on main site pages
 * Dashboard pages can use their own theme settings
 */
export function MainSiteThemeWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { setTheme } = useTheme();
  const isDashboardRoute = pathname?.startsWith('/dashboard');
  const isOffersRoute = pathname === '/offers';
  const isRoadmapRoute = pathname === '/roadmap';
  const isDarkRoute = isOffersRoute || isRoadmapRoute;

  useEffect(() => {
    // Force light mode on main site (non-dashboard) pages
    // Force dark on offers and roadmap so they match dashboard / app experience
    if (typeof window === 'undefined') return;
    if (isDarkRoute) {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
      setTheme('dark');
    } else if (!isDashboardRoute) {
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
      setTheme('light');
    }
  }, [pathname, isDashboardRoute, isOffersRoute, isRoadmapRoute, isDarkRoute, setTheme]);

  return <>{children}</>;
}
