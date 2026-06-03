'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle, Loader2, Mail } from 'lucide-react';
import {
  WkAuthShell,
  WkAsideHero,
} from '@/components/wk/wk-auth-shell';

function EmailConfirmPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isValid, setIsValid] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const hashParams = typeof window !== 'undefined' ? window.location.hash : '';
    const hasHashToken =
      !!hashParams &&
      (hashParams.includes('access_token') ||
        hashParams.includes('type=signup') ||
        hashParams.includes('type=email'));

    const hasQueryParams =
      !!searchParams?.get('token') ||
      !!searchParams?.get('type') ||
      searchParams?.get('confirmed') === 'true';

    const isValidConfirmation = hasHashToken || hasQueryParams;

    if (isValidConfirmation) {
      setIsValid(true);
      setIsChecking(false);
    } else {
      setIsChecking(false);
      setTimeout(() => {
        router.replace('/login?error=invalid_confirmation_link');
      }, 2000);
    }
  }, [searchParams, router]);

  const aside = (
    <WkAsideHero
      eyebrow="Welcome aboard"
      title={
        <>
          You&apos;re <span className="wk-gradient-text">verified</span>.
        </>
      }
      description="Your email is confirmed — sign in to start logging sea time, tracking certificates, and building your maritime record."
      bullets={[
        {
          label: 'Account activated',
          sub: 'Your SeaJourney profile is ready to use.',
          icon: <CheckCircle className="h-4 w-4" />,
        },
        {
          label: 'Sign in on web or app',
          sub: 'Use the same email and password everywhere.',
          icon: <Mail className="h-4 w-4" />,
        },
      ]}
    />
  );

  if (isChecking) {
    return (
      <WkAuthShell hideBackLink aside={aside}>
        <div
          className="wk-auth-card flex flex-col items-center justify-center gap-4 p-10"
          style={{ minHeight: 260 }}
        >
          <Loader2
            className="h-8 w-8 animate-spin"
            style={{ color: 'var(--wk-accent)' }}
          />
          <p className="text-sm" style={{ color: 'var(--wk-text-muted)' }}>
            Verifying confirmation…
          </p>
        </div>
      </WkAuthShell>
    );
  }

  if (!isValid) {
    return (
      <WkAuthShell aside={aside}>
        <div className="wk-auth-card p-8 sm:p-10 text-center">
          <h1
            className="text-2xl font-semibold tracking-tight"
            style={{ color: 'var(--wk-text)' }}
          >
            Invalid access
          </h1>
          <p
            className="mt-2 text-sm"
            style={{ color: 'var(--wk-text-soft)' }}
          >
            This page can only be opened from your confirmation email. Redirecting
            you to sign in…
          </p>
          <Link href="/login" className="wk-btn wk-btn-primary mt-6 inline-flex">
            Go to sign in
          </Link>
        </div>
      </WkAuthShell>
    );
  }

  return (
    <WkAuthShell aside={aside}>
      <div className="wk-auth-card p-8 sm:p-10">
        <div className="flex flex-col items-center text-center">
          <span
            className="inline-flex h-14 w-14 items-center justify-center rounded-2xl"
            style={{
              backgroundColor: 'var(--wk-good-soft)',
              color: 'var(--wk-good)',
              border: '1px solid var(--wk-good-ring)',
            }}
          >
            <CheckCircle className="h-7 w-7" />
          </span>
          <h1
            className="mt-5 text-2xl font-semibold tracking-tight"
            style={{ color: 'var(--wk-text)' }}
          >
            <span className="wk-gradient-text">Email confirmed!</span>
          </h1>
          <p
            className="mt-2 text-sm"
            style={{ color: 'var(--wk-text-soft)' }}
          >
            Your email address has been successfully verified. Sign in to start
            tracking your maritime career.
          </p>
        </div>

        <div
          className="my-6 h-px w-full"
          style={{ backgroundColor: 'var(--wk-line)' }}
        />

        <Link href="/login" className="wk-btn wk-btn-primary w-full">
          Go to sign in
        </Link>

        <p
          className="mt-6 text-center text-xs"
          style={{ color: 'var(--wk-text-muted)' }}
        >
          Having trouble?{' '}
          <Link href="/login" className="wk-link">
            Contact support
          </Link>
        </p>
      </div>
    </WkAuthShell>
  );
}

function ConfirmFallback() {
  return (
    <WkAuthShell hideBackLink>
      <div
        className="wk-auth-card flex items-center justify-center p-10"
        style={{ minHeight: 260 }}
      >
        <Loader2
          className="h-8 w-8 animate-spin"
          style={{ color: 'var(--wk-accent)' }}
        />
      </div>
    </WkAuthShell>
  );
}

export default function EmailConfirmPage() {
  return (
    <Suspense fallback={<ConfirmFallback />}>
      <EmailConfirmPageInner />
    </Suspense>
  );
}
