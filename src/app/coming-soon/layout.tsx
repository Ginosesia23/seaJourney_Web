
'use client';

// This file is no longer needed as RevenueCatProvider is in the root layout.
// We keep it to avoid breaking Next.js build but return children directly.
export default function ComingSoonLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
