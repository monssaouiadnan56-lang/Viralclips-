/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['fluent-ffmpeg', 'ffmpeg-static'],
  },

  webpack: (config, { dev, isServer }) => {
    if (dev && !isServer) {
      // Default 'eval-source-map' is accurate but extremely memory-heavy.
      // 'eval-cheap-module-source-map' uses ~40% less RAM and still shows original lines.
      config.devtool = 'eval-cheap-module-source-map';
    }
    return config;
  },
};

export default nextConfig;
