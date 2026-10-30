import type { ReactNode } from 'react';
import { renderTheme } from '@/lib/theme/render';
import { sectionHtml } from '@/lib/theme/sections';

/** Announcement bar, header, the page's <main> and footer — the frame every storefront page shares. */
export function StoreChrome({ children }: { children: ReactNode }) {
  return (
    <>
      {renderTheme(sectionHtml('home', 'announcement-bar'))}
      {renderTheme(sectionHtml('home', 'header'))}
      <main id="MainContent" className="content-for-layout focus-none" role="main" tabIndex={-1}>
        {children}
      </main>
      {renderTheme(sectionHtml('home', 'footer'))}
    </>
  );
}
