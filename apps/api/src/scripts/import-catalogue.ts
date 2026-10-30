/**
 * Imports data/catalogue.json (built by scripts/catalogue/extract.py from the storefront mirror)
 * into the database and uploads its images to media storage.
 *
 *   MIRROR_ASSETS=/path/to/customizedjewellers-mirror/site/assets \
 *     pnpm --filter @co/api import:catalogue [path/to/catalogue.json]
 *
 * Idempotent: collections are upserted by slug; products that already exist (by slug) are skipped.
 * Stock is unknown in the mirror, so every variant starts as made-to-order (trackInventory=false).
 */
import { getPrisma } from '@co/db';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { sanitizeRichText } from '../catalog/rich-text';
import { loadEnv } from '../env';
import { createS3Storage } from '../storage/s3';
import { IMAGE_TYPES, sniffImageType } from '../uploads/images';

type CatalogueImage = { mediaId: number; file: string; width: number | null; height: number | null; alt: string | null };
type CatalogueVariant = {
  title: string;
  options: Record<string, string>;
  pricePaisa: number;
  compareAtPricePaisa: number | null;
  available: boolean;
  weightGrams: number | null;
  featuredMediaId: number | null;
};
type CatalogueProduct = {
  handle: string;
  title: string;
  descriptionHtml: string;
  variants: CatalogueVariant[];
  images: CatalogueImage[];
  personalization: { key: string; label: string; required: boolean; fieldType: string }[];
};
type Catalogue = {
  collections: { handle: string; title: string; descriptionHtml: string; products: string[]; sortOrder: number }[];
  products: CatalogueProduct[];
  homeFeatured: Record<string, string[]>;
};

const repoRoot = path.resolve(import.meta.dirname, '../../../..');
const cataloguePath = path.resolve(process.argv[2] ?? path.join(repoRoot, 'data/catalogue.json'));
const assetsRoot = process.env.MIRROR_ASSETS;
if (!assetsRoot) {
  console.error('Set MIRROR_ASSETS to the mirror site/assets directory');
  process.exit(1);
}

const env = loadEnv();
const storage = createS3Storage(env);
if (!storage) {
  console.error('Media storage is not configured (S3_BUCKET / MEDIA_PUBLIC_URL)');
  process.exit(1);
}
const prisma = getPrisma();
const catalogue = JSON.parse(await readFile(cataloguePath, 'utf8')) as Catalogue;

async function uploadImage(file: string): Promise<string | null> {
  const bytes = new Uint8Array(await readFile(path.join(assetsRoot!, file)));
  const type = sniffImageType(bytes);
  if (!type) {
    console.warn(`  skip ${file}: not a supported image`);
    return null;
  }
  const key = `products/${randomUUID()}.${IMAGE_TYPES[type]}`;
  await storage!.put(key, bytes, type);
  return key;
}

let created = 0;
let skipped = 0;
try {
  const categoryIds = new Map<string, string>();
  for (const c of catalogue.collections) {
    const data = { name: c.title, description: sanitizeRichText(c.descriptionHtml) || null, sortOrder: c.sortOrder, isActive: true };
    const category = await prisma.category.upsert({ where: { slug: c.handle }, create: { slug: c.handle, ...data }, update: data });
    categoryIds.set(c.handle, category.id);
  }
  console.log(`collections: ${categoryIds.size}`);

  for (const [index, p] of catalogue.products.entries()) {
    if (await prisma.product.findUnique({ where: { slug: p.handle }, select: { id: true } })) {
      skipped++;
      continue;
    }
    const keys = new Map<number, string>();
    for (const img of p.images) {
      const key = await uploadImage(img.file);
      if (key) keys.set(img.mediaId, key);
    }
    const sku = (n: number) => `CO-${String(index + 1).padStart(4, '0')}-${n}`;
    const memberships = catalogue.collections
      .filter((c) => c.products.includes(p.handle))
      .map((c) => ({ categoryId: categoryIds.get(c.handle)!, sortOrder: c.products.indexOf(p.handle) }));

    await prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          title: p.title,
          slug: p.handle,
          description: sanitizeRichText(p.descriptionHtml),
          vendor: 'Cultural Obsession',
          status: 'ACTIVE',
          productType: p.personalization.length ? 'PERSONALIZABLE' : 'READY_MADE',
          categories: { create: memberships },
        },
      });
      const variantByMedia = new Map<number, string>();
      for (const [n, v] of p.variants.entries()) {
        const variant = await tx.productVariant.create({
          data: {
            productId: product.id,
            sku: sku(n + 1),
            title: v.title,
            optionValues: v.options,
            pricePaisa: v.pricePaisa,
            compareAtPricePaisa: v.compareAtPricePaisa,
            weightGrams: v.weightGrams,
            trackInventory: false,
            isActive: v.available,
            sortOrder: n,
          },
        });
        if (v.featuredMediaId && !variantByMedia.has(v.featuredMediaId)) variantByMedia.set(v.featuredMediaId, variant.id);
      }
      for (const [n, img] of p.images.entries()) {
        const key = keys.get(img.mediaId);
        if (!key) continue;
        await tx.productImage.create({
          data: {
            productId: product.id,
            variantId: variantByMedia.get(img.mediaId) ?? null,
            s3Key: key,
            width: img.width,
            height: img.height,
            altText: img.alt,
            sortOrder: n,
          },
        });
      }
      if (p.personalization.length) {
        await tx.customizationTemplate.create({
          data: {
            productId: product.id,
            name: 'Personalization',
            config: { source: 'globo-product-options' },
            fields: {
              create: p.personalization.map((f, i) => ({
                key: f.key,
                label: f.label,
                fieldType: f.fieldType === 'text' ? 'text' : f.fieldType,
                required: f.required,
                config: { maxLength: 40 },
                sortOrder: i,
              })),
            },
          },
        });
      }
    });
    created++;
    if (created % 10 === 0) console.log(`products: ${created} created…`);
  }

  await prisma.storeSetting.upsert({
    where: { key: 'home.featuredCollections' },
    create: { key: 'home.featuredCollections', value: Object.keys(catalogue.homeFeatured) },
    update: {},
  });
  console.log(`done: ${created} products created, ${skipped} already existed`);
} finally {
  await prisma.$disconnect();
}
