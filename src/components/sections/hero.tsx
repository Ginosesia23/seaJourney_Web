import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { PlaceHolderImages } from '@/lib/placeholder-images';

const Hero = () => {
  const heroImage = PlaceHolderImages.find(p => p.id === 'hero-background');

  return (
    <section className="relative h-[75vh] min-h-[500px] w-full text-white">
      {heroImage && (
        <Image
          src={heroImage.imageUrl}
          alt={heroImage.description}
          fill
          className="object-cover"
          priority
          data-ai-hint={heroImage.imageHint}
        />
      )}
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative z-10 flex h-full flex-col items-center justify-center text-center">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="font-headline text-4xl font-bold tracking-tight sm:text-6xl lg:text-7xl">
            Chart Your Unforgettable Journey
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-gray-200">
            Welcome to SeaJourney, the AI-powered travel app that turns your dream vacation into a reality. Effortless planning, endless exploration.
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
