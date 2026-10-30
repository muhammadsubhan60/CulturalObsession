import type { Metadata } from 'next';
import { StoreChrome } from '@/components/store/chrome';
import { ProductCard } from '@/components/store/product-card';
import { storeGet, type CardProduct } from '@/lib/store-api';

export const dynamic = 'force-dynamic';

type Search = Promise<Record<string, string | string[] | undefined>>;
const SID = 'template--search__main';

export async function generateMetadata({ searchParams }: { searchParams: Search }): Promise<Metadata> {
  const q = (await searchParams).q;
  const terms = typeof q === 'string' ? q.trim() : '';
  return { title: terms ? `Search: ${terms}` : 'Search', robots: { index: false, follow: true } };
}

/**
 * Dawn's main-search section (not captured by the mirror, rebuilt from the theme's own classes),
 * submitted to from the header's search modal.
 */
export default async function SearchPage({ searchParams }: { searchParams: Search }) {
  const q = (await searchParams).q;
  const terms = (typeof q === 'string' ? q : '').trim().slice(0, 100);
  const results = terms ? ((await storeGet<{ products: CardProduct[] }>(`/search?q=${encodeURIComponent(terms)}`))?.products ?? []) : [];
  const performed = terms.length > 0;

  return (
    <StoreChrome template="search">
      <div id={`shopify-section-${SID}`} className="shopify-section">
        <style>{`.section-${SID}-padding{padding-top:27px;padding-bottom:27px}@media screen and (min-width:750px){.section-${SID}-padding{padding-top:36px;padding-bottom:36px}}`}</style>
        <div className={`template-search${performed && results.length > 0 ? '' : ' template-search--empty'} section-${SID}-padding`}>
          <div className="template-search__header page-width">
            <h1 className="h2 center">{performed ? 'Search results' : 'Search'}</h1>
            <div className="template-search__search">
              <form action="/search" method="get" role="search" className="search">
                <div className="field">
                  <input
                    className="search__input field__input"
                    id="Search-In-Template"
                    type="search"
                    name="q"
                    defaultValue={terms}
                    placeholder="Search"
                    autoCorrect="off"
                    autoComplete="off"
                    autoCapitalize="off"
                    spellCheck={false}
                  />
                  <label className="field__label" htmlFor="Search-In-Template">
                    Search
                  </label>
                  <input name="options[prefix]" type="hidden" value="last" />
                  <button type="submit" className="search__button field__button" aria-label="Search">
                    <svg className="icon icon-search" aria-hidden="true" focusable="false" role="presentation">
                      <use href="#icon-search" />
                    </svg>
                  </button>
                </div>
              </form>
            </div>
            {performed && (
              <p role="status">
                {results.length > 0
                  ? `${results.length} ${results.length === 1 ? 'result' : 'results'} found for “${terms}”`
                  : `No results found for “${terms}”. Check the spelling or use a different word or phrase.`}
              </p>
            )}
          </div>
          {performed && results.length > 0 && (
            <div className="template-search__results collection page-width" id="ProductGridContainer">
              <ul className="grid product-grid grid--2-col-tablet-down grid--4-col-desktop" role="list">
                {results.map((p) => (
                  <li key={p.slug} className="grid__item">
                    <ProductCard product={p} idPrefix={SID} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </StoreChrome>
  );
}
