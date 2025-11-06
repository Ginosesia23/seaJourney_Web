'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import Logo from '@/components/logo';
import { Button } from '@/components/ui/button';
import {
  LayoutDashboard,
  Ship,
  LifeBuoy,
  Award,
  Settings,
  Search,
  LogOut,
  Sparkles,
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
import { cn } from '@/lib/utils';
import { Input } from '../ui/input';

const navItems = [
  { href: '/dashboard', label: 'Home' },
  { href: '/dashboard/sea-time', label: 'Sea Time Log', disabled: true },
  { href: '/dashboard/testimonials', label: 'Testimonials', disabled: true },
  { href: '/dashboard/certificates', label: 'Certificates', disabled: true },
];

export default function DashboardHeader() {
  const pathname = usePathname();
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
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-header px-4 text-header-foreground sm:px-6">
      <Logo className="text-header-foreground" />
      <nav className="hidden flex-col gap-6 text-lg font-medium md:flex md:flex-row md:items-center md:gap-5 md:text-sm lg:gap-6">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'transition-colors hover:text-header-foreground',
              pathname === item.href
                ? 'text-header-foreground font-semibold'
                : 'text-header-foreground/70',
              item.disabled && 'cursor-not-allowed opacity-50'
            )}
            aria-disabled={item.disabled}
            onClick={(e) => item.disabled && e.preventDefault()}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-4">
        <div className="relative hidden md:block">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
                type="search"
                placeholder="Keyword search..."
                className="w-full rounded-lg bg-background/10 pl-8 text-header-foreground placeholder:text-header-foreground/60 md:w-[200px] lg:w-[300px] h-9 border-0 focus-visible:ring-primary"
            />
        </div>
        <Button variant="ghost" size="icon" className="text-header-foreground hover:bg-white/10 hover:text-header-foreground">
            <Settings className="h-5 w-5" />
            <span className="sr-only">Settings</span>
        </Button>
        <Button size="sm" className="bg-accent hover:bg-accent/90 text-accent-foreground">
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
