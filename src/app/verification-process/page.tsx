
import Header from '@/components/layout/header';
import Footer from '@/components/layout/footer';
import { SeaJourneyVerificationFlow } from '@/components/sections/sea-journey-verification-flow';

export default function VerificationProcessPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="flex-1">
        <section className="py-16 sm:py-24">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <SeaJourneyVerificationFlow />
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
