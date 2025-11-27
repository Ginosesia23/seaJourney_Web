
'use client';

// FirebaseClientProvider and RevenueCatProvider are in the root layout, so they are not needed here.
// This layout can be removed if no other specific layout UI is needed for this route.

export default function OffersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
