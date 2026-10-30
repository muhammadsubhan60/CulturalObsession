import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeTestApp } from './helpers';

const { app, prisma } = makeTestApp();
const tag = randomUUID().slice(0, 8);
const slug = (s: string) => `t-${tag}-${s}`;
let categoryId = '';

async function product(name: string, price: number, opts: { status?: 'ACTIVE' | 'DRAFT'; sortOrder?: number; variants?: object[]; personal?: boolean } = {}) {
  return prisma.product.create({
    data: {
      title: `${name} ${tag}`,
      slug: slug(name),
      description: '<p>Nice</p>',
      status: opts.status ?? 'ACTIVE',
      productType: opts.personal ? 'PERSONALIZABLE' : 'READY_MADE',
      optionNames: opts.variants ? ['Color', 'Size'] : [],
      categories: { create: { categoryId, sortOrder: opts.sortOrder ?? 0 } },
      variants: {
        create: (opts.variants as never[]) ?? [{ sku: `T-${tag}-${name}`, title: 'Default', pricePaisa: price, trackInventory: false }],
      },
      ...(opts.personal
        ? { templates: { create: { name: 'P', fields: { create: { key: 'text-1', label: 'Customize Name', fieldType: 'text', required: true, config: { maxLength: 40 } } } } } }
        : {}),
    },
  });
}

beforeAll(async () => {
  categoryId = (await prisma.category.create({ data: { name: `Rings ${tag}`, slug: slug('rings') } })).id;
  await product('b-ring', 150_000, { sortOrder: 2 });
  await product('a-ring', 99_900, { sortOrder: 1, personal: true });
  await product('hidden', 10_000, { status: 'DRAFT', sortOrder: 0 });
  await product('multi', 120_000, {
    sortOrder: 3,
    variants: [
      { sku: `T-${tag}-G`, title: 'Gold / 6', optionValues: { Color: 'Gold', Size: '6' }, pricePaisa: 120_000, compareAtPricePaisa: 199_900, trackInventory: false },
      { sku: `T-${tag}-S`, title: 'Silver / 7', optionValues: { Color: 'Silver', Size: '7' }, pricePaisa: 110_000, trackInventory: false },
    ],
  });
  await prisma.storeSetting.upsert({ where: { key: 'home.featuredCollections' }, create: { key: 'home.featuredCollections', value: [slug('rings')] }, update: { value: [slug('rings')] } });
});

afterAll(async () => {
  await prisma.product.deleteMany({ where: { slug: { startsWith: `t-${tag}` } } });
  await prisma.category.deleteMany({ where: { slug: { startsWith: `t-${tag}` } } });
  await prisma.storeSetting.deleteMany({ where: { key: 'home.featuredCollections' } });
});

describe('storefront API', () => {
  it('lists a collection in manual order and hides drafts', async () => {
    const res = await request(app).get(`/api/store/collections/${slug('rings')}`);
    expect(res.status).toBe(200);
    expect(res.body.products.map((p: { slug: string }) => p.slug)).toEqual([slug('a-ring'), slug('b-ring'), slug('multi')]);
    expect(res.body.total).toBe(3);
  });

  it('sorts by the cheapest active variant', async () => {
    const res = await request(app).get(`/api/store/collections/${slug('rings')}?sort=price-descending`);
    expect(res.body.products.map((p: { pricePaisa: number }) => p.pricePaisa)).toEqual([150_000, 110_000, 99_900]);
  });

  it('falls back to the theme default (best selling) for unknown sort values', async () => {
    const res = await request(app).get(`/api/store/collections/${slug('rings')}?sort=evil`);
    expect(res.body.sort).toBe('best-selling');
  });

  it('returns product options, variants and personalization; drafts are 404', async () => {
    const res = await request(app).get(`/api/store/products/${slug('multi')}`);
    expect(res.body.product.options).toEqual([
      { name: 'Color', values: ['Gold', 'Silver'] },
      { name: 'Size', values: ['6', '7'] },
    ]);
    expect(res.body.product.variants[0]).toMatchObject({ pricePaisa: 120_000, compareAtPricePaisa: 199_900, available: true });
    const personal = await request(app).get(`/api/store/products/${slug('a-ring')}`);
    expect(personal.body.product.personalization).toEqual([
      { key: 'text-1', label: 'Customize Name', fieldType: 'text', required: true, config: { maxLength: 40 } },
    ]);
    expect(personal.body.recommendations.length).toBeGreaterThan(0);
    expect((await request(app).get(`/api/store/products/${slug('hidden')}`)).status).toBe(404);
  });

  it('features configured collections on the home page', async () => {
    const res = await request(app).get('/api/store/home');
    expect(res.body.featured[0].collection.slug).toBe(slug('rings'));
    expect(res.body.featured[0].products).toHaveLength(3);
  });

  it('searches active products by title', async () => {
    const res = await request(app).get(`/api/store/search?q=${encodeURIComponent(`ring ${tag}`)}`);
    expect(res.body.products.map((p: { slug: string }) => p.slug).sort()).toEqual([slug('a-ring'), slug('b-ring')]);
  });
});

describe('collection filters', () => {
  it('filters by price range in paisa and reports facet counts', async () => {
    const res = await request(app).get(`/api/store/collections/${slug('rings')}?minPrice=100000&maxPrice=130000`);
    expect(res.body.products.map((p: { slug: string }) => p.slug)).toEqual([slug('multi')]);
    expect(res.body.facets).toEqual({ inStock: 3, outOfStock: 0, maxPricePaisa: 150_000 });
  });

  it('filters by availability and ignores malformed values', async () => {
    const out = await request(app).get(`/api/store/collections/${slug('rings')}?available=0`);
    expect(out.body.products).toHaveLength(0);
    const both = await request(app).get(`/api/store/collections/${slug('rings')}?available=0&available=1`);
    expect(both.body.products).toHaveLength(3);
    const junk = await request(app).get(`/api/store/collections/${slug('rings')}?available=yes&minPrice=-5`);
    expect(junk.status).toBe(200);
    expect(junk.body.products).toHaveLength(3);
  });
});

describe('sitemap', () => {
  it('lists active products and collections only', async () => {
    const res = await request(app).get('/api/store/sitemap');
    const slugs = res.body.products.map((p: { slug: string }) => p.slug);
    expect(slugs).toContain(slug('a-ring'));
    expect(slugs).not.toContain(slug('hidden'));
    expect(res.body.collections.map((c: { slug: string }) => c.slug)).toContain(slug('rings'));
  });
});

describe('store settings', () => {
  it('exposes a valid WhatsApp number and hides a malformed one', async () => {
    const before = await prisma.storeSetting.findUnique({ where: { key: 'whatsapp' } });
    try {
      await prisma.storeSetting.upsert({ where: { key: 'whatsapp' }, create: { key: 'whatsapp', value: { number: '923001234567', message: 'Hi' } }, update: { value: { number: '923001234567', message: 'Hi' } } });
      expect((await request(app).get('/api/store/settings')).body.whatsapp).toEqual({ number: '923001234567', message: 'Hi' });
      await prisma.storeSetting.update({ where: { key: 'whatsapp' }, data: { value: { number: 'javascript:alert(1)' } } });
      expect((await request(app).get('/api/store/settings')).body.whatsapp).toBeNull();
    } finally {
      if (before) await prisma.storeSetting.update({ where: { key: 'whatsapp' }, data: { value: before.value as object } });
      else await prisma.storeSetting.deleteMany({ where: { key: 'whatsapp' } });
    }
  });
});
