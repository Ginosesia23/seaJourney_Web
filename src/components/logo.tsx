import Link from 'next/link';
import { cn } from '@/lib/utils';

const LogoIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 64 64"
    fill="currentColor"
    {...props}
  >
    <path d="M0 13.9C0 6.2 6.2 0 13.9 0H50.1C57.8 0 64 6.2 64 13.9V22.5C54.4 22.5 45.4 26.2 38.4 32.8C38.1 33.1 37.7 33.4 37.4 33.6C37.3 33.7 37.2 33.8 37.1 33.9C35.9 34.9 34.6 35.8 33.2 36.5C26.7 39.8 19.4 40.9 12.2 39.7C5.1 38.5 0 32.9 0 25.8V13.9Z" />
    <path d="M64 38.1C64 31 58.9 25.5 51.8 24.3C44.6 23.1 37.3 24.2 30.8 27.5C29.4 28.2 28.1 29.1 26.9 30.1C26.8 30.2 26.7 30.3 26.6 30.4C26.3 30.6 25.9 30.9 25.6 31.2C18.6 37.8 9.6 41.5 0 41.5V50.1C0 57.8 6.2 64 13.9 64H50.1C57.8 64 64 57.8 64 50.1V38.1Z" />
  </svg>
);


const Logo = ({ className }: { className?: string }) => {
  return (
    <Link
      href="/"
      className={cn(
        'flex items-center gap-2 text-white transition-opacity hover:opacity-80',
        className
      )}
    >
      <LogoIcon className="h-7 w-7" />
      <span className="font-headline text-2xl font-bold">SeaJourney</span>
    </Link>
  );
};

export default Logo;
