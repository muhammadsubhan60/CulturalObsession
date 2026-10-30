import type { Prisma, PrismaClient } from '@co/db';
import {
  categoryInput,
  inventoryAdjustInput,
  productInput,
  productListQuery,
  variantFields,
  variantInput,
} from '@co/shared';
import { Router } from 'express';
import { z } from 'zod';
import type { Auth } from '../auth/auth';
import { audit } from '../http/audit';
import { sanitizeRichText } from './rich-text';
import { handle, HttpError, notFound } from '../http/errors';
import { requireStaff } from '../http/require-staff';
import type { Storage } from '../storage/s3';

const idParam = z.object({ id: z.string().min(1).max(64) });
const variantPatch = variantFields.partial();

const productDetail = {
  categories: { select: { categoryId: true } },
  variants: { orderBy: { sortOrder: 'asc' }, include: { inventory: true } },
  images: { orderBy: { sortOrder: 'asc' } },
} satisfies Prisma.ProductInclude;

/** Catalogue management. Every staff role can read; only owners and managers can change it. */
export function catalogRouter({ auth, prisma, storage }: { auth: Auth; prisma: PrismaClient; storage: Storage | null }) {
  const r = Router();
  const withUrls = <T extends { images: { s3Key: string }[] }>(p: T) => ({
    ...p,
    images: p.images.map((i) => ({ ...i, url: storage?.publicUrl(i.s3Key) ?? null })),
  });
  const read = requireStaff(auth);
  const write = requireStaff(auth, ['owner', 'manager']);

  // ─── Collections ───
  r.get(
    '/categories',
    read,
    handle(async (_req, res) => {
      const items = await prisma.category.findMany({
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        include: { _count: { select: { products: true } } },
      });
      res.json({ items });
    }),
  );

  r.post(
    '/categories',
    write,
    handle(async (req, res) => {
      const data = categoryInput.parse(req.body);
      if (data.description) data.description = sanitizeRichText(data.description);
      const category = await prisma.$transaction(async (tx) => {
        const created = await tx.category.create({ data });
        await audit(tx, req, res, { action: 'category.create', entityType: 'Category', entityId: created.id });
        return created;
      });
      res.status(201).json({ category });
    }),
  );

  r.patch(
    '/categories/:id',
    write,
    handle(async (req, res) => {
      const { id } = idParam.parse(req.params);
      const data = categoryInput.partial().parse(req.body);
      if (data.description) data.description = sanitizeRichText(data.description);
      if (data.parentId === id) throw new HttpError(400, 'A collection cannot be its own parent');
      const category = await prisma.$transaction(async (tx) => {
        const updated = await tx.category.update({ where: { id }, data });
        await audit(tx, req, res, { action: 'category.update', entityType: 'Category', entityId: id, metadata: { fields: Object.keys(data) } });
        return updated;
      });
      res.json({ category });
    }),
  );

  r.delete(
    '/categories/:id',
    write,
    handle(async (req, res) => {
      const { id } = idParam.parse(req.params);
      await prisma.$transaction(async (tx) => {
        await tx.category.delete({ where: { id } });
        await audit(tx, req, res, { action: 'category.delete', entityType: 'Category', entityId: id });
      });
      res.status(204).end();
    }),
  );

  // ─── Products ───
  r.get(
    '/products',
    read,
    handle(async (req, res) => {
      const q = productListQuery.parse(req.query);
      const where: Prisma.ProductWhereInput = {
        ...(q.status ? { status: q.status } : { status: { not: 'ARCHIVED' } }),
        ...(q.categoryId ? { categories: { some: { categoryId: q.categoryId } } } : {}),
        ...(q.q
          ? {
              OR: [
                { title: { contains: q.q, mode: 'insensitive' } },
                { slug: { contains: q.q.toLowerCase() } },
                { variants: { some: { sku: { contains: q.q, mode: 'insensitive' } } } },
              ],
            }
          : {}),
      };
      const [total, products] = await prisma.$transaction([
        prisma.product.count({ where }),
        prisma.product.findMany({
          where,
          orderBy: { updatedAt: 'desc' },
          skip: (q.page - 1) * q.pageSize,
          take: q.pageSize,
          include: {
            images: { orderBy: { sortOrder: 'asc' }, take: 1 },
            variants: { where: { isActive: true }, select: { pricePaisa: true, trackInventory: true, inventory: true } },
          },
        }),
      ]);
      const items = products.map(({ variants, images, ...p }) => ({
        ...p,
        image: images[0] ? { ...images[0], url: storage?.publicUrl(images[0].s3Key) ?? null } : null,
        variantCount: variants.length,
        minPricePaisa: variants.length ? Math.min(...variants.map((v) => v.pricePaisa)) : null,
        // null = made to order (no tracked variants)
        stockOnHand: variants.some((v) => v.trackInventory)
          ? variants.reduce((sum, v) => sum + (v.trackInventory ? (v.inventory?.quantityOnHand ?? 0) : 0), 0)
          : null,
      }));
      res.json({ items, total, page: q.page, pageSize: q.pageSize });
    }),
  );

  r.post(
    '/products',
    write,
    handle(async (req, res) => {
      const { categoryIds, ...data } = productInput.parse(req.body);
      data.description = sanitizeRichText(data.description);
      const product = await prisma.$transaction(async (tx) => {
        const created = await tx.product.create({
          data: { ...data, categories: { create: categoryIds.map((categoryId) => ({ categoryId })) } },
          include: productDetail,
        });
        await audit(tx, req, res, { action: 'product.create', entityType: 'Product', entityId: created.id });
        return created;
      });
      res.status(201).json({ product: withUrls(product) });
    }),
  );

  r.get(
    '/products/:id',
    read,
    handle(async (req, res) => {
      const { id } = idParam.parse(req.params);
      const product = await prisma.product.findUnique({ where: { id }, include: productDetail });
      if (!product) throw notFound('Product');
      res.json({ product: withUrls(product) });
    }),
  );

  r.patch(
    '/products/:id',
    write,
    handle(async (req, res) => {
      const { id } = idParam.parse(req.params);
      const { categoryIds, ...data } = productInput.partial().parse(req.body);
      if (data.description !== undefined) data.description = sanitizeRichText(data.description);
      const product = await prisma.$transaction(async (tx) => {
        if (categoryIds) {
          await tx.productCategory.deleteMany({ where: { productId: id } });
          await tx.productCategory.createMany({ data: categoryIds.map((categoryId) => ({ productId: id, categoryId })) });
        }
        const updated = await tx.product.update({ where: { id }, data, include: productDetail });
        await audit(tx, req, res, {
          action: 'product.update',
          entityType: 'Product',
          entityId: id,
          metadata: { fields: [...Object.keys(data), ...(categoryIds ? ['categoryIds'] : [])] },
        });
        return updated;
      });
      res.json({ product: withUrls(product) });
    }),
  );

  // Products are archived, never deleted: past orders keep pointing at their variants.
  r.delete(
    '/products/:id',
    write,
    handle(async (req, res) => {
      const { id } = idParam.parse(req.params);
      const product = await prisma.$transaction(async (tx) => {
        const archived = await tx.product.update({ where: { id }, data: { status: 'ARCHIVED' } });
        await audit(tx, req, res, { action: 'product.archive', entityType: 'Product', entityId: id });
        return archived;
      });
      res.json({ product });
    }),
  );

  // ─── Variants ───
  r.post(
    '/products/:id/variants',
    write,
    handle(async (req, res) => {
      const { id } = idParam.parse(req.params);
      const data = variantInput.parse(req.body);
      const variant = await prisma.$transaction(async (tx) => {
        const created = await tx.productVariant.create({
          data: { ...data, productId: id, ...(data.trackInventory ? { inventory: { create: {} } } : {}) },
          include: { inventory: true },
        });
        await audit(tx, req, res, { action: 'variant.create', entityType: 'ProductVariant', entityId: created.id, metadata: { productId: id } });
        return created;
      });
      res.status(201).json({ variant });
    }),
  );

  r.patch(
    '/variants/:id',
    write,
    handle(async (req, res) => {
      const { id } = idParam.parse(req.params);
      const data = variantPatch.parse(req.body);
      const variant = await prisma.$transaction(async (tx) => {
        const current = await tx.productVariant.findUnique({ where: { id } });
        if (!current) throw notFound('Variant');
        const price = data.pricePaisa ?? current.pricePaisa;
        const compareAt = data.compareAtPricePaisa === undefined ? current.compareAtPricePaisa : data.compareAtPricePaisa;
        if (compareAt != null && compareAt <= price) {
          throw new HttpError(400, 'Invalid input', [{ path: 'compareAtPricePaisa', message: 'Compare-at price must be higher than the price' }]);
        }
        const updated = await tx.productVariant.update({
          where: { id },
          data: { ...data, ...(data.trackInventory ? { inventory: { connectOrCreate: { where: { variantId: id }, create: {} } } } : {}) },
          include: { inventory: true },
        });
        await audit(tx, req, res, { action: 'variant.update', entityType: 'ProductVariant', entityId: id, metadata: { fields: Object.keys(data) } });
        return updated;
      });
      res.json({ variant });
    }),
  );

  // ─── Inventory ───
  r.get(
    '/inventory',
    read,
    handle(async (req, res) => {
      const { q, lowOnly } = z
        .object({ q: z.string().trim().max(100).optional(), lowOnly: z.enum(['true', 'false']).optional() })
        .parse(req.query);
      const variants = await prisma.productVariant.findMany({
        where: {
          trackInventory: true,
          product: { status: { not: 'ARCHIVED' } },
          ...(q
            ? { OR: [{ sku: { contains: q, mode: 'insensitive' } }, { product: { title: { contains: q, mode: 'insensitive' } } }] }
            : {}),
        },
        orderBy: [{ product: { title: 'asc' } }, { sortOrder: 'asc' }],
        take: 500,
        include: { inventory: true, product: { select: { id: true, title: true } } },
      });
      const items = variants
        .map((v) => {
          const onHand = v.inventory?.quantityOnHand ?? 0;
          const reserved = v.inventory?.quantityReserved ?? 0;
          const threshold = v.inventory?.lowStockThreshold ?? 3;
          return {
            variantId: v.id,
            sku: v.sku,
            variantTitle: v.title,
            product: v.product,
            onHand,
            reserved,
            available: onHand - reserved,
            lowStockThreshold: threshold,
            low: onHand - reserved <= threshold,
          };
        })
        .filter((i) => lowOnly !== 'true' || i.low);
      res.json({ items });
    }),
  );

  r.post(
    '/variants/:id/inventory',
    write,
    handle(async (req, res) => {
      const { id } = idParam.parse(req.params);
      const input = inventoryAdjustInput.parse(req.body);
      const inventory = await prisma.$transaction(async (tx) => {
        const variant = await tx.productVariant.findUnique({ where: { id }, select: { trackInventory: true } });
        if (!variant) throw notFound('Variant');
        if (!variant.trackInventory) throw new HttpError(400, 'This variant is made to order and has no stock count');
        await tx.inventory.upsert({ where: { variantId: id }, create: { variantId: id }, update: {} });
        // Atomic increment; the CHECK constraint rejects stock below zero or below what is reserved.
        const updated = await tx.inventory.update({
          where: { variantId: id },
          data: {
            quantityOnHand: { increment: input.delta },
            ...(input.lowStockThreshold !== undefined ? { lowStockThreshold: input.lowStockThreshold } : {}),
          },
        });
        const session = res.locals.session as { user: { id: string } };
        await tx.inventoryMovement.create({
          data: { variantId: id, quantityDelta: input.delta, reason: input.reason, note: input.note ?? null, actorUserId: session.user.id },
        });
        await audit(tx, req, res, { action: 'inventory.adjust', entityType: 'ProductVariant', entityId: id, metadata: { delta: input.delta, reason: input.reason } });
        return updated;
      });
      res.json({ inventory });
    }),
  );

  r.get(
    '/variants/:id/movements',
    read,
    handle(async (req, res) => {
      const { id } = idParam.parse(req.params);
      const items = await prisma.inventoryMovement.findMany({ where: { variantId: id }, orderBy: { createdAt: 'desc' }, take: 100 });
      res.json({ items });
    }),
  );

  return r;
}
