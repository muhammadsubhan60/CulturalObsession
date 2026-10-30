'use client';

import { formatPkr } from '@co/shared';
import * as React from 'react';
import { CART_EVENT, readCart, updateQuantity, type CartLine } from '@/lib/cart';
import { storeFetch, type Quote, type QuoteLine } from '@/lib/store-client';

const SID = 'template--cart__cart-items';
const FOOTER_SID = 'template--cart__cart-footer';

const MinusIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" role="presentation" className="icon icon-minus" fill="none" viewBox="0 0 10 2">
    <path fillRule="evenodd" clipRule="evenodd" d="M.5 1C.5.7.7.5 1 .5h8a.5.5 0 110 1H1A.5.5 0 01.5 1z" fill="currentColor" />
  </svg>
);
const PlusIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" role="presentation" className="icon icon-plus" fill="none" viewBox="0 0 10 10">
    <path fillRule="evenodd" clipRule="evenodd" d="M1 4.51a.5.5 0 000 1h3.5l.01 3.5a.5.5 0 001-.01V5.5l3.5-.01a.5.5 0 00-.01-1H5.5L5.49.99a.5.5 0 00-1 .01v3.5l-3.5.01H1z" fill="currentColor" />
  </svg>
);
const RemoveIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" aria-hidden="true" focusable="false" role="presentation" className="icon icon-remove">
    <path d="M14 3h-3.53a3.07 3.07 0 00-.6-1.65C9.44.82 8.8.5 8 .5s-1.44.32-1.87.85A3.06 3.06 0 005.53 3H2a.5.5 0 000 1h1.25v10c0 .28.22.5.5.5h8.5a.5.5 0 00.5-.5V4H14a.5.5 0 000-1zM6.91 1.98c.23-.29.58-.48 1.09-.48s.85.19 1.09.48c.2.24.3.6.36 1.02h-2.9c.05-.42.17-.78.36-1.02zm4.84 11.52h-7.5V4h7.5v9.5z" fill="currentColor" />
    <path d="M6.55 5.25a.5.5 0 00-.5.5v6a.5.5 0 001 0v-6a.5.5 0 00-.5-.5zM9.45 5.25a.5.5 0 00-.5.5v6a.5.5 0 001 0v-6a.5.5 0 00-.5-.5z" fill="currentColor" />
  </svg>
);
const ErrorIcon = () => (
  <svg aria-hidden="true" focusable="false" role="presentation" className="icon icon-error" viewBox="0 0 13 13">
    <circle cx="6.5" cy="6.50049" r="5.5" stroke="white" strokeWidth="2" />
    <circle cx="6.5" cy="6.5" r="5.5" fill="#EB001B" stroke="#EB001B" strokeWidth="0.7" />
    <path d="M5.87413 3.52832L5.97439 7.57216H7.02713L7.12739 3.52832H5.87413ZM6.50076 9.66091C6.88091 9.66091 7.18169 9.37267 7.18169 9.00504C7.18169 8.63742 6.88091 8.34917 6.50076 8.34917C6.12061 8.34917 5.81982 8.63742 5.81982 9.00504C5.81982 9.37267 6.12061 9.66091 6.50076 9.66091Z" fill="white" />
  </svg>
);

const problemText = (l: QuoteLine) =>
  l.problem === 'unavailable' ? 'This item is no longer available' : l.problem === 'out_of_stock' ? 'Sold out' : l.problemDetail ?? '';

/** Dawn's cart template (main-cart-items + main-cart-footer), priced by the server. */
export function CartPage() {
  const [lines, setLines] = React.useState<CartLine[] | null>(null);
  const [quote, setQuote] = React.useState<Quote | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const sync = () => setLines(readCart());
    sync();
    window.addEventListener(CART_EVENT, sync);
    return () => window.removeEventListener(CART_EVENT, sync);
  }, []);

  React.useEffect(() => {
    if (!lines) return;
    if (lines.length === 0) {
      setQuote(null);
      return;
    }
    let cancelled = false;
    storeFetch<Quote>('/cart/quote', { lines: lines.map(({ variantId, quantity, customization }) => ({ variantId, quantity, customization })) })
      .then((q) => !cancelled && (setQuote(q), setError(null)))
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [lines]);

  const empty = lines !== null && lines.length === 0;
  const loading = lines === null || (!empty && !quote && !error);

  return (
    <>
      <div id={`shopify-section-${SID}`} className="shopify-section">
        <style>{`.section-${SID}-padding{padding-top:27px;padding-bottom:27px}@media screen and (min-width:750px){.section-${SID}-padding{padding-top:36px;padding-bottom:36px}}`}</style>
        <cart-items class={`page-width section-${SID}-padding${empty ? ' is-empty' : ''}`}>
          <div className="title-wrapper-with-link">
            <h1 className="title title--primary">Your cart</h1>
            <a href="/collections/all" className="underlined-link">
              Continue shopping
            </a>
          </div>
          <div className="cart__warnings">
            <h1 className="cart__empty-text">Your cart is empty</h1>
            <a href="/collections/all" className="button">
              Continue shopping
            </a>
          </div>
          <form action="/checkout" className="cart__contents critical-hidden" method="get" id="cart">
            <div className="cart__items" id="main-cart-items" data-id={SID}>
              <div className="js-contents">
                {error && (
                  <div className="cart-item__error" role="alert">
                    <ErrorIcon />
                    <small className="cart-item__error-text">{error}</small>
                  </div>
                )}
                {quote && (
                  <table className="cart-items">
                    <caption className="visually-hidden">Your cart</caption>
                    <thead>
                      <tr>
                        <th className="caption-with-letter-spacing" colSpan={2} scope="col">
                          Product
                        </th>
                        <th className="medium-hide large-up-hide right caption-with-letter-spacing" colSpan={1} scope="col">
                          Total
                        </th>
                        <th className="cart-items__heading--wide small-hide caption-with-letter-spacing" colSpan={1} scope="col">
                          Quantity
                        </th>
                        <th className="small-hide right caption-with-letter-spacing" colSpan={1} scope="col">
                          Total
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {quote.lines.map((l, i) => {
                        const line = lines?.[i];
                        if (!line) return null;
                        const n = i + 1;
                        const url = `/products/${l.productSlug}?variant=${l.variantId}`;
                        return (
                          <tr className="cart-item" id={`CartItem-${n}`} key={line.key}>
                            <td className="cart-item__media">
                              {l.image && (
                                <>
                                  <a href={url} className="cart-item__link" aria-hidden="true" tabIndex={-1}>
                                    {' '}
                                  </a>
                                  <div className="cart-item__image-container gradient global-media-settings">
                                    <img src={l.image} className="cart-item__image" alt={l.productTitle} loading="lazy" width={150} />
                                  </div>
                                </>
                              )}
                            </td>
                            <td className="cart-item__details">
                              <a href={url} className="cart-item__name h4 break">
                                {l.productTitle}
                              </a>
                              <div className="product-option">{formatPkr(l.unitPricePaisa)}</div>
                              <dl>
                                {l.variantTitle && (
                                  <div className="product-option">
                                    <dt>Variant: </dt>
                                    <dd>{l.variantTitle}</dd>
                                  </div>
                                )}
                                {l.customization.map((c) => (
                                  <div className="product-option" key={c.key}>
                                    <dt>{c.label}: </dt>
                                    <dd>{c.value}</dd>
                                  </div>
                                ))}
                              </dl>
                              <ul className="discounts list-unstyled" role="list" aria-label="Discount"></ul>
                            </td>
                            <td className="cart-item__totals right medium-hide large-up-hide">
                              <div className="cart-item__price-wrapper">
                                <span className="price price--end">{formatPkr(l.lineTotalPaisa)}</span>
                              </div>
                            </td>
                            <td className="cart-item__quantity">
                              <div className="cart-item__quantity-wrapper">
                                <label className="visually-hidden" htmlFor={`Quantity-${n}`}>
                                  Quantity
                                </label>
                                <div className="quantity">
                                  <button className="quantity__button no-js-hidden" name="minus" type="button" onClick={() => updateQuantity(line.key, line.quantity - 1)}>
                                    <span className="visually-hidden">Decrease quantity for {l.productTitle}</span>
                                    <MinusIcon />
                                  </button>
                                  <input
                                    className="quantity__input"
                                    type="number"
                                    value={line.quantity}
                                    min={0}
                                    max={20}
                                    aria-label={`Quantity for ${l.productTitle}`}
                                    id={`Quantity-${n}`}
                                    onChange={(e) => updateQuantity(line.key, Number(e.target.value) || 0)}
                                  />
                                  <button className="quantity__button no-js-hidden" name="plus" type="button" onClick={() => updateQuantity(line.key, line.quantity + 1)}>
                                    <span className="visually-hidden">Increase quantity for {l.productTitle}</span>
                                    <PlusIcon />
                                  </button>
                                </div>
                                <cart-remove-button id={`Remove-${n}`} data-index={n}>
                                  <button type="button" className="button button--tertiary" aria-label={`Remove ${l.productTitle}`} onClick={() => updateQuantity(line.key, 0)}>
                                    <RemoveIcon />
                                  </button>
                                </cart-remove-button>
                              </div>
                              {l.problem && (
                                <div className="cart-item__error" id={`Line-item-error-${n}`} role="alert">
                                  <small className="cart-item__error-text">{problemText(l)}</small>
                                  <ErrorIcon />
                                </div>
                              )}
                            </td>
                            <td className="cart-item__totals right small-hide">
                              <div className="cart-item__price-wrapper">
                                <span className="price price--end">{formatPkr(l.lineTotalPaisa)}</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
                {loading && (
                  <p className="caption-large" role="status">
                    Loading your cart…
                  </p>
                )}
              </div>
            </div>
          </form>
        </cart-items>
      </div>

      {quote && !empty && (
        <div id={`shopify-section-${FOOTER_SID}`} className="shopify-section cart__footer-wrapper">
          <div className="page-width" id="main-cart-footer" data-id={FOOTER_SID}>
            <div>
              <div className="cart__footer">
                <div className="cart__blocks">
                  <div className="js-contents">
                    <div className="totals">
                      <h2 className="totals__subtotal">Subtotal</h2>
                      <p className="totals__subtotal-value">{formatPkr(quote.subtotalPaisa)}</p>
                    </div>
                    <small className="tax-note caption-large rte">Shipping calculated at checkout</small>
                  </div>
                  <div className="cart__ctas">
                    <a href={quote.ok ? '/checkout' : undefined} id="checkout" className="cart__checkout-button button" aria-disabled={!quote.ok} role="button">
                      Check out
                    </a>
                  </div>
                  <div id="cart-errors">{!quote.ok && <small className="cart-item__error-text">Please fix the items marked above before checking out.</small>}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'cart-items': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & { class?: string };
      'cart-remove-button': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & { 'data-index'?: number };
    }
  }
}
