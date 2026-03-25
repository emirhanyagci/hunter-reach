/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@hunterreach/shared'],
  experimental: {
    serverComponentsExternalPackages: [],
  },
};

module.exports = nextConfig;
