
import Header from '@/components/layout/header';
import Footer from '@/components/layout/footer';
import Hero from '@/components/sections/hero';
import CrewBenefits from '@/components/sections/crew-benefits';
import Features from '@/components/sections/features';
import DashboardPreview from '@/components/sections/dashboard-preview';
import IOSApp from '@/components/sections/ios-app';
import HowToUse from '@/components/sections/how-to-use';
// import Testimonials from '@/components/sections/testimonials'; // Commented out for launch - contains fake data
import MembershipCTA from '@/components/sections/membership-cta';
import ShopPromo from '@/components/sections/shop-promo';
import AndroidTesterSignup from '@/components/sections/android-tester-signup';
import VerificationCTA from '@/components/sections/verification-cta';
import { AuthRecoveryHandler } from '@/components/auth-recovery-handler';

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col" style={{ backgroundColor: '#000b15' }}>
      <AuthRecoveryHandler />
      <Header />
      <main className="flex-1">
        <CrewBenefits />
        <Hero />
        <Features />
        <VerificationCTA />
        <HowToUse />
        {/* <Testimonials /> */}
        <MembershipCTA />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-0 border-t border-white/10" style={{ backgroundColor: '#000b15' }}>
        <ShopPromo />
        <AndroidTesterSignup />
        </div>
      </main>
      <Footer />
    </div>
  );
}
