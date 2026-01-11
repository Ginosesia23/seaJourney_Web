'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { useTheme } from 'next-themes';

/**
 * Wrapper component that forces dark mode on main site pages
 * Dashboard pages can use their own theme settings
 */
export function MainSiteThemeWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { setTheme } = useTheme();
  const isDashboardRoute = pathname?.startsWith('/dashboard') || pathname === '/offers';

  useEffect(() => {
    // Force dark mode on main site (non-dashboard) pages
    // Only apply this on the client side after mount
    if (typeof window !== 'undefined' && !isDashboardRoute) {
      // Force dark mode for main site pages
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
      setTheme('dark');
    }
  }, [pathname, isDashboardRoute, setTheme]);

  return <>{children}</>;
}
