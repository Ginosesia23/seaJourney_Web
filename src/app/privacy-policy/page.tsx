import Header from '@/components/layout/header';
import Footer from '@/components/layout/footer';

export default function PrivacyPolicyPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="flex-1">
        <section className="py-16 sm:py-24">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl">
              <h1 className="font-headline text-4xl font-bold tracking-tight text-primary sm:text-5xl">
                Privacy Policy
              </h1>
              <div className="prose prose-lg mt-8 max-w-none text-foreground">
                <p>
                  This is a placeholder for your Privacy Policy. You should replace this content with your own policy.
                </p>
                <h2>1. Information We Collect</h2>
                <p>
                  We collect information you provide directly to us. For example, we collect information when you create an account, subscribe, participate in any interactive features of our services, fill out a form, request customer support or otherwise communicate with us.
                </p>
                <h2>2. How We Use Information</h2>
                <p>
                  We may use the information we collect to:
                </p>
                <ul>
                  <li>Provide, maintain, and improve our services;</li>
                  <li>Process transactions and send you related information, including confirmations and invoices;</li>
                  <li>Send you technical notices, updates, security alerts, and support and administrative messages;</li>
                </ul>
                <h2>3. Sharing of Information</h2>
                <p>
                  We may share information about you as follows or as otherwise described in this Privacy Policy:
                </p>
                <ul>
                  <li>With vendors, consultants, and other service providers who need access to such information to carry out work on our behalf;</li>
                  <li>In response to a request for information if we believe disclosure is in accordance with, or required by, any applicable law or legal process;</li>
                </ul>
                <h2>4. Your Choices</h2>
                <p>
                  You may update, correct or delete information about you at any time by logging into your online account or emailing us.
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
