
'use client';

import Link from 'next/link';
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
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
import { useUser } from '@/firebase';

const navLinks = [
  { href: '/how-to-use', label: 'Guide' },
  { href: '/dashboard-offering', label: 'Dashboard' },
  { href: '/signup', label: 'Join' },
];

const Header = () => {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const isShopPage = pathname.startsWith('/shop');
  const { user } = useUser();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-header bg-header text-header-foreground backdrop-blur-sm">
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
          {!isShopPage && (
            <Button asChild className="hidden rounded-full md:flex bg-accent hover:bg-accent/90 text-accent-foreground">
              <Link href="/shop">
                Shop
              </Link>
            </Button>
          )}

          {isShopPage && <Cart />}
          
          <div className="hidden md:flex items-center gap-2">
            {user ? (
                <Button asChild variant="ghost" className="hover:bg-white/10 rounded-full">
                    <Link href="/dashboard">Go to Dashboard</Link>
                </Button>
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
              className="w-[300px] bg-header text-header-foreground"
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
                     <Link href="/dashboard" className="text-lg font-medium text-header-foreground/80 transition-colors hover:text-header-foreground" onClick={() => setIsOpen(false)}>
                        Dashboard
                    </Link>
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
