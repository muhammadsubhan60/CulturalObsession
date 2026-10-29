import type { ReactNode } from 'react';

// The Dawn theme shell (header, announcement bar, footer, CSS) replaces this in Phase 2.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
