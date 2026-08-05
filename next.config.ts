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
  // The PDF renderer reads the vendored DejaVu faces from `assets/fonts` at request time.
  // Next's file tracing follows static imports, not a path built at runtime, so without
  // this the fonts are left out of the serverless bundle and the report route throws
  // ENOENT on Vercel while working perfectly in local `next start`.
  outputFileTracingIncludes: {
    '/api/work-orders/[id]/report': ['./assets/fonts/**'],
  },
  experimental: {
    optimizePackageImports: ['lucide-react', 'date-fns'],
  },
};

export default nextConfig;
