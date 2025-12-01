
'use client';

// SupabaseProvider is already in the root layout, as is RevenueCatProvider.
// This layout is now only necessary if you want to add specific UI for this route.
// For now, we can just render the children directly.

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
