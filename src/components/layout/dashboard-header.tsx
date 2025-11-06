'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Logo from '@/components/logo';
import { Button } from '@/components/ui/button';
import {
  Settings,
  Search,
  LogOut,
  Sparkles,
  Menu,
} from 'lucide-react';
import { useAuth, useUser } from '@/firebase';
import { Avatar, AvatarFallback } from '../ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { Input } from '../ui/input';
import { Sheet, SheetContent, SheetTrigger } from '../ui/sheet';
import DashboardSidebar from './dashboard-sidebar';


export default function DashboardHeader() {
  const auth = useAuth();
  const { user } = useUser();
  const router = useRouter();

  const handleSignOut = () => {
    if (auth) {
      auth.signOut();
      router.push('/');
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('');
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b bg-header px-4 text-header-foreground sm:px-6">
        <div className="flex items-center gap-4">
            <Sheet>
                <SheetTrigger asChild>
                    <Button variant="outline" size="icon" className="shrink-0 lg:hidden text-foreground">
                        <Menu className="h-5 w-5" />
                        <span className="sr-only">Toggle navigation menu</span>
                    </Button>
                </SheetTrigger>
                <SheetContent side="left" className="flex flex-col bg-card p-0">
                   <DashboardSidebar />
                </SheetContent>
            </Sheet>
            <div className="hidden lg:block">
                <Logo />
            </div>
        </div>

      <div className="flex-1 justify-center px-4 hidden sm:flex">
        <form className="w-full max-w-md">
            <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                    type="search"
                    placeholder="Keyword search..."
                    className="w-full rounded-lg bg-background/10 pl-8 text-header-foreground placeholder:text-header-foreground/60 md:w-full h-9 border-0 focus-visible:ring-primary"
                />
            </div>
        </form>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="text-header-foreground hover:bg-white/10 hover:text-header-foreground hidden sm:flex">
            <Settings className="h-5 w-5" />
            <span className="sr-only">Settings</span>
        </Button>
        <Button size="sm" variant="default" className="hidden sm:flex">
            <Sparkles className="mr-2 h-4 w-4" />
            Upgrade
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full hover:bg-white/10">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary/80 text-primary-foreground">
                  {user?.displayName
                    ? getInitials(user.displayName)
                    : user?.email?.[0].toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="sr-only">Toggle user menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>My Account</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Profile</DropdownMenuItem>
            <DropdownMenuItem>Settings</DropdownMenuItem>
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
