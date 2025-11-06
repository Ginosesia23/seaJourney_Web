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
        src="/seajourney_Icon.svg"
        alt="SeaJourney Logo"
        width={24}
        height={24}
        className="h-6 w-6"
      />
      <span className="font-headline text-xl font-bold">SeaJourney</span>
    </Link>
  );
};

export default Logo;
