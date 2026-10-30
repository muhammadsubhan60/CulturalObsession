import { formatPkr, rupeesToPaisa } from '@co/shared';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { DOMNode } from 'html-react-parser';
import { StoreChrome } from '@/components/store/chrome';
import { Pagination } from '@/components/store/pagination';
import { ProductCard } from '@/components/store/product-card';
import { storeGet, type CardProduct } from '@/lib/store-api';
import { findElement, hasClass, renderTheme } from '@/lib/theme/render';
import { sectionHtml } from '@/lib/theme/sections';

export const dynamic = 'force-dynamic';

type Params = Promise<{ slug: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;
type CollectionResponse = {
  collection: { slug: string; title: string; descriptionHtml: string; seoTitle: string | null; seoDescription: string | null };
  products: CardProduct[];
  total: number;
  page: number;
  pageSize: number;
  sort: string;
  facets: { inStock: number; outOfStock: number; maxPricePaisa: number };
  filters: { available: string[]; minPrice: number | null; maxPrice: number | null };
};

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const many = (v: string | string[] | undefined) => (v === undefined ? [] : ([] as string[]).concat(v));
const rupees = (paisa: number) => (paisa / 100).toFixed(2);

function toPaisa(v: string | undefined): number | undefined {
  if (!v) return undefined;
  try {
    return rupeesToPaisa(v);
  } catch {
    return undefined;
  }
}

async function load(slug: string, search: Record<string, string | string[] | undefined>) {
  const q = new URLSearchParams();
  const sort = one(search.sort_by);
  if (sort) q.set('sort', sort);
  const page = one(search.page);
  if (page) q.set('page', page);
  for (const a of many(search['filter.v.availability'])) q.append('available', a);
  const min = toPaisa(one(search['filter.v.price.gte']));
  const max = toPaisa(one(search['filter.v.price.lte']));
  if (min !== undefined) q.set('minPrice', String(min));
  if (max !== undefined) q.set('maxPrice', String(max));
  return storeGet<CollectionResponse>(`/collections/${encodeURIComponent(slug)}?${q}`);
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const data = await storeGet<CollectionResponse>(`/collections/${encodeURIComponent(slug)}`);
  if (!data) return {};
  return {
    title: data.collection.seoTitle ?? data.collection.title,
    description: data.collection.seoDescription ?? undefined,
    alternates: { canonical: `/collections/${data.collection.slug}` },
  };
}

export default async function CollectionPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { slug } = await params;
  const search = await searchParams;
  const data = await load(slug, search);
  if (!data) notFound();

  const { collection, facets, filters } = data;
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const hrefFor = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(search)) if (k !== 'page') for (const x of many(v)) q.append(k, x);
    if (p > 1) q.set('page', String(p));
    return `/collections/${collection.slug}${q.size ? `?${q}` : ''}`;
  };

  // Text the theme rendered from collection data, substituted in its own markup.
  const grid = sectionHtml('collection', 'main-product-grid')
    .replaceAll('href="/collections/necklace"', `href="/collections/${collection.slug}"`)
    .replaceAll('In stock (40 products)', `In stock (${facets.inStock} products)`)
    .replaceAll('In stock (40)', `In stock (${facets.inStock})`)
    .replaceAll('Out of stock (0 products)', `Out of stock (${facets.outOfStock} products)`)
    .replaceAll('Out of stock (0)', `Out of stock (${facets.outOfStock})`)
    .replaceAll('The highest price is Rs.999.00', `The highest price is ${formatPkr(facets.maxPricePaisa).replace(' PKR', '')}`)
    .replaceAll('max="999.00"', `max="${rupees(facets.maxPricePaisa)}"`)
    .replaceAll('placeholder="999.00"', `placeholder="${rupees(facets.maxPricePaisa)}"`)
    .replace(/(<span id="ProductCount(?:Desktop)?">)40 products/g, `$1${data.total} ${data.total === 1 ? 'product' : 'products'}`)
    .replaceAll(' selected="selected"', '');

  const gridSection = renderTheme(grid, (el, render) => {
    if (el.name === 'ul' && el.attribs.id === 'product-grid') {
      return (
        <ul id="product-grid" data-id={el.attribs['data-id']} className={el.attribs.class}>
          {data.products.map((p) => (
            <li key={p.slug} className="grid__item">
              <ProductCard product={p} idPrefix={el.attribs['data-id'] ?? 'grid'} />
            </li>
          ))}
        </ul>
      );
    }
    if (el.name === 'div' && hasClass(el, 'pagination-wrapper')) {
      const caret = findElement(el.children as DOMNode[], (e) => e.name === 'svg');
      return <Pagination page={data.page} pages={pages} hrefFor={hrefFor} caret={caret ? render([caret]) : null} />;
    }
    if (el.name === 'select' && el.attribs.name === 'sort_by') {
      return (
        <select name="sort_by" className={el.attribs.class} id={el.attribs.id} aria-describedby={el.attribs['aria-describedby']} defaultValue={data.sort}>
          {render(el.children as DOMNode[])}
        </select>
      );
    }
    if (el.name === 'input' && el.attribs.name === 'filter.v.availability') {
      return <input type="checkbox" name="filter.v.availability" value={el.attribs.value} id={el.attribs.id} defaultChecked={filters.available.includes(el.attribs.value ?? '')} disabled={'disabled' in el.attribs} />;
    }
    if (el.name === 'input' && (el.attribs.name === 'filter.v.price.gte' || el.attribs.name === 'filter.v.price.lte')) {
      const paisa = el.attribs.name === 'filter.v.price.gte' ? filters.minPrice : filters.maxPrice;
      return (
        <input
          className={el.attribs.class}
          name={el.attribs.name}
          id={el.attribs.id}
          type="number"
          placeholder={el.attribs.placeholder}
          min={el.attribs.min}
          max={el.attribs.max}
          defaultValue={paisa != null ? rupees(paisa) : undefined}
        />
      );
    }
    return undefined;
  });

  const banner = renderTheme(sectionHtml('collection', 'main-collection-banner'), (el) => {
    if (el.name === 'h1' && hasClass(el, 'collection-hero__title')) {
      return (
        <h1 className="collection-hero__title">
          <span className="visually-hidden">Collection: </span>
          {collection.title}
        </h1>
      );
    }
    if (el.name === 'div' && hasClass(el, 'collection-hero__description')) {
      return <div className="collection-hero__description rte">{renderTheme(collection.descriptionHtml)}</div>;
    }
    return undefined;
  });

  return (
    <StoreChrome template="collection" currentPath={`/collections/${collection.slug}`}>
      {banner}
      {gridSection}
      {renderTheme(sectionHtml('collection', 'newsletter'))}
      {renderTheme(sectionHtml('collection', 'collection-list'))}
    </StoreChrome>
  );
}
