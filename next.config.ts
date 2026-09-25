import type {NextConfig} from 'next';

// PostHog browser key may be stored on Vercel without the NEXT_PUBLIC_
// prefix. Only a project key (phc_) is ever inlined into the client —
// never the personal API key (phx_).
const posthogProjectKey = [
  process.env.NEXT_PUBLIC_POSTHOG_KEY,
  process.env.POSTHOG_KEY,
  process.env.POSTHOG_PROJECT_API_KEY,
].find((k) => typeof k === 'string' && k.trim().startsWith('phc_'))?.trim();

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_POSTHOG_KEY: posthogProjectKey ?? '',
    NEXT_PUBLIC_POSTHOG_HOST:
      process.env.NEXT_PUBLIC_POSTHOG_HOST ||
      process.env.POSTHOG_INGEST_HOST ||
      'https://us.i.posthog.com',
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'cdn.shopify.com',
        port: '',
        pathname: '/**',
      }
    ],
  },
};

export default nextConfig;
