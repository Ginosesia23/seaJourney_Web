import Link from 'next/link';

export const AppStoreIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" role="img" {...props}>
    <title>Apple</title>
    <path fill="currentColor" d="M16.365 1.43c0 1.02-.39 2.06-1.07 2.84-.72.83-1.84 1.67-3.07 1.57-.06-.78.18-1.63.65-2.28.56-.79 1.52-1.43 2.45-1.73.43-.14.93-.15 1.14-.4.14-.17.2-.37.2-.56 0-.15-.02-.3-.06-.43-.05-.18-.18-.33-.37-.33-.21 0-.46.09-.72.25-.5.31-1.07.55-1.58.8-.34.17-.67.34-.96.48-.57.28-1.12.51-1.7.53-.14 0-.25-.02-.35-.07-.2-.1-.27-.36-.14-.57.26-.42.67-.99 1.03-1.4.66-.73 1.45-1.3 2.24-1.67.67-.3 1.34-.46 1.97-.46.3 0 .58.04.84.13.37.12.65.39.77.77.12.37.09.77-.07 1.1-.12.26-.37.42-.68.42zM12.1 4.6c.54-.02 1.08-.17 1.62-.42.86-.39 1.68-1.05 2.37-1.88C16.1 3.89 15.1 5 13.7 5.6c-1.45.6-3.16.05-4.07-.9-.86-.92-1.1-2.1-1.24-2.86 1.01.44 2.02.84 3.05.9.94.05 1.8-.17 2.46-.64C14.28 3.3 13.23 4.45 12.1 4.6zM20 12.3c-.06 2.03-.92 3.84-2.33 5.24-1.12 1.12-2.44 1.8-3.99 1.92-.97.08-1.94-.2-2.9-.83-.53-.36-1.04-.83-1.48-1.36-.55-.65-1.07-1.33-1.57-2.03-.94-1.36-1.84-2.79-3.12-3.63-.6-.37-1.24-.62-1.88-.78-.16-.04-.33-.07-.5-.1-.08-.01-.17-.02-.25-.03-.1-.02-.19-.03-.28-.05-.06 0-.12-.01-.18-.01-.06 0-.1 0-.14 0-.03 0-.06 0-.08.01-.05.01-.08.02-.11.02-.04.01-.07.02-.1.04-.05.02-.08.05-.1.08-.02.03-.03.06-.03.1-.01.03-.01.07-.01.11v.02c.01.12.06.24.15.35.18.22.48.41.88.6.75.36 1.62.46 2.44.26.77-.19 1.46-.63 2.02-1.22.71-.73 1.37-1.5 2.08-2.22.6-.6 1.3-1.02 2.08-1.28 1.03-.33 2.1-.4 3.16-.21 1.12.2 2.12.7 3 1.5.26.24.49.5.7.78.06.08.11.17.16.26.02.04.04.08.05.12.01.02.01.04.01.06 0 .03 0 .06-.01.09-.01.11-.03.22-.07.33-.02.04-.04.08-.06.12-.03.05-.07.09-.12.13-.02.02-.04.04-.07.06-.04.03-.09.05-.14.07-.06.02-.11.03-.17.03z"/>
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