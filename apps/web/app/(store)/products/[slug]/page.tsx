import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { DOMNode } from 'html-react-parser';
import { StoreChrome } from '@/components/store/chrome';
import { GpoInput, GpoMessage, ProductForm, ProductPrice, ProductProvider, ShopNowButton, VariantPicker } from '@/components/store/product/product-client';
import { Price } from '@/components/store/price';
import type { StoreProduct } from '@/components/store/product/types';
import { ProductCard } from '@/components/store/product-card';
import { storeGet, type CardProduct } from '@/lib/store-api';
import { findElement, hasClass, renderTheme } from '@/lib/theme/render';
import { sectionHtml } from '@/lib/theme/sections';

export const dynamic = 'force-dynamic';

// The captured product template these pages are built from (Dawn main-product section).
const SID = 'template--17234680578349__main';
const TEMPLATE_TITLE = 'All Jewellery Customize';
const TEMPLATE_SLUG = 'all-jewellery-customize';
const RECS_SID = 'template--17234680578349__product-recommendations';

type Params = Promise<{ slug: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;
type ProductResponse = { product: StoreProduct; recommendations: CardProduct[] };

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

const load = (slug: string) => storeGet<ProductResponse>(`/products/${encodeURIComponent(slug)}`);

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const data = await load(slug);
  if (!data) return {};
  const { product } = data;
  const image = product.images[0]?.url;
  return {
    title: product.seoTitle ?? product.title,
    description: product.seoDescription ?? undefined,
    alternates: { canonical: `/products/${product.slug}` },
    openGraph: { type: 'website', title: product.title, url: `/products/${product.slug}`, images: image ? [image] : undefined },
  };
}

/** One gallery slide built from the template's first slide, so markup and whitespace stay the theme's. */
function slideHtml(template: string, image: StoreProduct['images'][number], index: number, title: string): string {
  const ratio = image.width && image.height ? (image.height / image.width) * 100 : 100;
  const img = `<img src="${escapeHtml(image.url ?? '')}" alt="${escapeHtml(image.alt ?? '')}" width="${image.width ?? ''}" height="${image.height ?? ''}"${index > 0 ? ' loading="lazy"' : ''} sizes="(min-width: 1200px) 495px, (min-width: 990px) calc(45.0vw - 10rem), (min-width: 750px) calc((100vw - 11.5rem) / 2), calc(100vw / 1 - 4rem)">`;
  return template
    .replace(/42283298226477/g, image.id)
    .replace(index === 0 ? /^$/ : / is-active"/, '"')
    .replace(/padding-top: [\d.]+%;/g, `padding-top: ${ratio}%;`)
    .replace(/<img [^>]*>/g, img)
    .replace(/Open media \d+ in modal/, `Open media ${index + 1} in modal`)
    .replaceAll(TEMPLATE_TITLE, escapeHtml(title));
}

function thumbHtml(template: string, image: StoreProduct['images'][number], index: number, title: string): string {
  return template
    .replace(/Slide-Thumbnails-([^"]+)-0"/, `Slide-Thumbnails-$1-${index}"`)
    .replace(/data-target="[^"]+"/, `data-target="${SID}-${image.id}"`)
    .replace(/data-media-position="\d+"/, `data-media-position="${index + 1}"`)
    .replace(/Load image \d+ in gallery view/, `Load image ${index + 1} in gallery view`)
    .replace(/ aria-current="true"/, index === 0 ? ' aria-current="true"' : '')
    .replace(/Thumbnail-([^"]+)-0"/g, `Thumbnail-$1-${index}"`)
    .replace(/<img ([^>]*?)srcset="[^"]*" src="[^"]*"/, `<img $1src="${escapeHtml(image.url ?? '')}"`)
    .replace(/alt="[^"]*"/, `alt="${escapeHtml(image.alt ?? title)}"`);
}

/** The theme's main product section with this product's data in place. */
function mainSectionHtml(product: StoreProduct): { html: string; gpoHtml: string; buttonHtml: string } {
  let html = sectionHtml('product_options', 'main');
  const title = product.title;

  const slides = html.match(/<li id="Slide-template--[^"]+" class="product__media-item[\s\S]*?<\/li>/g) ?? [];
  const thumbs = html.match(/<li id="Slide-Thumbnails-[\s\S]*?<\/li>/g) ?? [];
  const slideTemplate = slides[0]!;
  const thumbTemplate = thumbs[0]!;

  // Gallery: one slide per image.
  const galleryStart = html.indexOf(slides[0]!);
  const galleryEnd = html.indexOf(slides[slides.length - 1]!) + slides[slides.length - 1]!.length;
  html = html.slice(0, galleryStart) + product.images.map((img, i) => slideHtml(slideTemplate, img, i, title)).join('') + html.slice(galleryEnd);
  html = html.replace(/(<span class="slider-counter--total">)\d+(<\/span>)/, `$1${Math.max(1, product.images.length)}$2`);

  // Thumbnails only when there is more than one image (Dawn's rule).
  const thumbStart = html.indexOf('<slider-component id="GalleryThumbnails-');
  const thumbEnd = html.indexOf('</slider-component>', thumbStart) + '</slider-component>'.length;
  if (product.images.length > 1) {
    const listStart = html.indexOf(thumbs[0]!);
    const listEnd = html.indexOf(thumbs[thumbs.length - 1]!) + thumbs[thumbs.length - 1]!.length;
    html = html.slice(0, listStart) + product.images.map((img, i) => thumbHtml(thumbTemplate, img, i, title)).join('') + html.slice(listEnd);
  } else if (thumbStart >= 0) {
    html = html.slice(0, thumbStart) + html.slice(thumbEnd);
  }

  html = html
    .replaceAll(`https://customizedjewellers.pk/products/${TEMPLATE_SLUG}`, `${siteUrl()}/products/${product.slug}`)
    .replaceAll(`/products/${TEMPLATE_SLUG}`, `/products/${product.slug}`)
    .replaceAll(TEMPLATE_TITLE, escapeHtml(title))
    .replace(/(<p class="product__text caption-with-letter-spacing">)[^<]*(<\/p>)/, `$1${escapeHtml(product.vendor ?? 'Cultural Obsession')}$2`);

  // Personalization block and button for the client form island.
  const gpoStart = html.indexOf('<gpo-container');
  const gpoEnd = html.indexOf('</gpo-container>') + '</gpo-container>'.length;
  let gpoHtml = html.slice(gpoStart, gpoEnd);
  const element = gpoHtml.match(/<div class="gpo-element[\s\S]*?<div class="messages"><\/div>\s*<\/div>/)?.[0] ?? '';
  const fields = product.personalization
    .map((f) =>
      element
        .replaceAll('text-1', escapeHtml(f.key))
        .replace('<span class="label-content">Customize Name</span>', `<span class="label-content">${escapeHtml(f.label)}</span>`)
        .replace('class="gpo-label required"', f.required ? 'class="gpo-label required"' : 'class="gpo-label"'),
    )
    .join('');
  gpoHtml = product.personalization.length ? gpoHtml.replace(element, fields) : '';
  const buttonStart = html.indexOf('<button type="submit" name="add"');
  const buttonHtml = html.slice(buttonStart, html.indexOf('</button>', buttonStart) + '</button>'.length);
  return { html, gpoHtml, buttonHtml };
}

export default async function ProductPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { slug } = await params;
  const search = await searchParams;
  const data = await load(slug);
  if (!data) notFound();
  const { recommendations } = data;
  const requested = typeof search.variant === 'string' ? search.variant : undefined;
  const initial = data.product.variants.find((v) => v.id === requested) ?? data.product.variants.find((v) => v.available) ?? data.product.variants[0];
  // Dawn leads the gallery with the selected variant's image (cards keep the product's featured image).
  const lead = data.product.images.findIndex((i) => i.variantId === initial?.id);
  const product = lead > 0 ? { ...data.product, images: [data.product.images[lead]!, ...data.product.images.filter((_, i) => i !== lead)] } : data.product;
  const { html, gpoHtml, buttonHtml } = mainSectionHtml(product);
  const hasOptions = product.options.length > 0 && product.variants.length > 1;

  // Theme markup is parsed on the server only; client islands receive ready React elements.
  const prices = Object.fromEntries(
    product.variants.map((v) => [v.id, <Price key={v.id} large pricePaisa={v.pricePaisa} compareAtPricePaisa={v.compareAtPricePaisa} available={v.available} />]),
  );
  const fallbackPrice = <Price large pricePaisa={null} compareAtPricePaisa={null} available={false} />;
  const gpo = renderTheme(gpoHtml, (el) => {
    if (el.name === 'input' && (el.attribs.class ?? '').includes('gpo-input')) {
      const field = product.personalization.find((f) => f.key === el.attribs.id);
      return <GpoInput fieldKey={el.attribs.id!} className={el.attribs.class} maxLength={field?.config?.maxLength ?? undefined} />;
    }
    if (el.name === 'div' && el.attribs.class === 'messages') {
      const key = (el.parent as typeof el | null)?.attribs?.['data-element-id'] ?? '';
      return <GpoMessage fieldKey={key} />;
    }
    return undefined;
  });
  const button = renderTheme(buttonHtml, (el, render) => {
    if (el.name === 'button' && el.attribs.name === 'add') {
      const svg = findElement(el.children as DOMNode[], (e) => e.name === 'svg');
      return <ShopNowButton className={el.attribs.class} spinner={svg ? render([svg]) : null} />;
    }
    return undefined;
  });

  const main = renderTheme(html, (el, render) => {
    if (el.name === 'div' && el.attribs.id === `price-${SID}`) {
      return (
        <div className="no-js-hidden" id={`price-${SID}`} role="status">
          <ProductPrice prices={prices} fallback={fallbackPrice} />
        </div>
      );
    }
    if (el.name === 'variant-radios') return hasOptions ? <VariantPicker /> : null;
    if (el.name === 'product-form') {
      return (
        <ProductForm>
          {gpo}
          {button}
        </ProductForm>
      );
    }
    if (el.name === 'pickup-availability') return null;
    if (el.name === 'form' && el.attribs.id === `product-form-installment-${SID}`) return null;
    if (el.name === 'div' && hasClass(el, 'product__accordion')) {
      return (
        <>
          {product.descriptionHtml && <div className="product__description rte quick-add-hidden">{renderTheme(product.descriptionHtml)}</div>}
          <div className={el.attribs.class}>{render(el.children as DOMNode[])}</div>
        </>
      );
    }
    return undefined;
  });

  return (
    <StoreChrome template="product">
      <ProductProvider product={product} sectionId={SID} initialVariantId={initial?.id}>
        {main}
      </ProductProvider>
      {product.images.length > 0 && (
        <product-modal id={`ProductModal-${SID}`} class="product-media-modal media-modal">
          <div className="product-media-modal__dialog" role="dialog" aria-label="Media gallery" aria-modal="true" tabIndex={-1}>
            <button id={`ModalClose-${SID}`} type="button" className="product-media-modal__toggle" aria-label="Close">
              {(
                <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" role="presentation" className="icon icon-close" fill="none" viewBox="0 0 18 17">
                  <path d="M.865 15.978a.5.5 0 00.707.707l7.433-7.431 7.579 7.282a.501.501 0 00.846-.37.5.5 0 00-.153-.351L9.712 8.546l7.417-7.416a.5.5 0 10-.707-.708L8.991 7.853 1.413.573a.5.5 0 10-.693.72l7.563 7.268-7.418 7.417z" fill="currentColor" />
                </svg>
              )}
            </button>
            <div className="product-media-modal__content gradient" role="document" aria-label="Media gallery" tabIndex={0}>
              {product.images.map((img) => (
                <img
                  key={img.id}
                  className="global-media-settings global-media-settings--no-shadow"
                  sizes="(min-width: 750px) calc(100vw - 22rem), 1100px"
                  src={img.url ?? ''}
                  alt={img.alt ?? product.title}
                  loading="lazy"
                  width={img.width ?? undefined}
                  height={img.height ?? undefined}
                  data-media-id={img.id}
                />
              ))}
            </div>
          </div>
        </product-modal>
      )}
      {renderTheme(sectionHtml('product', 'newsletter'))}
      {renderTheme(sectionHtml('product', 'product-recommendations'), (el) => {
        if (el.name !== 'product-recommendations') return undefined;
        // A div, not <product-recommendations>: Dawn's element would refetch from Shopify and replace this.
        return recommendations.length ? (
          <div className={`${el.attribs.class} product-recommendations--loaded`}>
            <h2 className="product-recommendations__heading h2">You may also like</h2>
            <ul className="grid product-grid grid--4-col-desktop grid--2-col-tablet-down" role="list">
              {recommendations.map((p) => (
                <li key={p.slug} className="grid__item">
                  <ProductCard product={p} idPrefix={RECS_SID} />
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className={el.attribs.class} />
        );
      })}
    </StoreChrome>
  );
}

declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'product-modal': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & { class?: string };
    }
  }
}
