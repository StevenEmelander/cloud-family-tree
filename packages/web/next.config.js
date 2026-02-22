/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  transpilePackages: ['@cloud-family-tree/shared'],
};

module.exports = nextConfig;
