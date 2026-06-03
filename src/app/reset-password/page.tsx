import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { WkAuthShell } from '@/components/wk/wk-auth-shell';
import ResetPasswordClient from './reset-password-client';

function ResetPasswordFallback() {
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

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<ResetPasswordFallback />}>
      <ResetPasswordClient />
    </Suspense>
  );
}
