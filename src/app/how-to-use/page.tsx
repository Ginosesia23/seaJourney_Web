'use client';

import { useState } from 'react';
import Header from '@/components/layout/header';
import Footer from '@/components/layout/footer';
import { ListChecks, Ship, User, FileSignature, FileText, Apple, Smartphone } from 'lucide-react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const iosSteps = [
  {
    icon: <User className="h-8 w-8 text-accent" />,
    title: '1. Set Up Your Profile',
    description: "Create your account and fill in your professional details to get started. This information will be used for your official documents.",
    image: 'https://picsum.photos/seed/how-to-1/800/600',
    imageHint: 'app profile setup iOS'
  },
  {
    icon: <Ship className="h-8 w-8 text-accent" />,
    title: '2. Add Your Vessels',
    description: "Easily add the vessels you've worked on. Include details like the vessel name, type, and official number for accurate record-keeping.",
    image: 'https://picsum.photos/seed/how-to-2/800/600',
    imageHint: 'app vessel list iOS'
  },
  {
    icon: <ListChecks className="h-8 w-8 text-accent" />,
    title: '3. Log Your Sea Time',
    description: "Log your sea days with our intuitive calendar. Just select the dates, and the app will calculate your time for you.",
    image: 'https://picsum.photos/seed/how-to-3/800/600',
    imageHint: 'app calendar logging iOS'
  },
  {
    icon: <FileSignature className="h-8 w-8 text-accent" />,
    title: '4. Request Digital Testimonials',
    description: "Generate a sea time testimonial and send a secure link to your captain or superior to get it digitally signed.",
    image: 'https://picsum.photos/seed/how-to-4/800/600',
    imageHint: 'app digital signature iOS'
  },
  {
    icon: <FileText className="h-8 w-8 text-accent" />,
    title: '5. Export Your Documents',
    description: "When you're ready to apply for a new certificate, export all your logged sea time and signed testimonials into a single, professional PDF.",
    image: 'https://picsum.photos/seed/how-to-5/800/600',
    imageHint: 'app document export iOS'
  },
];

const androidSteps = [
  {
    icon: <User className="h-8 w-8 text-accent" />,
    title: '1. Set Up Your Profile',
    description: "Create your account and fill in your professional details to get started. This information will be used for your official documents.",
    image: 'https://picsum.photos/seed/how-to-android-1/800/600',
    imageHint: 'app profile setup Android'
  },
  {
    icon: <Ship className="h-8 w-8 text-accent" />,
    title: '2. Add Your Vessels',
    description: "Easily add the vessels you've worked on. Include details like the vessel name, type, and official number for accurate record-keeping.",
    image: 'https://picsum.photos/seed/how-to-android-2/800/600',
    imageHint: 'app vessel list Android'
  },
  {
    icon: <ListChecks className="h-8 w-8 text-accent" />,
    title: '3. Log Your Sea Time',
    description: "Log your sea days with our intuitive calendar. Just select the dates, and the app will calculate your time for you.",
    image: 'https://picsum.photos/seed/how-to-android-3/800/600',
    imageHint: 'app calendar logging Android'
  },
  {
    icon: <FileSignature className="h-8 w-8 text-accent" />,
    title: '4. Request Digital Testimonials',
    description: "Generate a sea time testimonial and send a secure link to your captain or superior to get it digitally signed.",
    image: 'https://picsum.photos/seed/how-to-android-4/800/600',
    imageHint: 'app digital signature Android'
  },
  {
    icon: <FileText className="h-8 w-8 text-accent" />,
    title: '5. Export Your Documents',
    description: "When you're ready to apply for a new certificate, export all your logged sea time and signed testimonials into a single, professional PDF.",
    image: 'https://picsum.photos/seed/how-to-android-5/800/600',
    imageHint: 'app document export Android'
  },
];

type Platform = 'ios' | 'android';

export default function HowToUsePage() {
  const [platform, setPlatform] = useState<Platform>('ios');
  const steps = platform === 'ios' ? iosSteps : androidSteps;

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
              <div className="mt-8 flex justify-center gap-2 rounded-lg bg-black/20 p-1.5">
                <Button
                  onClick={() => setPlatform('ios')}
                  variant={platform === 'ios' ? 'secondary' : 'ghost'}
                  className={cn(
                    "w-full text-white hover:bg-white/20 hover:text-white", 
                    platform === 'ios' && 'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground'
                  )}
                >
                  <Apple className="mr-2 h-5 w-5" />
                  iOS
                </Button>
                <Button
                  onClick={() => setPlatform('android')}
                  variant={platform === 'android' ? 'secondary' : 'ghost'}
                  className={cn(
                    "w-full text-white hover:bg-white/20 hover:text-white", 
                    platform === 'android' && 'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground'
                  )}
                >
                  <Smartphone className="mr-2 h-5 w-5" />
                  Android
                </Button>
              </div>
            </div>
          </div>
        </section>

        <section key={platform} className="bg-header text-header-foreground animate-in fade-in duration-300">
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
                      key={step.image} // Add key to force re-render on image change
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
