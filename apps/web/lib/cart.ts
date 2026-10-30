'use client';

/**
 * The cart lives in the browser until checkout: variant ids, quantities and personalization.
 * Prices are never stored here — the server recalculates everything at checkout.
 */
export type CartLine = {
  key: string;
  variantId: string;
  productSlug: string;
  quantity: number;
  customization: Record<string, string>;
};

const STORAGE_KEY = 'co.cart.v1';
export const CART_EVENT = 'co:cart';
export const MAX_LINE_QUANTITY = 20;

export function readCart(): CartLine[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const lines = raw ? (JSON.parse(raw) as CartLine[]) : [];
    return Array.isArray(lines) ? lines.filter((l) => l && typeof l.variantId === 'string' && l.quantity > 0) : [];
  } catch {
    return [];
  }
}

function write(lines: CartLine[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
  } catch {
    // Storage unavailable (private mode): the cart lasts for this page only.
  }
  window.dispatchEvent(new CustomEvent(CART_EVENT, { detail: lines }));
}

const lineKey = (variantId: string, customization: Record<string, string>) =>
  `${variantId}|${Object.entries(customization)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('&')}`;

/** Same variant with the same personalization merges into one line. */
export function addToCart(line: Omit<CartLine, 'key'>) {
  const key = lineKey(line.variantId, line.customization);
  const lines = readCart();
  const existing = lines.find((l) => l.key === key);
  if (existing) existing.quantity = Math.min(MAX_LINE_QUANTITY, existing.quantity + line.quantity);
  else lines.push({ ...line, key, quantity: Math.min(MAX_LINE_QUANTITY, line.quantity) });
  write(lines);
}

export function updateQuantity(key: string, quantity: number) {
  const lines = readCart()
    .map((l) => (l.key === key ? { ...l, quantity: Math.min(MAX_LINE_QUANTITY, Math.max(0, quantity)) } : l))
    .filter((l) => l.quantity > 0);
  write(lines);
}

export function clearCart() {
  write([]);
}

export function cartCount(lines = readCart()) {
  return lines.reduce((n, l) => n + l.quantity, 0);
}
