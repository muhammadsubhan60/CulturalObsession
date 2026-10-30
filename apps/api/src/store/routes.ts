import type { Prisma, PrismaClient } from '@co/db';
import { Router } from 'express';
import { z } from 'zod';
import { handle, notFound } from '../http/errors';
import type { Storage } from '../storage/s3';

/** Public, read-only catalogue for the storefront. Only ACTIVE products and active variants. */
export const COLLECTION_PAGE_SIZE = 20;
export const HOME_CARDS = 12;

export const SORTS = [
  'manual',
  'most-relevant',
  'best-selling',
  'title-ascending',
  'title-descending',
  'price-ascending',
  'price-descending',
  'created-ascending',
  'created-descending',
] as const;

const cardInclude = {
  images: { orderBy: { sortOrder: 'asc' }, take: 1 },
  variants: { where: { isActive: true }, orderBy: { pricePaisa: 'asc' }, take: 1 },
} satisfies Prisma.ProductInclude;

type CardRow = Prisma.ProductGetPayload<{ include: typeof cardInclude }>;

export function storeRouter({ prisma, storage }: { prisma: PrismaClient; storage: Storage | null }) {
  const r = Router();
  const url = (key: string) => storage?.publicUrl(key) ?? null;
  const image = (i: { s3Key: string; width: number | null; height: number | null; altText: string | null }) => ({
    url: url(i.s3Key),
    width: i.width,
    height: i.height,
    alt: i.altText,
  });
  const card = (p: CardRow) => {
    const v = p.variants[0];
    return {
      slug: p.slug,
      title: p.title,
      image: p.images[0] ? image(p.images[0]) : null,
      pricePaisa: v?.pricePaisa ?? null,
      compareAtPricePaisa: v?.compareAtPricePaisa ?? null,
      available: Boolean(v),
    };
  };

  type Filters = { available?: boolean; minPaisa?: number; maxPaisa?: number };

  /** Products of a collection in the requested order; 'all' means every active product. */
  async function collectionProducts(categoryId: string | null, sort: (typeof SORTS)[number], skip: number, take: number, f: Filters = {}) {
    const priced: Prisma.ProductVariantWhereInput = {
      isActive: true,
      ...(f.minPaisa !== undefined || f.maxPaisa !== undefined ? { pricePaisa: { gte: f.minPaisa, lte: f.maxPaisa } } : {}),
    };
    const where: Prisma.ProductWhereInput = {
      status: 'ACTIVE',
      ...(categoryId ? { categories: { some: { categoryId } } } : {}),
      ...(f.minPaisa !== undefined || f.maxPaisa !== undefined ? { variants: { some: priced } } : {}),
      ...(f.available === true ? { variants: { some: priced } } : f.available === false ? { variants: { none: { isActive: true } } } : {}),
    };
    const total = await prisma.product.count({ where });
    let rows: CardRow[];
    if (sort === 'price-ascending' || sort === 'price-descending') {
      // Sort by each product's cheapest active variant.
      const all = await prisma.product.findMany({ where, include: cardInclude });
      all.sort((a, b) => {
        const pa = a.variants[0]?.pricePaisa ?? Number.MAX_SAFE_INTEGER;
        const pb = b.variants[0]?.pricePaisa ?? Number.MAX_SAFE_INTEGER;
        return sort === 'price-ascending' ? pa - pb : pb - pa;
      });
      rows = all.slice(skip, skip + take);
    } else {
      const orderBy: Prisma.ProductOrderByWithRelationInput[] =
        sort === 'title-ascending'
          ? [{ title: 'asc' }]
          : sort === 'title-descending'
            ? [{ title: 'desc' }]
            : sort === 'created-ascending'
              ? [{ createdAt: 'asc' }]
              : sort === 'created-descending'
                ? [{ createdAt: 'desc' }]
                : [{ createdAt: 'asc' }];
      if ((sort === 'manual' || sort === 'most-relevant' || sort === 'best-selling') && categoryId) {
        const links = await prisma.productCategory.findMany({
          where: { categoryId, product: where },
          orderBy: [{ sortOrder: 'asc' }, { product: { createdAt: 'asc' } }],
          skip,
          take,
          include: { product: { include: cardInclude } },
        });
        rows = links.map((l) => l.product);
      } else {
        rows = await prisma.product.findMany({ where, orderBy, skip, take, include: cardInclude });
      }
    }
    return { total, products: rows.map(card) };
  }

  r.get(
    '/home',
    handle(async (_req, res) => {
      const setting = await prisma.storeSetting.findUnique({ where: { key: 'home.featuredCollections' } });
      const slugs = z.array(z.string()).catch([]).parse(setting?.value);
      const featured = [];
      for (const slug of slugs) {
        const category = await prisma.category.findUnique({ where: { slug } });
        if (!category?.isActive) continue;
        const { products } = await collectionProducts(category.id, 'manual', 0, HOME_CARDS);
        featured.push({ collection: { slug: category.slug, title: category.name }, products });
      }
      res.json({ featured });
    }),
  );

  r.get(
    '/collections/:slug',
    handle(async (req, res) => {
      const { slug } = z.object({ slug: z.string().min(1).max(120) }).parse(req.params);
      const q = z
        .object({
          sort: z.enum(SORTS).catch('best-selling'),
          page: z.coerce.number().int().min(1).max(1000).catch(1),
          // available=1 in stock, available=0 out of stock; both or neither = no filter
          available: z.union([z.enum(['0', '1']), z.array(z.enum(['0', '1']))]).optional().catch(undefined),
          minPrice: z.coerce.number().int().min(0).max(2_000_000_000).optional().catch(undefined),
          maxPrice: z.coerce.number().int().min(0).max(2_000_000_000).optional().catch(undefined),
        })
        .parse(req.query);
      const avail = q.available === undefined ? [] : ([] as string[]).concat(q.available);
      const filters: Filters = {
        available: avail.length === 1 ? avail[0] === '1' : undefined,
        minPaisa: q.minPrice,
        maxPaisa: q.maxPrice,
      };
      const category = slug === 'all' ? null : await prisma.category.findUnique({ where: { slug } });
      if (slug !== 'all' && !category?.isActive) throw notFound('Collection');
      const { total, products } = await collectionProducts(category?.id ?? null, q.sort, (q.page - 1) * COLLECTION_PAGE_SIZE, COLLECTION_PAGE_SIZE, filters);
      // Facet counts over the whole collection, like the theme's "In stock (40)".
      const inCollection: Prisma.ProductWhereInput = { status: 'ACTIVE', ...(category ? { categories: { some: { categoryId: category.id } } } : {}) };
      const [inStock, outOfStock, maxPrice] = await Promise.all([
        prisma.product.count({ where: { ...inCollection, variants: { some: { isActive: true } } } }),
        prisma.product.count({ where: { ...inCollection, variants: { none: { isActive: true } } } }),
        prisma.productVariant.aggregate({ where: { isActive: true, product: inCollection }, _max: { pricePaisa: true } }),
      ]);
      res.json({
        facets: { inStock, outOfStock, maxPricePaisa: maxPrice._max.pricePaisa ?? 0 },
        filters: { available: avail, minPrice: q.minPrice ?? null, maxPrice: q.maxPrice ?? null },
        collection: category
          ? { slug: category.slug, title: category.name, descriptionHtml: category.description ?? '', seoTitle: category.seoTitle, seoDescription: category.seoDescription }
          : { slug: 'all', title: 'Products', descriptionHtml: '', seoTitle: null, seoDescription: null },
        products,
        total,
        page: q.page,
        pageSize: COLLECTION_PAGE_SIZE,
        sort: q.sort,
      });
    }),
  );

  r.get(
    '/products/:slug',
    handle(async (req, res) => {
      const { slug } = z.object({ slug: z.string().min(1).max(120) }).parse(req.params);
      const p = await prisma.product.findUnique({
        where: { slug },
        include: {
          images: { orderBy: { sortOrder: 'asc' } },
          variants: { where: { isActive: true }, orderBy: { sortOrder: 'asc' }, include: { inventory: true } },
          categories: { orderBy: { sortOrder: 'asc' }, include: { category: { select: { id: true, slug: true, name: true } } } },
          templates: { where: { isActive: true }, include: { fields: { orderBy: { sortOrder: 'asc' } } } },
        },
      });
      if (!p || p.status !== 'ACTIVE') throw notFound('Product');

      const options: { name: string; values: string[] }[] = p.optionNames.map((name) => ({ name, values: [] }));
      for (const v of p.variants) {
        for (const [name, value] of Object.entries((v.optionValues ?? {}) as Record<string, string>)) {
          let opt = options.find((o) => o.name === name);
          if (!opt) options.push((opt = { name, values: [] }));
          if (!opt.values.includes(value)) opt.values.push(value);
        }
      }
      const firstCategory = p.categories[0]?.category;
      const recommendations = firstCategory
        ? (
            await prisma.product.findMany({
              where: { status: 'ACTIVE', id: { not: p.id }, categories: { some: { categoryId: firstCategory.id } } },
              take: 4,
              orderBy: { createdAt: 'asc' },
              include: cardInclude,
            })
          ).map(card)
        : [];

      res.json({
        product: {
          slug: p.slug,
          title: p.title,
          vendor: p.vendor,
          descriptionHtml: p.description,
          productType: p.productType,
          seoTitle: p.seoTitle,
          seoDescription: p.seoDescription,
          images: p.images.map((i) => ({ id: i.id, variantId: i.variantId, ...image(i) })),
          options,
          variants: p.variants.map((v) => ({
            id: v.id,
            title: v.title,
            options: (v.optionValues ?? {}) as Record<string, string>,
            pricePaisa: v.pricePaisa,
            compareAtPricePaisa: v.compareAtPricePaisa,
            available: !v.trackInventory || (v.inventory?.quantityOnHand ?? 0) - (v.inventory?.quantityReserved ?? 0) > 0,
          })),
          personalization: p.templates.flatMap((t) =>
            t.fields.map((f) => ({ key: f.key, label: f.label, fieldType: f.fieldType, required: f.required, config: f.config })),
          ),
          collection: firstCategory ? { slug: firstCategory.slug, title: firstCategory.name } : null,
        },
        recommendations,
      });
    }),
  );

  /** Public store settings the storefront needs (WhatsApp chat button). */
  r.get(
    '/settings',
    handle(async (_req, res) => {
      const row = await prisma.storeSetting.findUnique({ where: { key: 'whatsapp' } });
      const whatsapp = z
        .object({ number: z.string().regex(/^\d{10,15}$/), message: z.string().max(300).default('') })
        .nullable()
        .catch(null)
        .parse(row?.value ?? null);
      res.json({ whatsapp });
    }),
  );

  r.get(
    '/sitemap',
    handle(async (_req, res) => {
      const [products, collections] = await Promise.all([
        prisma.product.findMany({ where: { status: 'ACTIVE' }, select: { slug: true, updatedAt: true }, orderBy: { slug: 'asc' } }),
        prisma.category.findMany({ where: { isActive: true }, select: { slug: true, updatedAt: true }, orderBy: { sortOrder: 'asc' } }),
      ]);
      res.json({ products, collections });
    }),
  );

  r.get(
    '/search',
    handle(async (req, res) => {
      const { q } = z.object({ q: z.string().trim().max(100).default('') }).parse(req.query);
      if (!q) {
        res.json({ q, products: [] });
        return;
      }
      const rows = await prisma.product.findMany({
        where: { status: 'ACTIVE', OR: [{ title: { contains: q, mode: 'insensitive' } }, { categories: { some: { category: { name: { contains: q, mode: 'insensitive' } } } } }] },
        orderBy: { title: 'asc' },
        take: 48,
        include: cardInclude,
      });
      res.json({ q, products: rows.map(card) });
    }),
  );

  return r;
}
