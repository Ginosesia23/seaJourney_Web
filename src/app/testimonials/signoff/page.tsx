// app/testimonials/signoff/page.tsx
import { Suspense } from 'react';
import SignoffClient from './signoff-client';

export default function SignoffPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex flex-col">
          <header
            className="sticky top-0 z-50 w-full border-b shrink-0"
            style={{ backgroundColor: '#000b15', borderColor: 'rgba(255, 255, 255, 0.1)' }}
          >
            <div className="container mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
              <a href="/" className="text-white font-semibold text-lg">SeaJourney</a>
            </div>
          </header>
          <main className="flex-1 flex items-center justify-center bg-white px-4 py-16">
            <div className="text-center space-y-4">
              <div className="h-10 w-10 rounded-full border-2 border-gray-300 border-t-transparent animate-spin mx-auto" />
              <p className="text-sm text-gray-500">Loading testimonial sign-off…</p>
            </div>
          </main>
          <footer className="shrink-0 border-t py-6" style={{ backgroundColor: '#000b15', borderColor: 'rgba(255, 255, 255, 0.1)' }}>
            <div className="container mx-auto px-4 text-center text-sm text-white/60">
              &copy; {new Date().getFullYear()} SeaJourney
            </div>
          </footer>
        </div>
      }
    >
      <SignoffClient />
    </Suspense>
  );
}
