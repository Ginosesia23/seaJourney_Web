import Header from '@/components/layout/header';
import Footer from '@/components/layout/footer';
import Hero from '@/components/sections/hero';
import Features from '@/components/sections/features';
import AITourGenerator from '@/components/sections/ai-tour-generator';
import Testimonials from '@/components/sections/testimonials';
import CTA from '@/components/sections/cta';

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="flex-1">
        <Hero />
        <Features />
        <AITourGenerator />
        <Testimonials />
        <CTA />
      </main>
      <Footer />
    </div>
  );
}
