import type { PrismaClient } from '@co/db';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Auth } from '../auth/auth';
import { audit } from '../http/audit';
import { handle, HttpError, log, notFound } from '../http/errors';
import { requireStaff, type StaffSession } from '../http/require-staff';
import type { Storage } from '../storage/s3';
import { IMAGE_TYPES, isImageType, MAX_IMAGE_BYTES, sniffImageType } from './images';

const presignBody = z.object({
  contentType: z.string().refine(isImageType, 'Only JPEG, PNG, WebP or AVIF images'),
  size: z.number().int().positive().max(MAX_IMAGE_BYTES, 'Images must be 5 MB or smaller'),
});
const attachBody = z.object({
  key: z.string().regex(/^products\/[0-9a-f-]{36}\.(jpg|png|webp|avif)$/, 'Unknown upload'),
  altText: z.string().trim().max(200).optional(),
  variantId: z.string().min(1).nullish(),
});
const idParam = z.object({ id: z.string().min(1).max(64) });

export function uploadRouter({ auth, prisma, storage }: { auth: Auth; prisma: PrismaClient; storage: Storage | null }) {
  const r = Router();
  const write = requireStaff(auth, ['owner', 'manager']);
  const requireStorage = () => {
    if (!storage) throw new HttpError(503, 'File storage is not configured');
    return storage;
  };

  const presignLimit = rateLimit({
    windowMs: 60_000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (_req, res) => (res.locals.session as StaffSession).user.id,
    handler: (_req, res, _next, options) => {
      res.status(429).json({ error: 'Too many uploads. Try again shortly.', retryAfter: Math.ceil(options.windowMs / 1000) });
    },
  });

  // Step 1: the browser asks for a short-lived URL; the key is a fresh UUID, never the original filename.
  r.post(
    '/uploads/product-images',
    write,
    presignLimit,
    handle(async (req, res) => {
      const s = requireStorage();
      const { contentType, size } = presignBody.parse(req.body);
      const key = `products/${randomUUID()}.${IMAGE_TYPES[contentType as keyof typeof IMAGE_TYPES]}`;
      const { url, headers } = await s.presignPut(key, contentType, size);
      res.status(201).json({ key, uploadUrl: url, headers });
    }),
  );

  // Step 2: after the PUT, the server checks the stored bytes before the image is attached.
  r.post(
    '/products/:id/images',
    write,
    handle(async (req, res) => {
      const s = requireStorage();
      const { id } = idParam.parse(req.params);
      const { key, altText, variantId } = attachBody.parse(req.body);
      const product = await prisma.product.findUnique({ where: { id }, select: { id: true } });
      if (!product) throw notFound('Product');

      const stored = await s.head(key);
      if (!stored) throw new HttpError(400, 'Upload not found. Please upload the file again.');
      const realType = sniffImageType(await s.readStart(key, 16));
      if (!realType || stored.size > MAX_IMAGE_BYTES || IMAGE_TYPES[realType] !== key.split('.').pop()) {
        await s.delete(key).catch(() => undefined);
        log('warn', req, 'rejected upload', { key, size: stored.size, claimed: stored.contentType, detected: realType });
        throw new HttpError(400, 'That file is not a supported image.');
      }

      const image = await prisma.$transaction(async (tx) => {
        const last = await tx.productImage.aggregate({ where: { productId: id }, _max: { sortOrder: true } });
        const created = await tx.productImage.create({
          data: { productId: id, variantId: variantId ?? null, s3Key: key, altText: altText || null, sortOrder: (last._max.sortOrder ?? -1) + 1 },
        });
        await audit(tx, req, res, { action: 'product.image.add', entityType: 'Product', entityId: id, metadata: { imageId: created.id } });
        return created;
      });
      res.status(201).json({ image: { ...image, url: s.publicUrl(image.s3Key) } });
    }),
  );

  r.patch(
    '/images/:id',
    write,
    handle(async (req, res) => {
      const { id } = idParam.parse(req.params);
      const { altText } = z.object({ altText: z.string().trim().max(200) }).parse(req.body);
      const image = await prisma.productImage.update({ where: { id }, data: { altText: altText || null } });
      res.json({ image });
    }),
  );

  r.put(
    '/products/:id/images/order',
    write,
    handle(async (req, res) => {
      const { id } = idParam.parse(req.params);
      const { imageIds } = z.object({ imageIds: z.array(z.string().min(1)).max(100) }).parse(req.body);
      const owned = await prisma.productImage.findMany({ where: { productId: id }, select: { id: true } });
      const ownedIds = new Set(owned.map((i) => i.id));
      if (imageIds.length !== ownedIds.size || !imageIds.every((i) => ownedIds.has(i))) {
        throw new HttpError(400, 'The list must contain every image of this product exactly once');
      }
      await prisma.$transaction(imageIds.map((imageId, sortOrder) => prisma.productImage.update({ where: { id: imageId }, data: { sortOrder } })));
      res.status(204).end();
    }),
  );

  r.delete(
    '/images/:id',
    write,
    handle(async (req, res) => {
      const { id } = idParam.parse(req.params);
      const image = await prisma.$transaction(async (tx) => {
        const deleted = await tx.productImage.delete({ where: { id } });
        await audit(tx, req, res, { action: 'product.image.delete', entityType: 'Product', entityId: deleted.productId, metadata: { imageId: id } });
        return deleted;
      });
      await storage?.delete(image.s3Key).catch((err) => log('warn', req, 'could not delete stored image', { key: image.s3Key, error: String(err) }));
      res.status(204).end();
    }),
  );

  return r;
}
