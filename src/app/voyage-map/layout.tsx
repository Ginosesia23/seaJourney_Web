import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Voyage map — past vessel passages on the chart | SeaJourney',
  description:
    'Explore how SeaJourney turns historical AIS into readable passage tracks — distance, duration, and multi-vessel seasons on one map.',
};

export default function VoyageMapLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
