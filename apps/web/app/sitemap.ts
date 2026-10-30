import type { MetadataRoute } from 'next';
import { storeGet } from '@/lib/store-api';
import { pageHandles } from '@/lib/theme/sections';

export const dynamic = 'force-dynamic';

type Sitemap = { products: { slug: string; updatedAt: string }[]; collections: { slug: string; updatedAt: string }[] };

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
  const data = (await storeGet<Sitemap>('/sitemap')) ?? { products: [], collections: [] };
  return [
    { url: `${site}/`, changeFrequency: 'daily', priority: 1 },
    { url: `${site}/collections/all`, changeFrequency: 'daily' },
    ...data.collections.map((c) => ({ url: `${site}/collections/${c.slug}`, lastModified: c.updatedAt, changeFrequency: 'daily' as const })),
    ...data.products.map((p) => ({ url: `${site}/products/${p.slug}`, lastModified: p.updatedAt, changeFrequency: 'weekly' as const })),
    ...pageHandles()
      .filter((h) => !['share-cart', 'pushdaddy-faq-1'].includes(h))
      .map((h) => ({ url: `${site}/pages/${h}`, changeFrequency: 'monthly' as const })),
    { url: `${site}/blogs/news`, changeFrequency: 'monthly' },
  ];
}
