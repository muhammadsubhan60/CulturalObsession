import { Fragment } from 'react';
import { FeaturedCollection } from '@/components/store/featured-collection';
import { StoreChrome } from '@/components/store/chrome';
import { storeGet, type CardProduct } from '@/lib/store-api';
import { renderTheme } from '@/lib/theme/render';
import { sectionHtml } from '@/lib/theme/sections';

export const dynamic = 'force-dynamic';

// The two theme sections that showed product collections; their slots are filled in configured order.
const FEATURED_TEMPLATES = ['8177bac5-db42-4b9a-beee-fb432236f3c7', 'b23aa4c7-34ae-4547-a9e0-859bbcc0056e'];
const AFTER_FEATURED = ['collage', 'image-with-text-0', 'newsletter', 'image-with-text-1', 'multicolumn'];

type Home = { featured: { collection: { slug: string; title: string }; products: CardProduct[] }[] };

export default async function HomePage() {
  const home = (await storeGet<Home>('/home')) ?? { featured: [] };
  return (
    <StoreChrome template="home" currentPath="/">
      {renderTheme(sectionHtml('home', 'slideshow'))}
      {FEATURED_TEMPLATES.map((template, i) => {
        const slot = home.featured[i];
        return slot ? <FeaturedCollection key={template} template={template} collection={slot.collection} products={slot.products} /> : null;
      })}
      {AFTER_FEATURED.map((name) => (
        <Fragment key={name}>{renderTheme(sectionHtml('home', name))}</Fragment>
      ))}
    </StoreChrome>
  );
}
