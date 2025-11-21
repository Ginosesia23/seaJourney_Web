
'use client';

import RevenueCatProvider from '@/components/providers/revenue-cat-provider';

export default function ComingSoonLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RevenueCatProvider>
      {children}
    </RevenueCatProvider>
  );
}
