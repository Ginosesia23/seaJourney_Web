import Link from 'next/link';
import { cn } from '@/lib/utils';
import Image from 'next/image';

const Logo = ({ className }: { className?: string }) => {
  return (
    <Link
      href="/"
      className={cn(
        'flex items-center gap-2 text-white transition-opacity hover:opacity-80',
        className
      )}
    >
      <Image 
        src="/seajourney-logo.svg" 
        alt="SeaJourney Logo" 
        width={140} 
        height={32}
        className="h-8 w-auto"
      />
    </Link>
  );
};

export default Logo;
