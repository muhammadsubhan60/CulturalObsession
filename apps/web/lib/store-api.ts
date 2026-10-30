import 'server-only';

/** Server-side only. On Railway this can be the private-network URL; defaults to the public API. */
const BASE = process.env.STORE_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export type StoreImage = { url: string | null; width: number | null; height: number | null; alt: string | null };
export type CardProduct = {
  slug: string;
  title: string;
  image: StoreImage | null;
  pricePaisa: number | null;
  compareAtPricePaisa: number | null;
  available: boolean;
};

/** GET from the storefront API; null on 404. Responses are cached for a minute. */
export async function storeGet<T>(path: string): Promise<T | null> {
  const res = await fetch(`${BASE}/api/store${path}`, { next: { revalidate: 60, tags: ['catalogue'] } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Store API ${path} failed (${res.status})`);
  return (await res.json()) as T;
}

/**
 * POST to the storefront API on behalf of a shopper. The internal token lets the API trust the
 * forwarded shopper IP for its rate limits; without it the API uses this server's address.
 */
export async function storePost(path: string, body: unknown, shopperIp: string | null): Promise<{ status: number }> {
  const token = process.env.STORE_INTERNAL_TOKEN;
  const res = await fetch(`${BASE}/api/store${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token && shopperIp ? { 'X-Internal-Token': token, 'X-Shopper-IP': shopperIp } : {}),
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  return { status: res.status };
}

/** Uncached GET, for per-customer data such as an order's status. */
export async function storeGetFresh<T>(path: string): Promise<T | null> {
  const res = await fetch(`${BASE}/api/store${path}`, { cache: 'no-store' });
  if (res.status === 404 || res.status === 400) return null;
  if (!res.ok) throw new Error(`Store API ${path} failed (${res.status})`);
  return (await res.json()) as T;
}
