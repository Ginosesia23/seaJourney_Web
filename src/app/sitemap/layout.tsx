import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sitemap | SeaJourney',
  description: 'Index of public pages on SeaJourney.',
};

export default function SitemapLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
