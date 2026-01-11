
import Link from 'next/link';
import { Facebook, Twitter, Instagram } from 'lucide-react';
import Logo from '@/components/logo';

const Footer = () => {
  return (
    <footer 
      className="text-header-foreground border-t border-primary/10"
      style={{
        backgroundColor: '#000b15',
        borderColor: 'rgba(255, 255, 255, 0.1)',
      }}
    >
      <div className="container mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
          <div>
            <Logo className="text-header-foreground" />
            <p className="mt-4 max-w-xs text-sm text-header-foreground/80">
              The essential app for yacht crew and maritime professionals.
            </p>
            <div className="mt-4 flex space-x-4">
              <Link href="#" aria-label="Facebook">
                <Facebook className="h-6 w-6 text-header-foreground/80 hover:text-accent transition-colors" />
              </Link>
              <Link href="#" aria-label="Twitter">
                <Twitter className="h-6 w-6 text-header-foreground/80 hover:text-accent transition-colors" />
              </Link>
              <Link href="https://www.instagram.com/seajourneyapp/" target="_blank" rel="noopener noreferrer" aria-label="Instagram">
                <Instagram className="h-6 w-6 text-header-foreground/80 hover:text-accent transition-colors" />
              </Link>
            </div>
          </div>
          <div>
            <h3 className="font-headline text-lg font-bold text-accent">Explore</h3>
            <ul className="mt-4 space-y-2 text-sm">
              <li><Link href="/how-to-use" className="text-header-foreground/80 hover:text-accent transition-colors">Guide</Link></li>
              <li><Link href="/dashboard-offering" className="text-header-foreground/80 hover:text-accent transition-colors">Dashboard</Link></li>
              <li><Link href="/shop" className="text-header-foreground/80 hover:text-accent transition-colors">Shop</Link></li>
              <li><Link href="/coming-soon" className="text-header-foreground/80 hover:text-accent transition-colors">Pricing</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="font-headline text-lg font-bold text-accent">Company</h3>
            <ul className="mt-4 space-y-2 text-sm">
              <li><Link href="/faq" className="text-header-foreground/80 hover:text-accent transition-colors">FAQ</Link></li>
              <li><Link href="/privacy-policy" className="text-header-foreground/80 hover:text-accent transition-colors">Privacy Policy</Link></li>
              <li><Link href="/terms-of-service" className="text-header-foreground/80 hover:text-accent transition-colors">Terms of Service</Link></li>
              <li><Link href="/cookie-policy" className="text-header-foreground/80 hover:text-accent transition-colors">Cookie Policy</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="font-headline text-lg font-bold text-accent">Officials</h3>
            <ul className="mt-4 space-y-2 text-sm">
              <li><Link href="/verify" className="text-header-foreground/80 hover:text-accent transition-colors">Verify Records</Link></li>
            </ul>
          </div>
        </div>
        <div className="mt-8 border-t border-primary/10 pt-8 text-center text-sm text-header-foreground/60">
          <p>&copy; {new Date().getFullYear()} SeaJourney. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
