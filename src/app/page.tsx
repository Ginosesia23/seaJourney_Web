
import Header from '@/components/layout/header';
import Footer from '@/components/layout/footer';
import Hero from '@/components/sections/hero';
import Features from '@/components/sections/features';
import Testimonials from '@/components/sections/testimonials';
import HowToUse from '@/components/sections/how-to-use';
import AndroidTesterSignup from '@/components/sections/android-tester-signup';
import ShopPromo from '@/components/sections/shop-promo';

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-header">
      <Header />
      <main className="flex-1">
        <Hero />
        <Features />
        <HowToUse />
        <Testimonials />
        <ShopPromo />
        <AndroidTesterSignup />
      </main>
      <Footer />
    </div>
  );
}

    