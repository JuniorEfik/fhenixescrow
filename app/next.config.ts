import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["cofhejs"],
  experimental: {
    optimizePackageImports: ["ethers", "date-fns", "framer-motion"],
  },
  webpack: (config, { isServer }) => {
    // cofhejs/web.mjs references Node 'fs' etc.; browser build must not resolve them.
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
      };
    }
    return config;
  },
};

export default nextConfig;
