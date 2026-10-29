import type { Metadata } from 'next';
import { Archivo, Asul } from 'next/font/google';
import type { ReactNode } from 'react';
import './admin.css';

// Self-hosted at build time by next/font — no runtime requests to Google.
const archivo = Archivo({ subsets: ['latin'], variable: '--font-archivo', display: 'swap' });
const asul = Asul({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-asul', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Admin', template: '%s · Admin' },
  robots: { index: false, follow: false },
};

export default function AdminRootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${archivo.variable} ${asul.variable}`}>
      <body className="min-h-svh">{children}</body>
    </html>
  );
}
