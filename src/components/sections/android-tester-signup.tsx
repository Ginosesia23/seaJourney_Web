
'use client';

import { Button } from '@/components/ui/button';
import { Smartphone } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export default function AndroidTesterSignup() {
  return (
    <section id="android-testers" className="bg-header text-header-foreground">
      <div className="container mx-auto px-4 py-16 sm:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <Smartphone className="mx-auto h-12 w-12 text-[#3DDC84]" />
          <h2 className="mt-4 font-headline text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Be the First to Test on Android
          </h2>
          <p className="mt-4 text-lg leading-8 text-header-foreground/80">
            The Android version of SeaJourney is coming soon. Sign up to become a beta tester and get early access.
          </p>
          <div className="mt-10">
            <Button asChild size="lg" className="rounded-full text-primary-foreground" style={{ backgroundColor: '#3DDC84' }}>
              <Link href="https://play.google.com/apps/internaltest/4701575652585709401" target="_blank" rel="noopener noreferrer">
                Download Beta App
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
