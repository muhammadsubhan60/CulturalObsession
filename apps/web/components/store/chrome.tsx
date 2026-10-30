import type { ReactNode } from 'react';
import { renderTheme } from '@/lib/theme/render';
import { sectionHtml, stylesheetsFor, type TemplateName } from '@/lib/theme/sections';

/** Marks the menu link for `currentPath` active exactly as the theme did (desktop menu and drawer). */
function headerFor(currentPath: string | null): string {
  let html = sectionHtml('home', 'header')
    .replaceAll(' menu-drawer__menu-item--active" aria-current="page"', '"')
    .replace(/(class="header__menu-item [^"]*") aria-current="page"/g, '$1')
    .replaceAll('<span class="header__active-menu-item">', '<span>');
  if (!currentPath) return html;
  const href = `href="${currentPath}"`;
  html = html.replace(
    new RegExp(`(<a ${href} class="menu-drawer__menu-item [^"]*)"`),
    '$1 menu-drawer__menu-item--active" aria-current="page"',
  );
  html = html.replace(
    new RegExp(`(<a ${href} class="header__menu-item [^"]*")(>\\s*)<span>`),
    '$1 aria-current="page"$2<span class="header__active-menu-item">',
  );
  return html;
}

/**
 * The frame every storefront page shares — announcement bar, header, <main>, footer — plus the
 * page template's stylesheets, linked in the live store's order.
 */
export function StoreChrome({
  template,
  currentPath = null,
  children,
}: {
  template: TemplateName;
  /** Menu link to mark active, e.g. "/" or "/collections/necklace". */
  currentPath?: string | null;
  children: ReactNode;
}) {
  return (
    <>
      {stylesheetsFor(template).map((href) => (
        <link key={href} rel="stylesheet" href={href} />
      ))}
      {renderTheme(sectionHtml('home', 'announcement-bar'))}
      {renderTheme(headerFor(currentPath))}
      <main id="MainContent" className="content-for-layout focus-none" role="main" tabIndex={-1}>
        {children}
      </main>
      {renderTheme(sectionHtml('home', 'footer'))}
    </>
  );
}
