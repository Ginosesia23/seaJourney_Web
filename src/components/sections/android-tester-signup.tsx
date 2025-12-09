
'use client';

import { Button } from '@/components/ui/button';
import { Smartphone } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export default function AndroidTesterSignup() {
  return (
    <section id="android-testers" style={{ backgroundColor: '#000b15' }}>
      <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8 h-full flex items-center">
        <div className="mx-auto max-w-2xl text-center w-full">
          <Smartphone className="mx-auto h-12 w-12 text-[#3DDC84]" />
          <h2 className="mt-4 font-headline text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Be the First to Test on Android
          </h2>
          <p className="mt-4 text-lg leading-8 text-blue-100">
            The Android version of SeaJourney is coming soon. Sign up to become a beta tester and get early access.
          </p>
          <div className="mt-10">
            <Button asChild size="lg" className="rounded-xl text-white shadow-lg px-8" style={{ backgroundColor: '#3DDC84' }}>
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
