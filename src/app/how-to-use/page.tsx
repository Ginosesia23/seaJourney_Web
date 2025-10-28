import Header from '@/components/layout/header';
import Footer from '@/components/layout/footer';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { ListChecks, Ship, User, FileSignature, FileText } from 'lucide-react';

const steps = [
  {
    icon: <User className="h-8 w-8 text-primary" />,
    title: '1. Set Up Your Profile',
    description: "Create your account and fill in your professional details to get started. This information will be used for your official documents.",
  },
  {
    icon: <Ship className="h-8 w-8 text-primary" />,
    title: '2. Add Your Vessels',
    description: "Easily add the vessels you've worked on. Include details like the vessel name, type, and official number for accurate record-keeping.",
  },
  {
    icon: <ListChecks className="h-8 w-8 text-primary" />,
    title: '3. Log Your Sea Time',
    description: "Log your sea days with our intuitive calendar. Just select the dates, and the app will calculate your time for you.",
  },
  {
    icon: <FileSignature className="h-8 w-8 text-primary" />,
    title: '4. Request Digital Testimonials',
    description: "Generate a sea time testimonial and send a secure link to your captain or superior to get it digitally signed.",
  },
  {
    icon: <FileText className="h-8 w-8 text-primary" />,
    title: '5. Export Your Documents',
    description: "When you're ready to apply for a new certificate, export all your logged sea time and signed testimonials into a single, professional PDF.",
  },
];


export default function HowToUsePage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="flex-1">
        <section className="py-16 sm:py-24">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl text-center">
              <h1 className="font-headline text-4xl font-bold tracking-tight text-primary sm:text-5xl">
                How to Use SeaJourney
              </h1>
              <p className="mt-4 text-lg leading-8 text-foreground/80">
                Follow these simple steps to start tracking your sea time like a pro and accelerate your career.
              </p>
            </div>

            <div className="mx-auto mt-16 grid max-w-2xl grid-cols-1 gap-8 lg:max-w-none lg:grid-cols-1">
              {steps.map((step) => (
                <Card key={step.title} className="bg-card">
                  <CardHeader className="flex flex-row items-center gap-4">
                    <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-primary/10">
                      {step.icon}
                    </div>
                    <div>
                      <CardTitle className="font-headline text-xl">{step.title}</CardTitle>
                      <CardDescription className="pt-1">{step.description}</CardDescription>
                    </div>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
