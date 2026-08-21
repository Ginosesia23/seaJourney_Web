'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

/**
 * Legacy /dashboard/proof-of-service → Career documents (Proof tab).
 */
export default function ProofOfServiceRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/dashboard/career-documents?tab=proof');
  }, [router]);

  return (
    <div className="flex min-h-[240px] items-center justify-center text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin" />
    </div>
  );
}
