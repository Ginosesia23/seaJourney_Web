// app/testimonials/signoff/page.tsx
import { Suspense } from 'react';
import SignoffClient from './signoff-client';

export default function SignoffPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center subtle-gradient-background">
          <div className="text-center space-y-4">
            <div className="h-10 w-10 rounded-full border border-white/40 border-t-transparent animate-spin mx-auto" />
            <p className="text-sm text-white/70">
              Loading testimonial sign-off…
            </p>
          </div>
        </div>
      }
    >
      <SignoffClient />
    </Suspense>
  );
}
