
import Header from '@/components/layout/header';
import Footer from '@/components/layout/footer';
import Hero from '@/components/sections/hero';
import CrewBenefits from '@/components/sections/crew-benefits';
import Features from '@/components/sections/features';
import DashboardPreview from '@/components/sections/dashboard-preview';
import IOSApp from '@/components/sections/ios-app';
// import Testimonials from '@/components/sections/testimonials'; // Commented out for launch - contains fake data
import MembershipCTA from '@/components/sections/membership-cta';
import AndroidTesterSignup from '@/components/sections/android-tester-signup';
import VerificationCTA from '@/components/sections/verification-cta';
import OfficialForms from '@/components/sections/official-forms';
import AISImportPromo from '@/components/sections/ais-import-promo';
import CertificateTracking from '@/components/sections/certificate-tracking';
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
        <OfficialForms />
        <CertificateTracking />
        <AISImportPromo />
        <VerificationCTA />
        {/* <Testimonials /> */}
        <MembershipCTA />
        <div className="border-t border-white/10" style={{ backgroundColor: '#000b15' }}>
          <AndroidTesterSignup />
        </div>
      </main>
      <Footer />
    </div>
  );
}
