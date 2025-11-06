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
import { cn } from '@/lib/utils';
import { Input } from '../ui/input';
import { Sheet, SheetContent, SheetTrigger } from '../ui/sheet';


const navItems = [
  { href: '/dashboard', label: 'Home', icon: LayoutDashboard },
  { href: '/dashboard/sea-time', label: 'Sea Time Log', icon: Ship, disabled: true },
  { href: '/dashboard/testimonials', label: 'Testimonials', icon: LifeBuoy, disabled: true },
  { href: '/dashboard/certificates', label: 'Certificates', icon: Award, disabled: true },
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
        <Sheet>
            <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="shrink-0 md:hidden">
                    <Menu className="h-5 w-5" />
                    <span className="sr-only">Toggle navigation menu</span>
                </Button>
            </SheetTrigger>
            <SheetContent side="left" className="flex flex-col">
                <nav className="grid gap-2 text-lg font-medium">
                    <Link href="/" className="flex items-center gap-2 text-lg font-semibold mb-4">
                        <Logo className="text-foreground" />
                    </Link>
                     {navItems.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          'mx-[-0.65rem] flex items-center gap-4 rounded-xl px-3 py-2 text-muted-foreground hover:text-foreground',
                          pathname === item.href && 'bg-muted text-foreground',
                          item.disabled && 'cursor-not-allowed opacity-50'
                        )}
                        aria-disabled={item.disabled}
                        onClick={(e) => item.disabled && e.preventDefault()}
                      >
                        <item.icon className="h-5 w-5" />
                        {item.label}
                      </Link>
                    ))}
                </nav>
            </SheetContent>
        </Sheet>

      <div className="w-full flex-1">
        <form>
            <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                    type="search"
                    placeholder="Keyword search..."
                    className="w-full rounded-lg bg-background/10 pl-8 text-header-foreground placeholder:text-header-foreground/60 md:w-1/3 h-9 border-0 focus-visible:ring-primary"
                />
            </div>
        </form>
      </div>

      <div className="ml-auto flex items-center gap-4">
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
