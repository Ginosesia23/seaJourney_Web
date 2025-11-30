
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  Home,
  Ship,
  LifeBuoy,
  Award,
  Globe,
  History,
  User,
  Users,
  Map,
  PieChart,
  BarChart2,
  Trophy,
  Briefcase,
  Download,
  HelpCircle,
  FileText,
  MapPin,
} from 'lucide-react';
import Logo from '@/components/logo';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const navGroups = [
  {
    title: 'General',
    items: [
      { href: '/dashboard', label: 'Home', icon: Home, disabled: false },
    ]
  },
  {
    title: 'Logbook',
    items: [
      { href: '/dashboard/current', label: 'Current', icon: MapPin, disabled: false },
      { href: '/dashboard/history', label: 'History', icon: History, disabled: false },
      { href: '/dashboard/passages', label: 'Passages', icon: Map, disabled: true },
      { href: '/dashboard/vessels', label: 'Vessels', icon: Ship, disabled: false },
    ]
  },
  {
    title: 'Management',
    items: [
        { href: '/dashboard/profile', label: 'Profile', icon: User, disabled: false },
        { href: '/dashboard/crew', label: 'Crew', icon: Users, disabled: false, requiredRole: 'vessel' },
        { href: '/dashboard/testimonials', label: 'Testimonials', icon: LifeBuoy, disabled: false },
        { href: '/dashboard/certificates', label: 'Certificates', icon: Award, disabled: true },
        { href: '/dashboard/export', label: 'Export', icon: Download, disabled: false },
    ]
  },
    {
    title: 'Resources',
    items: [
        { href: '/dashboard/support', label: 'Support', icon: HelpCircle, disabled: true },
        { href: '/dashboard/legal', label: 'Legal', icon: FileText, disabled: true },
    ]
    }
];

interface UserProfile {
  role: 'crew' | 'vessel' | 'admin';
}

export default function DashboardSidebar({ isCollapsed, userProfile }: { isCollapsed?: boolean, userProfile: UserProfile | null }) {
  const pathname = usePathname();

  return (
    <aside className="border-r bg-card">
      <div className="flex h-full max-h-screen flex-col gap-2">
        <div className="flex h-16 items-center border-b px-6 lg:hidden">
           <Logo />
        </div>
        <div className="flex-1 overflow-y-auto pt-2">
          <TooltipProvider delayDuration={0}>
            <nav className={cn("grid items-start font-medium", isCollapsed ? "px-2" : "px-4")}>
              {navGroups.map((group) => (
                  <div key={group.title} className="mb-4">
                      {!isCollapsed && (
                        <h3 className={cn(
                            "py-2 text-xs font-semibold uppercase text-muted-foreground/70 tracking-wider",
                            isCollapsed ? "text-center" : "px-3",
                            isCollapsed && group.title.length > 3 ? "text-[10px]" : "text-xs"
                        )}>
                          {group.title}
                        </h3>
                      )}
                      {group.items.map((item) => {
                        if (item.requiredRole && userProfile?.role !== item.requiredRole && userProfile?.role !== 'admin') {
                          return null;
                        }
                        
                        return isCollapsed ? (
                          <Tooltip key={item.href}>
                            <TooltipTrigger asChild>
                              <Link
                                href={item.href}
                                className={cn(
                                  'flex items-center justify-center gap-3 rounded-lg h-10 w-10 text-muted-foreground transition-all hover:text-primary',
                                  pathname === item.href && 'bg-muted text-accent',
                                  item.disabled && 'cursor-not-allowed opacity-50'
                                )}
                                aria-disabled={item.disabled}
                                onClick={(e) => item.disabled && e.preventDefault()}
                              >
                                <item.icon className="h-5 w-5" />
                                <span className="sr-only">{item.label}</span>
                              </Link>
                            </TooltipTrigger>
                            <TooltipContent side="right">
                              <p>{item.label}</p>
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <Link
                            key={item.href}
                            href={item.href}
                            className={cn(
                              'flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary',
                              pathname === item.href && 'bg-muted text-accent',
                              item.disabled && 'cursor-not-allowed opacity-50'
                            )}
                            aria-disabled={item.disabled}
                            onClick={(e) => item.disabled && e.preventDefault()}
                          >
                            <item.icon className="h-4 w-4" />
                            <span>{item.label}</span>
                          </Link>
                        )
                       })}
                  </div>
              ))}
            </nav>
          </TooltipProvider>
        </div>
      </div>
    </aside>
  );
}
