import Link from 'next/link';
import { Button } from '@/components/ui/button';
import Image from 'next/image';

const Hero = () => {
  return (
    <section className="bg-header text-header-foreground py-20 sm:py-28">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div className="text-center lg:text-left">
            <h1 className="font-headline text-4xl font-bold tracking-tight text-white sm:text-6xl">
              Log Your Sea Time, Advance Your Career
            </h1>
            <p className="mt-6 text-lg leading-8 text-header-foreground/80">
              The #1 app for yacht crew and maritime professionals to track sea days, manage testimonials, and accelerate their journey to the next certificate.
            </p>
            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:items-start lg:justify-start">
              <Button asChild size="lg">
                <Link href="#cta">Download Now</Link>
              </Button>
              <Button asChild variant="ghost" size="lg" className="text-white hover:bg-white/10 hover:text-white">
                <Link href="#features">Learn More &rarr;</Link>
              </Button>
            </div>
          </div>
          <div className="flex justify-center">
            <Image
              src="/hero-1.png"
              alt="App screenshots showing the main dashboard and vessel state selection."
              width={600}
              height={400}
              className="rounded-xl shadow-2xl"
              data-ai-hint="app screenshot"
              priority
            />
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
