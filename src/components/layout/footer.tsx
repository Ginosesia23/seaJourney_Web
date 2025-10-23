import Link from 'next/link';
import { Facebook, Twitter, Instagram } from 'lucide-react';
import Logo from '@/components/logo';

const Footer = () => {
  return (
    <footer className="bg-primary/5 border-t border-primary/10">
      <div className="container mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
          <div className="md:col-span-2">
            <Logo />
            <p className="mt-4 max-w-xs text-sm text-foreground/80">
              Your AI-Powered Travel Companion.
            </p>
          </div>
          <div>
            <h3 className="font-headline text-lg font-bold text-primary">Explore</h3>
            <ul className="mt-4 space-y-2 text-sm">
              <li><Link href="#features" className="text-foreground/80 hover:text-primary transition-colors">Features</Link></li>
              <li><Link href="#ai-tool" className="text-foreground/80 hover:text-primary transition-colors">AI Tool</Link></li>
              <li><Link href="#testimonials" className="text-foreground/80 hover:text-primary transition-colors">Testimonials</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="font-headline text-lg font-bold text-primary">Follow Us</h3>
            <div className="mt-4 flex space-x-4">
              <Link href="#" aria-label="Facebook">
                <Facebook className="h-6 w-6 text-foreground/80 hover:text-primary transition-colors" />
              </Link>
              <Link href="#" aria-label="Twitter">
                <Twitter className="h-6 w-6 text-foreground/80 hover:text-primary transition-colors" />
              </Link>
              <Link href="#" aria-label="Instagram">
                <Instagram className="h-6 w-6 text-foreground/80 hover:text-primary transition-colors" />
              </Link>
            </div>
          </div>
        </div>
        <div className="mt-8 border-t border-primary/10 pt-8 text-center text-sm text-foreground/60">
          <p>&copy; {new Date().getFullYear()} SeaJourney. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
