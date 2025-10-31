'use client';

import { Button } from '@/components/ui/button';
import { Smartphone } from 'lucide-react';
import Link from 'next/link';

const GooglePlayIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 512 512" {...props}>
      <path fill="#fdd835" d="M34.8 51.7C24.3 64 16.2 77.3 10.3 91.5L256 256l-211-121.8c-4-2.3-7.9-4.8-11.2-6.5z"/>
      <path fill="#fbc02d" d="M10.3 420.5c5.9 14.2 14 27.5 24.5 39.8 4.6 5.4 9.6 10.5 15.2 15.2L256 256l-245.7 164.5z"/>
      <path fill="#f57c00" d="m343.3 162.7-87.3 87.3 87.3 87.3c15.9-10 30-22.7 41.5-37.8l63.4-37.3-63.4-37.3c-11.5-15.1-25.6-27.8-41.5-37.8z"/>
      <path fill="#4caf50" d="M497 218.2L384.2 154c-19.4-11.2-41-17.6-63.9-19.4L45.3 51.7c-3-1.8-6.1-3.4-9.3-5.1C22.2 36.8 7.3 22.2 0 7.3L256 256l241-37.8z"/>
      <path fill="#2e7d32" d="M0 504.7c7.3-14.9 22.2-29.5 36-39.3 3.2-1.7 6.3-3.3 9.3-5.1l275-162.8c22.9-1.8 44.5-8.2 63.9-19.4L497 293.8 256 256 0 504.7z"/>
    </svg>
  );


export default function AndroidTesterSignup() {
  return (
    <section id="android-testers" className="py-16 sm:py-24 bg-green-50">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <Smartphone className="mx-auto h-12 w-12 text-[#3DDC84]" />
          <h2 className="mt-4 font-headline text-3xl font-bold tracking-tight text-primary sm:text-4xl">
            Be the First to Test on Android
          </h2>
          <p className="mt-4 text-lg leading-8 text-foreground/80">
            The Android version of SeaJourney is coming soon. Sign up to become a beta tester and get early access.
          </p>
          <div className="mt-10">
            <Button asChild size="lg" className="rounded-lg bg-[#3DDC84] hover:bg-[#3DDC84]/90 text-black">
              <Link href="https://play.google.com/apps/internaltest/4701575652585709401" target="_blank" rel="noopener noreferrer">
                <GooglePlayIcon className="mr-2 h-6 w-6" />
                Download Beta App
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
