'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
} from '@/components/ui/sidebar';
import Logo from '@/components/logo';
import {
  LayoutDashboard,
  Ship,
  LifeBuoy,
  Award,
  User,
  Settings,
  GitBranch,
} from 'lucide-react';
import { useUser } from '@/firebase';
import { Avatar, AvatarFallback } from '../ui/avatar';

const mainNav = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/sea-time', label: 'Sea Time Log', icon: Ship, disabled: true },
  { href: '/dashboard/testimonials', label: 'Testimonials', icon: LifeBuoy, disabled: true },
  { href: '/dashboard/certificates', label: 'Certificates', icon: Award, disabled: true },
];

const accountNav = [
  { href: '/dashboard/profile', label: 'Profile', icon: User, disabled: true },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings, disabled: true },
];

export function DashboardSidebar() {
  const pathname = usePathname();
  const { user } = useUser();

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('');
  };

  return (
    <Sidebar variant="sidebar" collapsible="icon">
      <SidebarHeader>
        <Logo className="hidden group-data-[collapsible=icon]:hidden" />
        <SidebarTrigger className="hidden md:flex" />
      </SidebarHeader>

      <SidebarContent>
        <SidebarMenu>
          {mainNav.map((item) => (
            <SidebarMenuItem key={item.href}>
              <Link href={item.href} legacyBehavior passHref>
                <SidebarMenuButton
                  isActive={pathname === item.href}
                  tooltip={item.label}
                  aria-disabled={item.disabled}
                  disabled={item.disabled}
                >
                  <item.icon />
                  <span>{item.label}</span>
                </SidebarMenuButton>
              </Link>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
        
        <SidebarGroup className="mt-auto">
            <SidebarGroupLabel>Account</SidebarGroupLabel>
             <SidebarMenu>
                {accountNav.map((item) => (
                    <SidebarMenuItem key={item.href}>
                    <Link href={item.href} legacyBehavior passHref>
                        <SidebarMenuButton
                        isActive={pathname === item.href}
                        tooltip={item.label}
                        aria-disabled={item.disabled}
                        disabled={item.disabled}
                        >
                        <item.icon />
                        <span>{item.label}</span>
                        </SidebarMenuButton>
                    </Link>
                    </SidebarMenuItem>
                ))}
             </SidebarMenu>
        </SidebarGroup>

      </SidebarContent>

      <SidebarFooter>
        <div className="flex items-center gap-3 p-2">
            <Avatar className="h-8 w-8">
                <AvatarFallback>
                    {user?.displayName ? getInitials(user.displayName) : user?.email?.[0].toUpperCase()}
                </AvatarFallback>
            </Avatar>
            <div className="flex flex-col overflow-hidden whitespace-nowrap transition-opacity duration-200 group-data-[collapsible=icon]:opacity-0">
                <span className="text-sm font-medium truncate">{user?.displayName || 'User'}</span>
                <span className="text-xs text-muted-foreground truncate">{user?.email}</span>
            </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
