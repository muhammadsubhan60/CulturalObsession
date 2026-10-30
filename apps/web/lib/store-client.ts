'use client';

import { API_URL } from './env';

export type QuoteLine = {
  index: number;
  variantId: string;
  productSlug: string;
  productTitle: string;
  variantTitle: string | null;
  sku: string;
  productType: 'READY_MADE' | 'PERSONALIZABLE';
  image: string | null;
  quantity: number;
  unitPricePaisa: number;
  compareAtPricePaisa: number | null;
  customizationPaisa: number;
  lineTotalPaisa: number;
  customization: { key: string; label: string; value: string; extraPricePaisa: number }[];
  problem: 'unavailable' | 'out_of_stock' | 'customization' | null;
  problemDetail: string | null;
};

export type Quote = {
  lines: QuoteLine[];
  subtotalPaisa: number;
  shippingPaisa: number;
  totalPaisa: number;
  advanceRequiredPaisa: number;
  codAmountPaisa: number;
  ok: boolean;
};

export class StoreError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly fields: { path: string; message: string }[] = [],
  ) {
    super(message);
  }
}

/** Calls the public storefront API from the browser (no cookies). */
export async function storeFetch<T>(path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/store${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new StoreError(0, 'Could not reach the store. Check your connection and try again.');
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string; fields?: { path: string; message: string }[] };
  if (!res.ok) {
    const message =
      res.status === 429
        ? (data.error ?? 'Too many attempts. Please wait a moment and try again.')
        : res.status === 409
          ? (data.error ?? 'Some items in your cart changed. Please review your cart.')
          : res.status === 400
            ? 'Please check the highlighted fields.'
            : 'Something went wrong, please try again.';
    throw new StoreError(res.status, message, data.fields ?? []);
  }
  return data as T;
}
