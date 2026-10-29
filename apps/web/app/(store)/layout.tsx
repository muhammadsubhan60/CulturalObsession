import type { ReactNode } from 'react';

// Storefront root layout. The Dawn theme shell (header, announcement bar, footer, CSS) lands here in Phase 2.
// It is a separate root layout from /admin, so admin Tailwind CSS can never load on store pages.
export default function StoreLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
