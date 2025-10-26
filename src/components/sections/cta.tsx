import Link from 'next/link';

const AppStoreIcon = () => (
  <svg className="mr-3 h-8 w-8" viewBox="0 0 41 41" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M34.566 21.986c.04-6.42-4.9-10.74-5.3-11.1-3.26-3.46-8.2-3.82-10.14-.1-1.84 3.52.48 8.84 4.54 11.22 3.86 2.26 8.04.74 10.9-2.02zM28.426 6.026c-3-3.32-7.3-3.9-10.22-1.66-1.12.86-2.1 2.1-2.82 3.42-3.82 7.02-1.16 14.92 3.02 18.52 1.34 1.14 2.92 1.84 4.6 1.84 1.48 0 3.22-.52 4.68-1.58 3.8-2.76 5.24-7.52 5.3-12.28a17.4 17.4 0 00-4.56-8.26z" fill="currentColor"/>
  </svg>
);

const GooglePlayIcon = () => (
    <svg className="mr-3 h-8 w-8" viewBox="0 0 36 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M2.353 1.41L17.21 19.998 2.352 38.587A1.55 1.55 0 003.38 40h.314l29.953-15.65c1.89-1.07 1.89-3.63 0-4.7L3.692 0A1.55 1.55 0 002.352 1.41z" fill="#00A0F1"/>
        <path d="M2.353 1.41L17.21 19.998 2.352 38.587A1.55 1.55 0 003.38 40h.314l29.953-15.65c1.89-1.07 1.89-3.63 0-4.7L3.692 0A1.55 1.55 0 002.352 1.41z" fill="url(#a)"/>
        <path d="M33.647 24.348L19.29 15.65v17.39l12.5-7.217c1.89-1.071 1.89-3.413 1.857-4.483z" fill="#00D2FF"/>
        <path d="M33.647 24.348L19.29 15.65v17.39l12.5-7.217c1.89-1.071 1.89-3.413 1.857-4.483z" fill="url(#b)"/>
        <path d="M2.353 1.411l.01.005 14.847 18.58-14.847 18.582a1.55 1.55 0 001.028 1.412h.314l11.41-6.732-11.7-13.26z" fill="#FFE000"/>
        <path d="M2.353 1.411l.01.005 14.847 18.58-14.847 18.582a1.55 1.55 0 001.028 1.412h.314l11.41-6.732-11.7-13.26z" fill="url(#c)"/>
        <path d="M15.11 3.268l-3.321 3.772 11.7 13.26L33.647 15.65 15.11 3.268z" fill="#FF3A44"/>
        <path d="M15.11 3.268l-3.321 3.772 11.7 13.26L33.647 15.65 15.11 3.268z" fill="url(#d)"/>
        <defs>
            <linearGradient id="a" x1="17.21" y1="19.998" x2="3.864" y2="1.411" gradientUnits="userSpaceOnUse">
                <stop stopColor="#00A0F1"/>
                <stop offset="1" stopColor="#00D2FF"/>
            </linearGradient>
            <linearGradient id="b" x1="19.29" y1="24.348" x2="33.647" y2="15.65" gradientUnits="userSpaceOnUse">
                <stop stopColor="#00A0F1"/>
                <stop offset="1" stopColor="#00D2FF"/>
            </linearGradient>
            <linearGradient id="c" x1="2.353" y1="19.998" x2="16.326" y2="33.26" gradientUnits="userSpaceOnUse">
                <stop stopColor="#FFE000"/>
                <stop offset="1" stopColor="#FFC107"/>
            </linearGradient>
            <linearGradient id="d" x1="11.789" y1="7.04" x2="33.647" y2="15.65" gradientUnits="userSpaceOnUse">
                <stop stopColor="#FF3A44"/>
                <stop offset="1" stopColor="#C31162"/>
            </linearGradient>
        </defs>
    </svg>
);


const CTA = () => {
  return (
    <section id="cta" className="bg-background">
      <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-headline text-3xl font-bold tracking-tight text-primary sm:text-4xl">
            Your Next Adventure Awaits
          </h2>
          <p className="mt-4 text-lg leading-8 text-foreground/80">
            Download SeaJourney today and transform the way you explore the world.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link href="#" className="flex w-full sm:w-auto items-center justify-center rounded-lg bg-primary px-5 py-3 text-base font-medium text-primary-foreground shadow-md transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-primary">
              <AppStoreIcon />
              <div>
                <p className="text-xs">Download on the</p>
                <p className="text-xl font-semibold">App Store</p>
              </div>
            </Link>
             <Link href="#" className="flex w-full sm:w-auto items-center justify-center rounded-lg bg-primary px-5 py-3 text-base font-medium text-primary-foreground shadow-md transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-primary">
              <GooglePlayIcon />
              <div>
                <p className="text-xs">GET IT ON</p>
                <p className="text-xl font-semibold">Google Play</p>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
};

export default CTA;
