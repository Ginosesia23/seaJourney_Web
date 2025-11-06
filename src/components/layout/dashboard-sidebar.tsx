'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Home, Ship, LifeBuoy, Award } from 'lucide-react';
import Logo from '../logo';

const navItems = [
  { href: '/dashboard', label: 'Home', icon: Home },
  { href: '/dashboard/sea-time', label: 'Sea Time Log', icon: Ship, disabled: true },
  { href: '/dashboard/testimonials', label: 'Testimonials', icon: LifeBuoy, disabled: true },
  { href: '/dashboard/certificates', label: 'Certificates', icon: Award, disabled: true },
];

export default function DashboardSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden border-r bg-card md:block">
      <div className="flex h-full max-h-screen flex-col gap-2">
        <div className="flex h-16 items-center border-b px-6">
           <Logo className="text-foreground" />
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          <nav className="grid items-start px-4 text-sm font-medium">
            {navItems.map((item) => (
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
          </nav>
        </div>
      </div>
    </aside>
  );
}
