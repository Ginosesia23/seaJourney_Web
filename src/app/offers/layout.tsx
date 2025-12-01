
'use client';

// This layout is now only necessary if you want to add specific UI for this route.
// For now, we can just render the children directly.

export default function OffersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
