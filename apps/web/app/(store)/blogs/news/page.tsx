import { StoreChrome } from '@/components/store/chrome';
import { renderTheme } from '@/lib/theme/render';
import { sectionHtml } from '@/lib/theme/sections';

export const metadata = { title: 'News', alternates: { canonical: '/blogs/news' } };

/** The theme's blog page. The store has not published articles, so it shows the heading only. */
export default function BlogPage() {
  return (
    <StoreChrome template="blog" currentPath="/blogs/news">
      {renderTheme(sectionHtml('blog', 'main'))}
      {renderTheme(sectionHtml('blog', 'newsletter'))}
    </StoreChrome>
  );
}
