
'use client';

import Link from 'next/link';
import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Menu, X, LogOut, LayoutDashboard, ChevronDown, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import Logo from '@/components/logo';
import { Cart } from '@/components/cart';
import { useSupabase, useUser } from '@/supabase';
import { useDoc } from '@/supabase/database';
import type { UserProfile } from '@/lib/types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

const navLinks = [
  { href: '/how-to-use', label: 'How to Use' },
];

const Header = () => {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { supabase } = useSupabase();
  const isShopPage = pathname.startsWith('/shop');
  const { user } = useUser();
  
  // Get user profile from database
  const { data: userProfile } = useDoc<UserProfile>('users', user?.id);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
      router.push('/');
  };

  const getInitials = (name: string) => {
    if (!name) return '';
    const parts = name.trim().split(' ').filter(Boolean);
    if (parts.length === 0) return '';
    if (parts.length === 1) {
      // For single word, take first 2 characters
      return name.substring(0, 2).toUpperCase();
    }
    // For multiple words, take first letter of first two words
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  // Get avatar initials - prefer firstName + lastName, then username, then email
  const getAvatarInitials = () => {
    if (userProfile) {
      // Check for firstName and lastName (from database, may be snake_case)
      const firstName = (userProfile as any).first_name || userProfile.firstName;
      const lastName = (userProfile as any).last_name || userProfile.lastName;
      
      if (firstName && lastName) {
        return (firstName[0] + lastName[0]).toUpperCase();
      }
      if (firstName) {
        return firstName.substring(0, 2).toUpperCase();
      }
      
      // Try username
      const username = userProfile.username;
      if (username && username.length > 1) {
        return getInitials(username);
      }
    }
    
    // Fallback to user metadata or email
    if (user?.user_metadata?.username) {
      return getInitials(user.user_metadata.username);
    }
    
    return user?.email?.[0].toUpperCase() || 'U';
  };

  // Get display name for the button
  const getDisplayName = () => {
    if (userProfile) {
      const firstName = (userProfile as any).first_name || userProfile.firstName;
      const lastName = (userProfile as any).last_name || userProfile.lastName;
      
      if (firstName && lastName) {
        return `${firstName} ${lastName}`;
      }
      if (firstName) {
        return firstName;
      }
      if (userProfile.username) {
        return userProfile.username;
      }
    }
    
    if (user?.user_metadata?.username) {
      return user.user_metadata.username;
    }
    
    return user?.email?.split('@')[0] || 'User';
  };

  const displayName = getDisplayName();

  const isLandingPage = pathname === '/';
  const isDarkPage = pathname === '/' || pathname === '/how-to-use' || pathname.startsWith('/how-to-use');

  return (
    <header 
      className="sticky top-0 z-50 w-full border-b backdrop-blur-sm"
      style={{
        backgroundColor: isDarkPage ? '#000b15' : undefined,
        borderColor: isDarkPage ? 'rgba(255, 255, 255, 0.1)' : undefined,
        color: isDarkPage ? '#ffffff' : undefined,
      }}
    >
      <div className="container mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
        <Logo className="text-header-foreground" />

        <nav className="hidden md:flex md:items-center md:gap-6">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="font-medium text-header-foreground/80 transition-colors hover:text-header-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {isShopPage && <Cart />}
          
          <div className="hidden md:flex items-center gap-2">
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="ghost" 
                    className="flex items-center gap-2 px-4 py-2 rounded-full hover:bg-white/10 border border-white/10 h-auto"
                  >
                    <User className="h-4 w-4 text-header-foreground" />
                    <span className="text-sm font-medium text-header-foreground">
                      {displayName}
                    </span>
                    <ChevronDown className="h-3 w-3 text-header-foreground/60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>My Account</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => router.push('/dashboard')}>
                      <LayoutDashboard className="mr-2 h-4 w-4" />
                      Dashboard
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut}>
                      <LogOut className="mr-2 h-4 w-4" />
                      Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button asChild variant="ghost" className="hover:bg-white/10 rounded-full">
                <Link href="/login">Sign In</Link>
              </Button>
            )}
          </div>


          <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden hover:bg-white/10 rounded-full"
              >
                <Menu className="h-6 w-6" />
                <span className="sr-only">Open menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="w-[300px]"
              style={{
                backgroundColor: isDarkPage ? '#000b15' : undefined,
                color: isDarkPage ? '#ffffff' : undefined,
              }}
            >
              <SheetHeader className="sr-only">
                <SheetTitle>Mobile Menu</SheetTitle>
                <SheetDescription>
                  Navigation links for SeaJourney.
                </SheetDescription>
              </SheetHeader>
              <div className="flex h-full flex-col">
                <div className="mb-8 flex items-center justify-between">
                  <Logo className="text-header-foreground" />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsOpen(false)}
                    className="hover:bg-white/10 rounded-full"
                  >
                    <X className="h-6 w-6" />
                    <span className="sr-only">Close menu</span>
                  </Button>
                </div>
                <nav className="flex flex-1 flex-col gap-6">
                  {navLinks.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="text-lg font-medium text-header-foreground/80 transition-colors hover:text-header-foreground"
                      onClick={() => setIsOpen(false)}
                    >
                      {link.label}
                    </Link>
                  ))}
                   <Link
                      href="/shop"
                      className="text-lg font-medium text-header-foreground/80 transition-colors hover:text-header-foreground"
                      onClick={() => setIsOpen(false)}
                    >
                      Shop
                    </Link>
                </nav>

                <div className="border-t border-primary/10 pt-6">
                  {user ? (
                    <button onClick={() => { handleSignOut(); setIsOpen(false); }} className="text-lg font-medium text-header-foreground/80 transition-colors hover:text-header-foreground flex items-center gap-2">
                      <LogOut className="h-5 w-5" /> Log Out
                    </button>
                  ) : (
                    <Link href="/login" className="text-lg font-medium text-header-foreground/80 transition-colors hover:text-header-foreground" onClick={() => setIsOpen(false)}>
                        Sign In
                    </Link>
                  )}
                </div>

              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
};

export default Header;
