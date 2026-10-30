import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { ThemeScripts } from '@/components/store/theme-scripts';
import { THEME_STYLESHEETS } from '@/lib/theme/sections';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: { default: 'Cultural Obsession', template: '%s – Cultural Obsession' },
  openGraph: { siteName: 'Cultural Obsession', type: 'website' },
  icons: { icon: '/storefront/favicon.png' },
};

/**
 * Storefront root layout: the locked theme's stylesheets, fonts and Dawn scripts exactly as the
 * live store loaded them (minus Shopify trackers). Separate root layout from /admin.
 */
export default function StoreLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="js">
      <head>
        <link rel="preload" as="font" type="font/woff2" crossOrigin="anonymous" href="/theme/customizedjewellers.pk/cdn/fonts/archivo/archivo_n4.dc8d917cc69af0a65ae04d01fd8eeab28a3573c9.woff2" />
        <link rel="preload" as="font" type="font/woff2" crossOrigin="anonymous" href="/theme/customizedjewellers.pk/cdn/fonts/asul/asul_n4.814c5323104eaec8052c156ea81d27e4cc2ecc89.woff2" />
        <link rel="stylesheet" href="/theme/head.css" />
        {THEME_STYLESHEETS.map((href) => (
          <link key={href} rel="stylesheet" href={href} />
        ))}
      </head>
      <body className="gradient">
        <a className="skip-to-content-link button visually-hidden" href="#MainContent">
          Skip to content
        </a>
        {children}
        <ThemeScripts />
      </body>
    </html>
  );
}
