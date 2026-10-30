import type { CardProduct } from '@/lib/store-api';
import { idStarts, renderTheme } from '@/lib/theme/render';
import { sectionHtml } from '@/lib/theme/sections';
import { ProductCard } from './product-card';

/**
 * A homepage "featured collection" section: the theme's own wrapper (title, slider, view-all
 * button) with its product list rebuilt from the database.
 */
export function FeaturedCollection({
  template,
  collection,
  products,
}: {
  template: string;
  collection: { slug: string; title: string };
  products: CardProduct[];
}) {
  const html = sectionHtml('home', template);
  const sectionId = /id="shopify-section-(template--[^"]+)"/.exec(html)?.[1] ?? template;
  return renderTheme(html, (el, render) => {
    if (el.name === 'ul' && idStarts(el, 'Slider-')) {
      return (
        <ul id={el.attribs.id} className={el.attribs.class} role="list" aria-label="Slider">
          {products.map((p, i) => (
            <li key={p.slug} id={`Slide-${sectionId}-${i + 1}`} className="grid__item">
              <ProductCard product={p} idPrefix={sectionId} />
            </li>
          ))}
        </ul>
      );
    }
    if (el.name === 'a' && (el.attribs.class ?? '') === 'button' && el.attribs.href?.startsWith('/collections/')) {
      return (
        <a href={`/collections/${collection.slug}`} className="button" aria-label={`View all products in the ${collection.title} collection`}>
          {render(el.children as never)}
        </a>
      );
    }
    return undefined;
  });
}

