'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import Logo from '@/components/logo';

const navLinks = [
  { href: '#features', label: 'Features' },
  { href: '/how-to-use', label: 'How to Use' },
  { href: '#testimonials', label: 'Testimonials' },
  { href: '/coming-soon', label: 'Coming Soon' },
];

const Header = () => {
  const [isOpen, setIsOpen] = useState(false);

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

        <div className="flex items-center gap-4">
          <Button asChild className="hidden rounded-lg md:flex bg-accent hover:bg-accent/90 text-accent-foreground">
            <Link href="#cta">Download App</Link>
          </Button>

          <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden hover:bg-white/10">
                <Menu className="h-6 w-6" />
                <span className="sr-only">Open menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[300px] bg-header text-header-foreground">
              <div className="flex h-full flex-col">
                <div className="mb-8 flex items-center justify-between">
                  <Logo className="text-header-foreground" />
                   <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)} className="hover:bg-white/10">
                    <X className="h-6 w-6" />
                    <span className="sr-only">Close menu</span>
                  </Button>
                </div>
                <nav className="flex flex-col gap-6">
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
                </nav>
                <Button asChild className="mt-8 rounded-lg bg-accent hover:bg-accent/90 text-accent-foreground">
                  <Link href="#cta" onClick={() => setIsOpen(false)}>Download App</Link>
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
};

export default Header;
