import Link from 'next/link';

export const AppStoreIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 30 30" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path
      fill="currentColor"
      d="M21.57,17.22c-.22-1.43-1.07-2.67-2.22-3.61,1.06-.9,1.7-2.2,1.7-3.6,0-2.5-1.92-4.22-4.63-4.22-1.7,0-3.17.89-4.14,2.21-1.4-.04-2.89.71-3.83,2-1.43,1.93-1.18,4.55.67,6.17-1.78,1.56-2.03,4.14-.67,6.18.91,1.26,2.34,2.04,3.93,2.04,1.43,0,2.68-.58,3.63-1.6.89.97,2.15,1.6,3.61,1.6,1.59,0,2.99-.78,3.9-2.07.21-.32.4-.66.57-1.02-1.89-.95-3-2.6-3.07-4.52ZM16.23,4.5c.87-1.12,2.05-1.75,3.32-1.75,1.55,0,2.75.92,2.75,2.75,0,1.84-1.3,2.83-2.73,2.83-1.02,0-2.12-.55-2.99-1.52-.39-.44-.69-.93-.84-1.48C15.9,4.96,16.05,4.71,16.23,4.5Zm-5.3,16.14c.78,1.23,2.03,1.96,3.41,1.96.15,0,.3-.01.45-.03-1.03-.84-1.8-1.93-2.28-3.15-.65,1.26-1.5,2.44-2.52,3.31a3.9,3.9,0,0,1,.94-.09Z"
    />
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
