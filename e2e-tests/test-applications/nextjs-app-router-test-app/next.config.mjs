/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/ingest/static/:path*',
        destination: 'http://localhost:8010/static/:path*',
      },
      {
        source: '/ingest/:path*',
        destination: 'http://localhost:8010/:path*',
      },
      {
        source: '/ingest/decide',
        destination: 'http://localhost:8010/decide',
      },
    ];
  },
  // This is required to support PostHog trailing slash API requests
  skipTrailingSlashRedirect: true,
};

export default nextConfig;
