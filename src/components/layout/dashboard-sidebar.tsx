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
} from '@/components/ui/sidebar';
import Logo from '@/components/logo';
import {
  LayoutDashboard,
  Ship,
  LifeBuoy,
  Award,
  User,
  Settings,
} from 'lucide-react';
import { useUser } from '@/firebase';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { cn } from '@/lib/utils';

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
    <Sidebar variant="sidebar" collapsible="icon" className="bg-sidebar text-sidebar-foreground shadow-md">
      <SidebarHeader className="border-b border-sidebar-border">
        <Logo className="hidden text-sidebar-foreground group-data-[collapsible=icon]:hidden" />
        <SidebarTrigger className="hidden text-sidebar-foreground/80 md:flex" />
      </SidebarHeader>

      <SidebarContent>
        <SidebarMenu>
          {mainNav.map((item) => (
            <SidebarMenuItem key={item.href}>
              <Link href={item.href}>
                <SidebarMenuButton
                  isActive={pathname === item.href}
                  tooltip={item.label}
                  aria-disabled={item.disabled}
                  disabled={item.disabled}
                  className={cn(
                    "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    "data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground"
                  )}
                >
                  <item.icon />
                  <span>{item.label}</span>
                </SidebarMenuButton>
              </Link>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
        
        <SidebarGroup className="mt-auto">
             <SidebarMenu>
                {accountNav.map((item) => (
                    <SidebarMenuItem key={item.href}>
                      <Link href={item.href}>
                          <SidebarMenuButton
                            isActive={pathname === item.href}
                            tooltip={item.label}
                            aria-disabled={item.disabled}
                            disabled={item.disabled}
                            className={cn(
                                "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                                "data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground"
                            )}
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

      <SidebarFooter className="border-t border-sidebar-border">
        <div className="flex items-center gap-3 p-2">
            <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary/80 text-primary-foreground">
                    {user?.displayName ? getInitials(user.displayName) : user?.email?.[0].toUpperCase()}
                </AvatarFallback>
            </Avatar>
            <div className="flex flex-col overflow-hidden whitespace-nowrap transition-opacity duration-200 group-data-[collapsible=icon]:opacity-0">
                <span className="text-sm font-medium truncate">{user?.displayName || 'User'}</span>
                <span className="text-xs text-sidebar-foreground/70 truncate">{user?.email}</span>
            </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
