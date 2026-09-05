import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'SeaJourney for Vessels — Crew, Passages, AIS & Linked Accounts',
  description:
    'Vessel plans for yacht managers: linked team accounts, passage logbook, passage tracks, AIS history, live tracking, watch schedules, and verifiable crew documents.',
};

export default function ForVesselsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
