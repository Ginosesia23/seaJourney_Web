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

const navGroups = [
  {
    title: 'General',
    items: [
      { href: '/dashboard', label: 'Home', icon: Home, disabled: false },
      { href: '/dashboard/world-map', label: 'World Map', icon: Globe, disabled: false },
    ]
  },
  {
    title: 'Logbook',
    items: [
      { href: '/dashboard/current', label: 'Current', icon: MapPin, disabled: true },
      { href: '/dashboard/history', label: 'History', icon: History, disabled: true },
      { href: '/dashboard/passages', label: 'Passages', icon: Map, disabled: true },
      { href: '/dashboard/vessels', label: 'Vessels', icon: Ship, disabled: true },
    ]
  },
  {
    title: 'Analytics',
    items: [
      { href: '/dashboard/distribution', label: 'Distribution', icon: PieChart, disabled: true },
      { href: '/dashboard/insights', label: 'Insights', icon: BarChart2, disabled: true },
      { href: '/dashboard/achievements', label: 'Achievements', icon: Trophy, disabled: true },
      { href: '/dashboard/career', label: 'Career', icon: Briefcase, disabled: true },
    ]
  },
  {
    title: 'Management',
    items: [
        { href: '/dashboard/profile', label: 'Profile', icon: User, disabled: true },
        { href: '/dashboard/testimonials', label: 'Testimonials', icon: LifeBuoy, disabled: true },
        { href: '/dashboard/certificates', label: 'Certificates', icon: Award, disabled: true },
        { href: '/dashboard/export', label: 'Export', icon: Download, disabled: true },
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

export default function DashboardSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden border-r bg-card lg:block">
      <div className="flex h-full max-h-screen flex-col gap-2">
        <div className="flex h-16 items-center border-b px-6 lg:hidden">
           <Logo />
        </div>
        <div className="flex-1 overflow-y-auto pt-2">
          <nav className="grid items-start px-4 text-sm font-medium">
            {navGroups.map((group) => (
                <div key={group.title} className="mb-4">
                    <h3 className="px-3 py-2 text-xs font-semibold uppercase text-muted-foreground/70 tracking-wider">{group.title}</h3>
                    {group.items.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          'flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary',
                          pathname === item.href && 'bg-muted text-primary',
                          item.disabled && 'cursor-not-allowed opacity-50'
                        )}
                        aria-disabled={item.disabled}
                        onClick={(e) => item.disabled && e.preventDefault()}
                      >
                        <item.icon className="h-4 w-4" />
                        {item.label}
                      </Link>
                    ))}
                </div>
            ))}
          </nav>
        </div>
      </div>
    </aside>
  );
}
