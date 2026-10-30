import type { NextConfig } from 'next';

const config: NextConfig = {
  poweredByHeader: false,
  transpilePackages: ['@co/shared'],
  // Shopify URL shapes that are indexed or bookmarked, sent permanently to their new homes.
  async redirects() {
    return [
      { source: '/collections/:collection/products/:product', destination: '/products/:product', permanent: true },
      { source: '/collections', destination: '/collections/all', permanent: true },
      { source: '/products', destination: '/collections/all', permanent: true },
      { source: '/policies/:policy', destination: '/pages/:policy', permanent: true },
      { source: '/blogs/news/:article', destination: '/blogs/news', permanent: true },
      { source: '/account', destination: '/track-order', permanent: true },
      { source: '/account/:path*', destination: '/track-order', permanent: true },
      { source: '/pages/terms-of-service', destination: '/pages/disclaimer', permanent: true },
    ];
  },
};

export default config;
