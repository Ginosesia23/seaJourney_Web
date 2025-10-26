import Header from '@/components/layout/header';
import Footer from '@/components/layout/footer';
import { Construction } from 'lucide-react';

export default function ComingSoonPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="flex flex-1 items-center justify-center text-center">
        <section className="py-16 sm:py-24">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl">
              <Construction className="mx-auto h-16 w-16 text-primary" />
              <h1 className="font-headline mt-8 text-4xl font-bold tracking-tight text-primary sm:text-5xl">
                Coming Soon
              </h1>
              <div className="prose prose-lg mt-4 max-w-none text-foreground/80">
                <p>
                  We're hard at work building exciting new features for you. Stay tuned!
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
