import type { Prisma, PrismaClient } from '@co/db';
import { checkoutInput, quoteInput, trackInput } from '@co/shared';
import { Router, type Request } from 'express';
import { rateLimit } from 'express-rate-limit';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { handle, HttpError, log, notFound } from '../http/errors';
import type { Storage } from '../storage/s3';
import { shopperIp } from '../store/forms';
import { quoteCart, type Quote } from './quote';

type Deps = { prisma: PrismaClient; storage: Storage | null; internalToken?: string };

class OutOfStock extends Error {}

function limiter(windowMs: number, limit: number, internalToken: string | undefined, message: string) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req: Request) => shopperIp(req, internalToken),
    handler: (_req, res) => {
      res.status(429).json({ error: message });
    },
  });
}

const sameSecret = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

const publicQuote = (q: Quote) => ({
  lines: q.lines.map(({ productId: _p, trackInventory: _t, ...l }) => l),
  subtotalPaisa: q.subtotalPaisa,
  shippingPaisa: q.shippingPaisa,
  totalPaisa: q.totalPaisa,
  advanceRequiredPaisa: q.advanceRequiredPaisa,
  codAmountPaisa: q.codAmountPaisa,
  ok: q.ok,
});

const orderView = {
  items: { include: { customization: true } },
  payments: { include: { paymentAccount: true } },
  shipments: { include: { courier: true } },
  statusHistory: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.OrderInclude;

type OrderRow = Prisma.OrderGetPayload<{ include: typeof orderView }>;

/** What a customer may see about their own order. No internal notes, no staff ids. */
function customerOrder(o: OrderRow) {
  const address = o.shippingAddress as { city?: string; area?: string; addressLine?: string; postalCode?: string };
  return {
    orderNumber: o.orderNumber,
    accessKey: o.accessKey,
    status: o.status,
    createdAt: o.createdAt,
    paymentMethod: o.paymentMethod,
    subtotalPaisa: o.subtotalPaisa,
    shippingPaisa: o.shippingPaisa,
    discountPaisa: o.discountPaisa,
    totalPaisa: o.totalPaisa,
    advanceRequiredPaisa: o.advanceRequiredPaisa,
    codAmountPaisa: o.codAmountPaisa,
    recipientName: o.recipientName,
    recipientPhone: o.recipientPhone,
    address,
    items: o.items.map((i) => ({
      title: i.productTitleSnapshot,
      variantTitle: i.variantTitleSnapshot,
      quantity: i.quantity,
      unitPricePaisa: i.unitPricePaisa,
      lineTotalPaisa: i.lineTotalPaisa,
      customization: i.customization.map((c) => ({ label: c.labelSnapshot, value: String(c.value) })),
    })),
    payments: o.payments
      .filter((p) => p.purpose !== 'REFUND')
      .map((p) => ({
        method: p.method,
        purpose: p.purpose,
        status: p.status,
        amountPaisa: p.amountPaisa,
        account: p.paymentAccount
          ? {
              label: p.paymentAccount.label,
              accountTitle: p.paymentAccount.accountTitle,
              accountNumber: p.paymentAccount.accountNumber,
              iban: p.paymentAccount.iban,
              bankName: p.paymentAccount.bankName,
              instructions: p.paymentAccount.instructions,
            }
          : null,
        hasReference: Boolean(p.providerReference),
      })),
    shipments: o.shipments.map((s) => ({ courier: s.courier.name, trackingNumber: s.trackingNumber, trackingUrl: s.trackingUrl, status: s.status })),
    history: o.statusHistory.map((h) => ({ status: h.toStatus, at: h.createdAt })),
  };
}

export function checkoutRouter({ prisma, storage, internalToken }: Deps) {
  const r = Router();

  r.post(
    '/cart/quote',
    limiter(60_000, 120, internalToken, 'Too many requests. Please slow down.'),
    handle(async (req, res) => {
      const { lines } = quoteInput.parse(req.body);
      res.json(publicQuote(await quoteCart(prisma, lines, storage)));
    }),
  );

  r.get(
    '/payment-accounts',
    handle(async (_req, res) => {
      const accounts = await prisma.paymentAccount.findMany({
        where: { isActive: true, method: { not: 'COD' } },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, method: true, label: true, accountTitle: true, accountNumber: true, iban: true, bankName: true, instructions: true },
      });
      res.json({ accounts });
    }),
  );

  r.post(
    '/orders',
    limiter(10 * 60_000, 10, internalToken, 'Too many orders from this connection. Please try again later or order on WhatsApp.'),
    handle(async (req, res) => {
      const input = checkoutInput.parse(req.body);

      const existing = await prisma.order.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: orderView });
      if (existing) {
        res.status(200).json({ order: customerOrder(existing), replayed: true });
        return;
      }

      try {
        const order = await prisma.$transaction(
          async (tx) => {
            const quote = await quoteCart(tx, input.lines, storage);
            if (!quote.ok) {
              throw new HttpError(409, 'Some items in your cart changed', quote.lines.filter((l) => l.problem).map((l) => ({ path: `lines.${l.index}`, message: l.problemDetail ?? l.problem! })));
            }

            // Advance payment: required amount comes from the rules, never from the request.
            let paymentAccountId: string | null = null;
            if (quote.advanceRequiredPaisa > 0) {
              if (input.payment.method === 'COD') throw new HttpError(400, 'Invalid input', [{ path: 'payment.method', message: 'This order needs an advance payment' }]);
              const account = input.payment.accountId
                ? await tx.paymentAccount.findFirst({ where: { id: input.payment.accountId, method: input.payment.method, isActive: true } })
                : null;
              if (!account) throw new HttpError(400, 'Invalid input', [{ path: 'payment.accountId', message: 'Choose where you will send the advance' }]);
              paymentAccountId = account.id;
            } else if (input.payment.method !== 'COD') {
              throw new HttpError(400, 'Invalid input', [{ path: 'payment.method', message: 'This order is cash on delivery' }]);
            }

            // Reserve stock atomically; the CHECK constraint also guards reserved <= on hand.
            for (const line of quote.lines.filter((l) => l.trackInventory)) {
              const updated = await tx.$executeRaw`
                UPDATE "Inventory" SET "quantityReserved" = "quantityReserved" + ${line.quantity}, "updatedAt" = now()
                WHERE "variantId" = ${line.variantId} AND "quantityOnHand" - "quantityReserved" >= ${line.quantity}`;
              if (updated !== 1) throw new OutOfStock(line.productTitle);
            }

            const customer = await tx.customer.upsert({
              where: { phone: input.customer.phone },
              create: { name: input.customer.name, phone: input.customer.phone, email: input.customer.email ?? null },
              update: { name: input.customer.name, ...(input.customer.email ? { email: input.customer.email } : {}) },
            });
            await tx.address.create({
              data: { customerId: customer.id, recipientName: input.customer.name, phone: input.customer.phone, ...input.address },
            });

            const [seq] = await tx.$queryRaw<{ n: bigint }[]>`SELECT nextval('order_number_seq') AS n`;
            const n = seq!.n;
            const status = quote.advanceRequiredPaisa > 0 ? 'CONFIRMATION_REQUIRED' : 'PENDING';
            const created = await tx.order.create({
              data: {
                orderNumber: `CO-${n}`,
                idempotencyKey: input.idempotencyKey,
                customerId: customer.id,
                source: 'WEBSITE',
                status,
                paymentMethod: input.payment.method,
                subtotalPaisa: quote.subtotalPaisa,
                shippingPaisa: quote.shippingPaisa,
                totalPaisa: quote.totalPaisa,
                advanceRequiredPaisa: quote.advanceRequiredPaisa,
                advanceRuleSnapshot: quote.advanceRequiredPaisa > 0 ? (quote.advance.lines as object) : undefined,
                codAmountPaisa: quote.codAmountPaisa,
                recipientName: input.customer.name,
                recipientPhone: input.customer.phone,
                shippingAddress: input.address,
                customerNote: input.note ?? null,
                ...input.attribution,
                items: {
                  create: quote.lines.map((l) => ({
                    variantId: l.variantId,
                    productTitleSnapshot: l.productTitle,
                    variantTitleSnapshot: l.variantTitle,
                    skuSnapshot: l.sku,
                    productTypeSnapshot: l.productType,
                    unitPricePaisa: l.unitPricePaisa,
                    customizationPaisa: l.customizationPaisa,
                    quantity: l.quantity,
                    lineTotalPaisa: l.lineTotalPaisa,
                    inventoryReserved: l.trackInventory,
                    customization: {
                      create: l.customization.map((c) => ({ fieldKey: c.key, labelSnapshot: c.label, value: c.value, extraPricePaisa: c.extraPricePaisa })),
                    },
                  })),
                },
                payments: {
                  create: [
                    ...(quote.advanceRequiredPaisa > 0
                      ? [
                          {
                            method: input.payment.method,
                            purpose: 'ADVANCE' as const,
                            status: input.payment.reference ? ('AWAITING_VERIFICATION' as const) : ('PENDING' as const),
                            amountPaisa: quote.advanceRequiredPaisa,
                            paymentAccountId,
                            providerReference: input.payment.reference ?? null,
                          },
                        ]
                      : []),
                    ...(quote.codAmountPaisa > 0
                      ? [{ method: 'COD' as const, purpose: quote.advanceRequiredPaisa > 0 ? ('BALANCE' as const) : ('FULL' as const), status: 'PENDING' as const, amountPaisa: quote.codAmountPaisa }]
                      : []),
                  ],
                },
                statusHistory: { create: { toStatus: status, note: 'Order placed on the website' } },
              },
              include: orderView,
            });

            for (const l of quote.lines.filter((x) => x.trackInventory)) {
              await tx.inventoryMovement.create({
                data: { variantId: l.variantId, quantityDelta: l.quantity, reason: 'ORDER_RESERVED', referenceType: 'Order', referenceId: created.id },
              });
            }
            return created;
          },
          { isolationLevel: 'ReadCommitted', timeout: 15_000 },
        );
        log('info', req, 'order placed', { orderNumber: order.orderNumber, totalPaisa: order.totalPaisa });
        res.status(201).json({ order: customerOrder(order), replayed: false });
      } catch (err) {
        if (err instanceof OutOfStock) throw new HttpError(409, `${err.message} just sold out`);
        // Two submits with the same key raced: return the order the other one created.
        if ((err as { code?: string }).code === 'P2002') {
          const winner = await prisma.order.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: orderView });
          if (winner) {
            res.status(200).json({ order: customerOrder(winner), replayed: true });
            return;
          }
        }
        throw err;
      }
    }),
  );

  r.get(
    '/orders/:number',
    limiter(60_000, 60, internalToken, 'Too many requests. Please slow down.'),
    handle(async (req, res) => {
      const { number } = z.object({ number: z.string().regex(/^CO-\d{6,9}$/) }).parse(req.params);
      const { key } = z.object({ key: z.string().min(10).max(64) }).parse(req.query);
      const order = await prisma.order.findUnique({ where: { orderNumber: number }, include: orderView });
      if (!order || !sameSecret(order.accessKey, key)) throw notFound('Order');
      res.json({ order: customerOrder(order) });
    }),
  );

  r.post(
    '/orders/track',
    limiter(10 * 60_000, 10, internalToken, 'Too many attempts. Please try again in a few minutes.'),
    handle(async (req, res) => {
      const { orderNumber, phone } = trackInput.parse(req.body);
      const order = await prisma.order.findUnique({ where: { orderNumber }, select: { orderNumber: true, accessKey: true, recipientPhone: true, customer: { select: { phone: true } } } });
      // Same answer whether the number or the phone is wrong, so orders cannot be enumerated.
      if (!order || (order.recipientPhone !== phone && order.customer.phone !== phone)) throw new HttpError(404, 'No order matches that number and phone');
      res.json({ orderNumber: order.orderNumber, accessKey: order.accessKey });
    }),
  );

  return r;
}
