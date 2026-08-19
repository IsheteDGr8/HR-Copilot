/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: 'http://localhost:8000/api/v1/:path*',
      },
    ];
  },
  // OneDrive can break Next.js symlink/readlink cleanup in `.next` on Windows.
  webpack: (config, { dev }) => {
    if (dev) {
      config.cache = false
    }
    return config
  },
};

export default nextConfig;
