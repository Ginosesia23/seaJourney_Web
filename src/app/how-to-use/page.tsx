import Header from '@/components/layout/header';
import Footer from '@/components/layout/footer';
import { ListChecks, Ship, User, FileSignature, FileText } from 'lucide-react';
import Image from 'next/image';
import { cn } from '@/lib/utils';

const steps = [
  {
    icon: <User className="h-8 w-8 text-primary" />,
    title: '1. Set Up Your Profile',
    description: "Create your account and fill in your professional details to get started. This information will be used for your official documents.",
    image: 'https://picsum.photos/seed/how-to-1/800/600',
    imageHint: 'app profile setup'
  },
  {
    icon: <Ship className="h-8 w-8 text-primary" />,
    title: '2. Add Your Vessels',
    description: "Easily add the vessels you've worked on. Include details like the vessel name, type, and official number for accurate record-keeping.",
    image: 'https://picsum.photos/seed/how-to-2/800/600',
    imageHint: 'app vessel list'
  },
  {
    icon: <ListChecks className="h-8 w-8 text-primary" />,
    title: '3. Log Your Sea Time',
    description: "Log your sea days with our intuitive calendar. Just select the dates, and the app will calculate your time for you.",
    image: 'https://picsum.photos/seed/how-to-3/800/600',
    imageHint: 'app calendar logging'
  },
  {
    icon: <FileSignature className="h-8 w-8 text-primary" />,
    title: '4. Request Digital Testimonials',
    description: "Generate a sea time testimonial and send a secure link to your captain or superior to get it digitally signed.",
    image: 'https://picsum.photos/seed/how-to-4/800/600',
    imageHint: 'app digital signature'
  },
  {
    icon: <FileText className="h-8 w-8 text-primary" />,
    title: '5. Export Your Documents',
    description: "When you're ready to apply for a new certificate, export all your logged sea time and signed testimonials into a single, professional PDF.",
    image: 'https://picsum.photos/seed/how-to-5/800/600',
    imageHint: 'app document export'
  },
];


export default function HowToUsePage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="flex-1">
        <section className="py-16 sm:py-24 text-center bg-header text-header-foreground">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl">
              <h1 className="font-headline text-4xl font-bold tracking-tight sm:text-5xl">
                How to Use SeaJourney
              </h1>
              <p className="mt-4 text-lg leading-8 text-header-foreground/80">
                Follow these simple steps to start tracking your sea time like a pro and accelerate your career.
              </p>
            </div>
          </div>
        </section>

        <section className="bg-header text-header-foreground">
          {steps.map((step, index) => (
            <div key={step.title} className="py-12">
              <div className="container mx-auto px-4 sm:px-6 lg:px-8">
                <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
                  <div className={cn("text-center lg:text-left", index % 2 === 1 && 'lg:order-2')}>
                    <div className="inline-flex h-12 w-12 items-center justify-center rounded-lg bg-accent/10 mb-4">
                      {step.icon}
                    </div>
                    <h2 className="font-headline text-3xl font-bold tracking-tight text-white sm:text-4xl">{step.title}</h2>
                    <p className="mt-6 text-lg leading-8 text-header-foreground/80">{step.description}</p>
                  </div>
                  <div className={cn("flex justify-center", index % 2 === 1 && 'lg:order-1')}>
                    <Image
                      src={step.image}
                      alt={step.title}
                      width={800}
                      height={600}
                      className="rounded-xl shadow-2xl"
                      data-ai-hint={step.imageHint}
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </section>

      </main>
      <Footer />
    </div>
  );
}
