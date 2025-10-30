import Link from 'next/link';

export const AppStoreIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path 
      fill="currentColor"
      d="M19.34.33a4.78 4.78 0 0 0-3.32 1.48 4.55 4.55 0 0 0-1.23 3.32c0 2.45 1.83 3.65 3.31 3.65a1.6 1.6 0 0 0 .43 0c1.23-.22 2.65-1.1 3.73-2.91a.48.48 0 0 0 .09-.26c0-.21-.12-.33-.35-.33a7.49 7.49 0 0 0-2.31.39c-1.34.48-2.52 1-3.69 1-1.45 0-2.62-1-2.62-2.51s1.1-2.43 2.5-2.43c.9 0 1.65.51 2.22.51s1.1-.47 1.87-1.29a5.16 5.16 0 0 0 .31-4.08 4.3 4.3 0 0 0-3.23-1.53zm-5.63 6.13c-2.38 0-4.32 1.74-4.32 4.19s1.86 4.17 4.19 4.17c.56 0 1.45-.25 2.38-.82.93-.57 1.9-1.28 3-1.28.2 0 1.25.06 2.38.93a.29.29 0 0 0 .15.06.33.33 0 0 0 .3-.14c.1-.14.12-.29.1-.43-.1-.58-.8-1.1-2-1.63s-2.07-.88-3.32-.88c-1.52 0-2.88.8-3.78 1.44a5.2 5.2 0 0 1-1.48 1.1c-.24.16-.54.26-.81.26a2.45 2.45 0 0 1-2.42-2.58c0-2.37 1.8-3.8 3.59-3.8s2.21.6 3.28.6c.17 0 .3-.07.41-.07s.17.07.17.07c-1.2-.82-2.1-2-2.1-3.41a3.09 3.09 0 0 1 .84-2.1c-.5-.3-1.42-.51-2.68-.51z"
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
