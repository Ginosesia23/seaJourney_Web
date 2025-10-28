import Header from '@/components/layout/header';
import Footer from '@/components/layout/footer';
import Hero from '@/components/sections/hero';
import Features from '@/components/sections/features';
import Testimonials from '@/components/sections/testimonials';
import HowToUse from '@/components/sections/how-to-use';
import CTA from '@/components/sections/cta';
import AndroidTesterSignup from '@/components/sections/android-tester-signup';

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="flex-1">
        <Hero />
        <Features />
        <HowToUse />
        <Testimonials />
        <CTA />
        <AndroidTesterSignup />
      </main>
      <Footer />
    </div>
  );
}
