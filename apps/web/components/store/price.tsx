import { formatPkr } from '@co/shared';
import parse from 'html-react-parser';

/**
 * Dawn's price snippet. Built from the theme's exact markup string, whitespace included: the
 * whitespace between the spans renders as the gaps between amounts, so JSX would shift them.
 * Values are formatted numbers only, never user input. Works on the server and in the browser.
 */
export function priceHtml({
  pricePaisa,
  compareAtPricePaisa,
  available = true,
  large = false,
}: {
  pricePaisa: number | null;
  compareAtPricePaisa: number | null;
  available?: boolean;
  large?: boolean;
}): string {
  const onSale = compareAtPricePaisa != null && pricePaisa != null && compareAtPricePaisa > pricePaisa;
  const price = pricePaisa == null ? '' : formatPkr(pricePaisa);
  const compare = onSale ? formatPkr(compareAtPricePaisa!) : '';
  const classes = large
    ? `price price--large${onSale ? ' price--on-sale' : ''}${available ? '' : ' price--sold-out'} price--show-badge`
    : `price ${available ? '' : ' price--sold-out'}${onSale ? ' price--on-sale' : ''} `;
  const regular = large ? `<span class="price-item price-item--regular">${price}</span>` : `<span class="price-item price-item--regular">\n        ${price}\n      </span>`;
  const badges = large
    ? `<span class="badge price__badge-sale color-accent-2">\n      Sale\n    </span>\n\n    <span class="badge price__badge-sold-out color-background-1">\n      Sold out\n    </span>`
    : '';
  return (
    `<div class="${classes}">\n  <div class="price__container"><div class="price__regular">\n      <span class="visually-hidden visually-hidden--inline">Regular price</span>\n      ${regular}\n    </div>\n` +
    `    <div class="price__sale">\n        <span class="visually-hidden visually-hidden--inline">Regular price</span>\n        <span>\n          <s class="price-item price-item--regular">\n            \n              ${compare}\n            \n          </s>\n        </span>` +
    `<span class="visually-hidden visually-hidden--inline">Sale price</span>\n      <span class="price-item price-item--sale price-item--last">\n        ${price}\n      </span>\n    </div>\n` +
    `    <small class="unit-price caption hidden">\n      <span class="visually-hidden">Unit price</span>\n      <span class="price-item price-item--last">\n        <span></span>\n        <span aria-hidden="true">/</span>\n        <span class="visually-hidden">&nbsp;per&nbsp;</span>\n        <span>\n        </span>\n      </span>\n    </small>\n  </div>${badges}</div>`
  );
}

export function Price(props: Parameters<typeof priceHtml>[0]) {
  return <>{parse(priceHtml(props))}</>;
}
