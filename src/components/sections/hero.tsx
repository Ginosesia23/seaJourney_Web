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
            Log Your Sea Time, Advance Your Career
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-gray-200">
            The #1 app for yacht crew and maritime professionals to track sea days, manage testimonials, and accelerate their journey to the next certificate.
          </p>
          <div className="mt-10 flex items-center justify-center gap-x-6">
            <Button asChild size="lg" className="bg-primary hover:bg-primary/90 text-primary-foreground">
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
