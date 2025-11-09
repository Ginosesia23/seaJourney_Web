import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Ship } from 'lucide-react';

const Logo = ({ className }: { className?: string }) => {
  return (
    <Link
      href="/"
      className={cn(
        'flex items-center gap-2 text-white transition-opacity hover:opacity-80',
        className
      )}
    >
      <Ship className="h-8 w-8" />
      <span className="font-headline text-xl font-bold">SeaJourney</span>
    </Link>
  );
};

export default Logo;
