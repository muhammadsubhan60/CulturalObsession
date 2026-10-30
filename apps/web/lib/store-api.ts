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
