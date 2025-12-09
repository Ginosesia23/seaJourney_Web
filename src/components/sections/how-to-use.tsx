
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { BookOpenCheck } from 'lucide-react';

const HowToUse = () => {
  return (
    <section id="how-to-use" className="border-y border-white/10" style={{ backgroundColor: '#000b15' }}>
      <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <BookOpenCheck className="mx-auto h-12 w-12 text-blue-400" />
          <h2 className="mt-4 font-headline text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Learn How to Use the App
          </h2>
          <p className="mt-4 text-lg leading-8 text-blue-100">
            Our step-by-step guide will walk you through everything from logging your first day to exporting professional documents.
          </p>
          <div className="mt-10">
            <Button asChild size="lg" className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-lg px-8">
              <Link href="/how-to-use">View the Guide</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HowToUse;

    