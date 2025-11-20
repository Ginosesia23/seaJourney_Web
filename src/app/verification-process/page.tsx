
import Header from '@/components/layout/header';
import Footer from '@/components/layout/footer';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Fingerprint, FileText, ShieldCheck, Search } from 'lucide-react';

const processSteps = [
  {
    icon: <FileText className="h-8 w-8 text-accent" />,
    title: '1. Document Generation',
    description: 'When a crew member finalizes a sea time record or testimonial, they can choose to generate a verifiable document, such as a PDF export.'
  },
  {
    icon: <Fingerprint className="h-8 w-8 text-accent" />,
    title: '2. Unique Code Creation',
    description: 'SeaJourney generates a unique, unguessable verification code for that specific document. A snapshot of the key record data is stored securely alongside this code.'
  },
  {
    icon: <ShieldCheck className="h-8 w-8 text-accent" />,
    title: '3. Secure Sharing',
    description: 'The unique verification code is automatically included in the footer of the exported PDF document, which the crew member can then share with authorities or employers.'
  },
  {
    icon: <Search className="h-8 w-8 text-accent" />,
    title: '4. Public Verification',
    description: 'An official, such as from the MCA, can visit our public Verification Portal and enter the code to retrieve the original, verified data snapshot, confirming the document\'s authenticity.'
  }
];

export default function VerificationProcessPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="flex-1">
        <section className="py-16 sm:py-24">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl text-center">
              <h1 className="font-headline text-4xl font-bold tracking-tight text-primary sm:text-5xl">
                Our Verification Process
              </h1>
              <p className="mt-4 text-lg leading-8 text-foreground/80">
                SeaJourney employs a robust system to ensure the authenticity and integrity of every sea time record. Here’s how it works.
              </p>
            </div>
            <div className="mx-auto mt-16 grid max-w-2xl grid-cols-1 gap-8 sm:grid-cols-2 lg:max-w-none lg:grid-cols-4">
              {processSteps.map((step) => (
                <Card key={step.title} className="transform transition-transform duration-300 hover:-translate-y-2 hover:shadow-xl bg-card border-border/50 rounded-2xl">
                  <CardHeader>
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10">
                      {step.icon}
                    </div>
                    <CardTitle className="pt-4 font-headline text-xl">{step.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-foreground/80">{step.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
             <div className="mt-20 text-center">
                <p className="text-muted-foreground">This process ensures that all verified documents are tamper-proof and directly traceable to a secure record in our system.</p>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
