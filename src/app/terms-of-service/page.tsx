import Header from '@/components/layout/header';
import Footer from '@/components/layout/footer';

export default function TermsOfServicePage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="flex-1">
        <section className="py-16 sm:py-24">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl">
              <h1 className="font-headline text-4xl font-bold tracking-tight text-primary sm:text-5xl">
                Terms of Service
              </h1>
              <div className="prose prose-lg mt-8 max-w-none text-foreground">
                <p>
                  This is a placeholder for your Terms of Service. You should replace this content with your own terms.
                </p>
                <h2>1. Acceptance of Terms</h2>
                <p>
                  By accessing or using our service, you agree to be bound by these terms. If you disagree with any part of the terms, then you may not access the service.
                </p>
                <h2>2. Use License</h2>
                <p>
                  Permission is granted to temporarily download one copy of the materials on our website for personal, non-commercial transitory viewing only.
                </p>
                <h2>3. Disclaimer</h2>
                <p>
                  The materials on our website are provided on an 'as is' basis. We make no warranties, expressed or implied, and hereby disclaim and negate all other warranties including, without limitation, implied warranties or conditions of merchantability, fitness for a particular purpose, or non-infringement of intellectual property or other violation of rights.
                </p>
                <h2>4. Limitations</h2>
                <p>
                  In no event shall we or our suppliers be liable for any damages (including, without limitation, damages for loss of data or profit, or due to business interruption) arising out of the use or inability to use the materials on our website.
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
