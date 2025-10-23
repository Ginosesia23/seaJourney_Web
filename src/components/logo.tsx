import Link from 'next/link';
import { Sailboat } from 'lucide-react';
import { cn } from '@/lib/utils';

const Logo = ({ className }: { className?: string }) => {
  return (
    <Link
      href="/"
      className={cn(
        'flex items-center gap-2 text-primary transition-opacity hover:opacity-80',
        className
      )}
    >
      <Sailboat className="h-7 w-7" />
      <span className="font-headline text-2xl font-bold">SeaJourney</span>
    </Link>
  );
};

export default Logo;
