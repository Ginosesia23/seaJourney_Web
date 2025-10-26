
import Link from 'next/link';
import { Button } from '@/components/ui/button';

const Hero = () => {
  return (
    <section className="bg-header text-header-foreground py-20 sm:py-28">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="font-headline text-4xl font-bold tracking-tight text-white sm:text-6xl">
            Log Your Sea Time, Advance Your Career
          </h1>
          <p className="mt-6 text-lg leading-8 text-header-foreground/80">
            The #1 app for yacht crew and maritime professionals to track sea days, manage testimonials, and accelerate their journey to the next certificate.
          </p>
          <div className="mt-10 flex items-center justify-center gap-x-6">
            <Button asChild size="lg" className="bg-accent hover:bg-accent/90 text-accent-foreground">
              <Link href="#cta">Download Now</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="border-white text-white hover:bg-white/10">
              <Link href="#features">Learn More &rarr;</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
