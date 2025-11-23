
'use client';

import { FirebaseClientProvider } from '@/firebase';
import RevenueCatProvider from '@/components/providers/revenue-cat-provider';

export default function ComingSoonLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <FirebaseClientProvider>
      <RevenueCatProvider>
        {children}
      </RevenueCatProvider>
    </FirebaseClientProvider>
  );
}
