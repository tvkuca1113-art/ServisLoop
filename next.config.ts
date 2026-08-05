import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ['exceljs', 'pdf-lib', '@pdf-lib/fontkit'],
  typescript: {
    // Types are enforced by `npm run typecheck` in CI; never silently ignored.
    ignoreBuildErrors: false,
  },
  eslint: {
    // Lint is enforced by `npm run lint`; keep the build focused on compilation.
    ignoreDuringBuilds: true,
  },
  experimental: {
    optimizePackageImports: ['lucide-react', 'date-fns'],
  },
};

export default nextConfig;
