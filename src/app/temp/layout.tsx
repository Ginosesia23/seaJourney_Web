import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'SeaJourney — Vessel + crew workflow (preview)',
  description:
    'Preview landing page: how yacht managers and crew use SeaJourney together — shared sea time, passages, sign-offs, and compliance.',
  robots: { index: false, follow: false },
};

export default function TempLandingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
