import type { CardProduct } from '@/lib/store-api';
import { Price } from './price';

const SIZES = '(min-width: 1200px) 267px, (min-width: 990px) calc((100vw - 130px) / 4), (min-width: 750px) calc((100vw - 120px) / 3), calc((100vw - 35px) / 2)';

/** Dawn's card-product snippet (standard card, square media, sale/sold-out badge), markup unchanged. */
export function ProductCard({ product, idPrefix }: { product: CardProduct; idPrefix: string }) {
  const id = `${idPrefix}-${product.slug}`;
  const href = `/products/${product.slug}`;
  const onSale = product.compareAtPricePaisa != null && product.pricePaisa != null && product.compareAtPricePaisa > product.pricePaisa;
  const badge = !product.available ? (
    <span id={`Badge-${id}`} className="badge badge--bottom-left color-background-1">Sold out</span>
  ) : onSale ? (
    <span id={`Badge-${id}`} className="badge badge--bottom-left color-accent-2">Sale</span>
  ) : null;
  const ratio = product.image ? '100%' : undefined;

  return (
    <div className="card-wrapper product-card-wrapper underline-links-hover">
      <div className={`card card--standard${product.image ? ' card--media' : ' card--text'}`} style={{ '--ratio-percent': ratio ?? '100%' } as React.CSSProperties}>
        <div className="card__inner color-background-1 gradient ratio" style={{ '--ratio-percent': '100%' } as React.CSSProperties}>
          {product.image?.url && (
            <div className="card__media">
              <div className="media media--transparent media--hover-effect">
                <img
                  src={product.image.url}
                  sizes={SIZES}
                  alt={product.image.alt ?? product.title}
                  className="motion-reduce"
                  loading="lazy"
                  width={product.image.width ?? undefined}
                  height={product.image.height ?? undefined}
                />
              </div>
            </div>
          )}
          <div className="card__content">
            <div className="card__information">
              <h3 className="card__heading">
                <a href={href} id={`StandardCardNoMediaLink-${id}`} className="full-unstyled-link" aria-labelledby={`StandardCardNoMediaLink-${id} NoMediaStandardBadge-${id}`}>
                  {product.title}
                </a>
              </h3>
            </div>
            <div className="card__badge top right">
              {badge && (
                <span id={`NoMediaStandardBadge-${id}`} className={badge.props.className}>
                  {badge.props.children}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="card__content">
          <div className="card__information">
            <h3 className="card__heading h5" id={`title-${id}`}>
              <a href={href} id={`CardLink-${id}`} className="full-unstyled-link" aria-labelledby={`CardLink-${id} Badge-${id}`}>
                {product.title}
              </a>
            </h3>
            <div className="card-information">
              <span className="caption-large light"></span>
              <Price pricePaisa={product.pricePaisa} compareAtPricePaisa={product.compareAtPricePaisa} available={product.available} />
            </div>
          </div>
          <div className="card__badge top right">{badge}</div>
        </div>
      </div>
    </div>
  );
}
