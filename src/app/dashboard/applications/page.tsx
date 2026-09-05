'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';

/**
 * Legacy /dashboard/applications → Career documents (Testimonials tab).
 */
function RedirectInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const qs = searchParams?.toString();
    const dest = qs
      ? `/dashboard/career-documents?tab=testimonials&${qs}`
      : '/dashboard/career-documents?tab=testimonials';
    router.replace(dest);
  }, [router, searchParams]);

    return (
    <div className="flex min-h-[240px] items-center justify-center text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

export default function ApplicationsRedirectPage() {
    return (
    <Suspense
      fallback={
        <div className="flex min-h-[240px] items-center justify-center text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          </div>
      }
    >
      <RedirectInner />
    </Suspense>
  );
}
