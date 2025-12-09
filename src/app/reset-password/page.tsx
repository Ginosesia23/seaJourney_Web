// app/reset-password/page.tsx
import { Suspense } from 'react';
import ResetPasswordClient from './reset-password-client';

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="dark animated-gradient-background flex min-h-screen flex-col items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="h-10 w-10 rounded-full border border-white/30 border-t-transparent animate-spin" />
            <p className="text-sm text-muted-foreground">
              Loading reset password form...
            </p>
          </div>
        </div>
      }
    >
      <ResetPasswordClient />
    </Suspense>
  );
}
