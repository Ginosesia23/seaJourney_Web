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
  const isDashboardRoute = pathname?.startsWith('/dashboard') || pathname === '/offers';
  const isRoadmapRoute = pathname === '/roadmap';

  useEffect(() => {
    // Force light mode on main site (non-dashboard) pages
    // Exclude roadmap page which should maintain dark mode
    // Only apply this on the client side after mount
    if (typeof window !== 'undefined' && !isDashboardRoute && !isRoadmapRoute) {
      // Force light mode for main site pages
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
      setTheme('light');
    } else if (typeof window !== 'undefined' && isRoadmapRoute) {
      // Force dark mode for roadmap page to maintain its appearance
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
      setTheme('dark');
    }
  }, [pathname, isDashboardRoute, isRoadmapRoute, setTheme]);

  return <>{children}</>;
}
