import type { PrismaClient } from '@co/db';
import { normalizePkMobile } from '@co/shared';
import { timingSafeEqual } from 'node:crypto';
import { Router, type Request } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { handle, log } from '../http/errors';

const email = z.string().trim().toLowerCase().max(254).email('Enter a valid email address');
const contactBody = z.object({
  name: z.string().trim().max(120).optional(),
  email,
  phone: z
    .string()
    .trim()
    .max(30)
    .optional()
    .transform((v) => (v ? (normalizePkMobile(v) ?? v.replace(/[^\d+\-\s]/g, '')) : undefined)),
  message: z.string().trim().max(5000).optional(),
});
const newsletterBody = z.object({ email });

/** Storefront contact form and newsletter sign-up (the theme's forms post here via the web app). */
/** The shopper's IP: the web app's X-Shopper-IP only when it proves itself with the internal token. */
export function shopperIp(req: Request, internalToken: string | undefined): string {
  const sent = req.headers['x-internal-token'];
  const forwarded = req.headers['x-shopper-ip'];
  if (internalToken && typeof sent === 'string' && typeof forwarded === 'string') {
    const a = Buffer.from(sent);
    const b = Buffer.from(internalToken);
    if (a.length === b.length && timingSafeEqual(a, b)) return forwarded.slice(0, 64);
  }
  return (req.ip ?? 'unknown').slice(0, 64);
}

export function storeFormsRouter({ prisma, internalToken }: { prisma: PrismaClient; internalToken?: string }) {
  const r = Router();
  const limit = rateLimit({
    windowMs: 60_000,
    limit: 5,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => shopperIp(req, internalToken),
    handler: (_req, res) => {
      res.status(429).json({ error: 'Too many submissions. Please try again in a minute.' });
    },
  });
  const ip = (req: Request) => shopperIp(req, internalToken);

  r.post(
    '/contact',
    limit,
    handle(async (req, res) => {
      const data = contactBody.parse(req.body);
      await prisma.contactSubmission.create({ data: { kind: 'CONTACT', ...data, ipAddress: ip(req) } });
      log('info', req, 'contact message received');
      res.status(201).json({ ok: true });
    }),
  );

  r.post(
    '/newsletter',
    limit,
    handle(async (req, res) => {
      const { email: address } = newsletterBody.parse(req.body);
      const existing = await prisma.contactSubmission.findFirst({ where: { kind: 'NEWSLETTER', email: address } });
      if (!existing) await prisma.contactSubmission.create({ data: { kind: 'NEWSLETTER', email: address, ipAddress: ip(req) } });
      res.status(201).json({ ok: true });
    }),
  );

  return r;
}
