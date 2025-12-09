// app/payment-success/page.tsx
import { Suspense } from 'react';
import PaymentSuccessClient from './payment-success-client';

export default function PaymentSuccessPage() {
  return (
    <Suspense fallback={
      <div className="dark animated-gradient-background flex min-h-screen items-center justify-center px-4">
        <div className="text-center text-muted-foreground">
          Loading payment details...
        </div>
      </div>
    }>
      <PaymentSuccessClient />
    </Suspense>
  );
}
