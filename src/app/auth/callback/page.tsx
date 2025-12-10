'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSupabase } from '@/supabase';
import { Loader2 } from 'lucide-react';

export default function AuthCallback() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { supabase } = useSupabase();
  const [isProcessing, setIsProcessing] = useState(true);

  useEffect(() => {
    async function handleRedirect() {
      try {
        // Check if this is an email confirmation (type=signup or type=email)
        const hashParams = window.location.hash;
        const isEmailConfirmation = 
          hashParams?.includes('type=signup') || 
          hashParams?.includes('type=email') ||
          searchParams?.get('type') === 'signup' ||
          searchParams?.get('type') === 'email';

        // Supabase automatically handles session detection with detectSessionInUrl: true
        // Wait a moment for the auth state to update
        await new Promise(resolve => setTimeout(resolve, 500));

        // Check current session
        const { data: { session }, error } = await supabase.auth.getSession();
        
        // If this is an email confirmation, redirect to the confirmation page
        // regardless of whether we have a session (email might already be confirmed)
        if (isEmailConfirmation) {
          router.replace('/auth/confirm');
          return;
        }

        // For regular login flows, check if user is authenticated
        if (session && !error) {
          router.replace('/dashboard');
        } else {
          // No session or error, redirect to login
          router.replace('/login');
        }
      } catch (error) {
        console.error('Callback processing error:', error);
        router.replace('/login');
      } finally {
        setIsProcessing(false);
      }
    }

    handleRedirect();
  }, [supabase, router, searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center dark animated-gradient-background">
      <div className="text-center space-y-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
        <p className="text-sm text-muted-foreground">Processing authentication...</p>
      </div>
    </div>
  );
}
