import Link from 'next/link';

export const AppStoreIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 41 41" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M34.566 21.986c.04-6.42-4.9-10.74-5.3-11.1-3.26-3.46-8.2-3.82-10.14-.1-1.84 3.52.48 8.84 4.54 11.22 3.86 2.26 8.04.74 10.9-2.02zM28.426 6.026c-3-3.32-7.3-3.9-10.22-1.66-1.12.86-2.1 2.1-2.82 3.42-3.82 7.02-1.16 14.92 3.02 18.52 1.34 1.14 2.92 1.84 4.6 1.84 1.48 0 3.22-.52 4.68-1.58 3.8-2.76 5.24-7.52 5.3-12.28a17.4 17.4 0 00-4.56-8.26z" fill="currentColor"/>
  </svg>
);

const CTA = () => {
  return (
    <section id="cta" className="bg-background">
      <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-headline text-3xl font-bold tracking-tight text-primary sm:text-4xl">
            Ready to Advance Your Maritime Career?
          </h2>
          <p className="mt-4 text-lg leading-8 text-foreground/80">
            Download SeaJourney today and take the next step in your professional journey.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link href="https://apps.apple.com/gb/app/seajourney/id6751553072" target="_blank" rel="noopener noreferrer" className="flex w-full sm:w-auto items-center justify-center rounded-lg bg-primary px-5 py-3 text-base font-medium text-primary-foreground shadow-md transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-primary">
              <AppStoreIcon className="mr-3 h-8 w-8" />
              <div>
                <p className="text-xs">Download on the</p>
                <p className="text-xl font-semibold">App Store</p>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
};

export default CTA;
