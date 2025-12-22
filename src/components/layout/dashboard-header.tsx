
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Logo from '@/components/logo';
import { Button } from '@/components/ui/button';
import {
  Settings,
  LogOut,
  Sparkles,
  Menu,
  Moon,
  Sun,
  Laptop,
  User,
} from 'lucide-react';
import { useSupabase, useUser } from '@/supabase';
import { Avatar, AvatarFallback } from '../ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal
} from '../ui/dropdown-menu';
import { Badge } from '../ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '../ui/sheet';
import DashboardSidebar from './dashboard-sidebar';
import { useTheme } from 'next-themes';
import { useMemo } from 'react';

interface UserProfile {
  role?: 'crew' | 'captain' | 'vessel' | 'admin';
  position?: string | null;
}


export default function DashboardHeader({ userProfile }: { userProfile: UserProfile | null }) {
  const { supabase } = useSupabase();
  const { user } = useUser();
  const router = useRouter();
  const { setTheme, theme } = useTheme();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
        router.push('/');
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('');
  };

  const getRoleLabel = (role?: string) => {
    switch (role) {
      case 'crew':
        return 'Crew';
      case 'captain':
        return 'Captain';
      case 'vessel':
        return 'Vessel Manager';
      case 'admin':
        return 'Admin';
      default:
        return role || 'User';
    }
  };

  const getRoleBadgeClassName = (role?: string) => {
    switch (role) {
      case 'admin':
        return 'bg-red-500/10 text-red-700 dark:bg-red-500/20 dark:text-red-400 border-red-500/20';
      case 'vessel':
        return 'bg-blue-500/10 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400 border-blue-500/20';
      case 'captain':
        return 'bg-purple-500/10 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400 border-purple-500/20';
      case 'crew':
        return 'bg-green-500/10 text-green-700 dark:bg-green-500/20 dark:text-green-400 border-green-500/20';
      default:
        return 'bg-gray-500/10 text-gray-700 dark:bg-gray-500/20 dark:text-gray-400 border-gray-500/20';
    }
  };

  const roleLabel = useMemo(() => getRoleLabel(userProfile?.role), [userProfile?.role]);
  const position = useMemo(() => (userProfile as any)?.position || null, [userProfile]);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b bg-header px-4 text-header-foreground sm:px-6">
        <div className="flex items-center gap-4">
            <Sheet>
                <SheetTrigger asChild>
                    <Button variant="outline" size="icon" className="shrink-0 lg:hidden rounded-full">
                        <Menu className="h-5 w-5" />
                        <span className="sr-only">Toggle navigation menu</span>
                    </Button>
                </SheetTrigger>
                <SheetContent side="left" className="flex flex-col bg-card p-0">
                    <SheetHeader className="sr-only">
                      <SheetTitle>Navigation Menu</SheetTitle>
                    </SheetHeader>
                   <DashboardSidebar userProfile={userProfile} />
                </SheetContent>
            </Sheet>
            <div className="hidden lg:block">
                <Logo />
            </div>
        </div>

      <div className="flex-1 justify-center px-4 hidden sm:flex">
        <div className="flex items-center gap-2">
          <Badge 
            variant="outline" 
            className={`rounded-full px-4 py-1.5 text-sm font-medium border ${getRoleBadgeClassName(userProfile?.role)}`}
          >
            <span className="font-semibold">{roleLabel}</span>
            {position && (
              <>
                <span className="mx-2 text-muted-foreground">•</span>
                <span className="text-xs">{position}</span>
              </>
            )}
          </Badge>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary/80 text-primary-foreground">
                  {user?.user_metadata?.username
                    ? getInitials(user.user_metadata.username)
                    : user?.email?.[0].toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="sr-only">Toggle user menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>My Account</DropdownMenuLabel>
            <DropdownMenuSeparator />
             <DropdownMenuItem onClick={() => router.push('/dashboard/profile')}>
                <User className="mr-2 h-4 w-4" />
                Profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push('/offers')}>
                <Sparkles className="mr-2 h-4 w-4" />
                Subscription
            </DropdownMenuItem>
            <DropdownMenuItem>
                <Settings className="mr-2 h-4 w-4" />
                Settings
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                <span className="ml-2">Toggle theme</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent>
                  <DropdownMenuItem onClick={() => setTheme('light')}>
                    <Sun className="mr-2 h-4 w-4" />
                    <span>Light</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setTheme('dark')}>
                    <Moon className="mr-2 h-4 w-4" />
                    <span>Dark</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setTheme('system')}>
                    <Laptop className="mr-2 h-4 w-4" />
                    <span>System</span>
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut}>
                <LogOut className="mr-2 h-4 w-4" />
                Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
