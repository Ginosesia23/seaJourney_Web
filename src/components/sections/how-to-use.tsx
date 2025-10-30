import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { BookOpenCheck } from 'lucide-react';

const HowToUse = () => {
  return (
    <section id="how-to-use" className="bg-background py-16 sm:py-24">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <BookOpenCheck className="mx-auto h-12 w-12 text-primary" />
          <h2 className="mt-4 font-headline text-3xl font-bold tracking-tight text-primary sm:text-4xl">
            Learn How to Use the App
          </h2>
          <p className="mt-4 text-lg leading-8 text-foreground/80">
            Our step-by-step guide will walk you through everything from logging your first day to exporting professional documents.
          </p>
          <div className="mt-10">
            <Button asChild size="lg" className="rounded-lg">
              <Link href="/how-to-use">View the Guide</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HowToUse;
