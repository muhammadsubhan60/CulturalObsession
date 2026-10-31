import type { Prisma, PrismaClient } from '@co/db';
import {
  adminOrderInput,
  ORDER_STATUSES,
  ORDER_TRANSITIONS,
  orderListQuery,
  orderNoteInput,
  orderStatusInput,
  paymentDecisionInput,
  quoteInput,
  shipmentInput,
  shipmentPatch,
} from '@co/shared';
import { Router, type Response } from 'express';
import { z } from 'zod';
import type { Auth } from '../auth/auth';
import { orderView, OutOfStock, placeOrder } from '../checkout/place-order';
import { quoteCart } from '../checkout/quote';
import { courierAdapter } from '../couriers/adapter';
import { audit } from '../http/audit';
import { handle, HttpError, log, notFound } from '../http/errors';
import { requireStaff, type StaffSession } from '../http/require-staff';
import type { Storage } from '../storage/s3';
import { blockerFor, changeStatus, loadForWorkflow, unapprovedItems } from './workflow';

const idParam = z.object({ id: z.string().min(1).max(64) });
const itemParam = idParam.extend({ itemId: z.string().min(1).max(64) });
const OPEN = ORDER_STATUSES.filter((s) => !['DELIVERED', 'CANCELLED', 'RETURNED'].includes(s));
const actorOf = (res: Response) => (res.locals.session as StaffSession).user.id;

const detailInclude = {
  ...orderView,
  items: { include: { customization: true, variant: { select: { trackInventory: true, product: { select: { id: true, slug: true } } } } } },
  customer: { include: { _count: { select: { orders: true } } } },
} satisfies Prisma.OrderInclude;

/** Order operations. Every staff role works orders; there is no write split here. */
export function ordersRouter({ auth, prisma, storage }: { auth: Auth; prisma: PrismaClient; storage: Storage | null }) {
  const r = Router();
  const staff = requireStaff(auth);

  // ─── Inbox ───
  r.get(
    '/orders',
    staff,
    handle(async (req, res) => {
      const q = orderListQuery.parse(req.query);
      const digits = q.q?.replace(/\D/g, '') ?? '';
      const where: Prisma.OrderWhereInput = {
        ...(q.status === 'open' ? { status: { in: OPEN } } : q.status ? { status: q.status } : {}),
        ...(q.source ? { source: q.source } : {}),
        ...(q.q
          ? {
              OR: [
                { orderNumber: { contains: q.q.toUpperCase() } },
                { recipientName: { contains: q.q, mode: 'insensitive' } },
                // 0300 1234567 and +92 300 1234567 both find +923001234567.
                ...(digits.length >= 4 ? [{ recipientPhone: { contains: digits.replace(/^0/, '') } }] : []),
              ],
            }
          : {}),
      };
      const [total, orders, counts] = await prisma.$transaction([
        prisma.order.count({ where }),
        prisma.order.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (q.page - 1) * q.pageSize,
          take: q.pageSize,
          include: {
            items: { select: { quantity: true, customization: { select: { approvedAt: true } } } },
            payments: { where: { purpose: 'ADVANCE' }, select: { status: true } },
          },
        }),
        prisma.order.groupBy({ by: ['status'], orderBy: { status: 'asc' }, _count: { _all: true } }),
      ]);
      res.json({
        items: orders.map((o) => ({
          id: o.id,
          orderNumber: o.orderNumber,
          status: o.status,
          source: o.source,
          createdAt: o.createdAt,
          recipientName: o.recipientName,
          recipientPhone: o.recipientPhone,
          city: (o.shippingAddress as { city?: string }).city ?? null,
          totalPaisa: o.totalPaisa,
          itemCount: o.items.reduce((s, i) => s + i.quantity, 0),
          advanceStatus: o.payments[0]?.status ?? null,
          personalizationPending: unapprovedItems(o),
        })),
        total,
        page: q.page,
        pageSize: q.pageSize,
        counts: Object.fromEntries(counts.map((c) => [c.status, (c._count as { _all: number })._all])),
      });
    }),
  );

  r.get(
    '/orders/:id',
    staff,
    handle(async (req, res) => {
      const { id } = idParam.parse(req.params);
      const order = await prisma.order.findUnique({ where: { id }, include: detailInclude });
      if (!order) throw notFound('Order');
      const actorIds = [...new Set(order.statusHistory.map((h) => h.actorUserId).filter((x): x is string => Boolean(x)))];
      const actors = await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } });
      const names = new Map(actors.map((a) => [a.id, a.name]));
      const workflow = (await loadForWorkflow(prisma, id))!;
      res.json({
        order: {
          ...order,
          accessKey: undefined,
          idempotencyKey: undefined,
          statusHistory: order.statusHistory.map((h) => ({ ...h, actorName: h.actorUserId ? (names.get(h.actorUserId) ?? 'Staff') : null })),
          shipments: order.shipments.map((s) => ({ ...s, courier: { id: s.courier.id, name: s.courier.name } })),
        },
        // Each possible next status with the reason it is blocked (null = allowed now).
        next: ORDER_TRANSITIONS[order.status].map((status) => ({ status, blocker: blockerFor(workflow, status) })),
      });
    }),
  );

  r.post(
    '/orders/:id/status',
    staff,
    handle(async (req, res) => {
      const { id } = idParam.parse(req.params);
      const input = orderStatusInput.parse(req.body);
      await prisma.$transaction(async (tx) => {
        const order = await loadForWorkflow(tx, id);
        if (!order) throw notFound('Order');
        await changeStatus(tx, order, input.status, { note: input.note, restock: input.restock, actorUserId: actorOf(res) });
        await audit(tx, req, res, { action: 'order.status', entityType: 'Order', entityId: id, metadata: { from: order.status, to: input.status } });
      });
      res.json({ ok: true });
    }),
  );

  r.patch(
    '/orders/:id',
    staff,
    handle(async (req, res) => {
      const { id } = idParam.parse(req.params);
      const { internalNote } = orderNoteInput.parse(req.body);
      await prisma.$transaction(async (tx) => {
        await tx.order.update({ where: { id }, data: { internalNote: internalNote || null } });
        await audit(tx, req, res, { action: 'order.note', entityType: 'Order', entityId: id });
      });
      res.json({ ok: true });
    }),
  );

  // ─── Personalization approval ───
  r.post(
    '/orders/:id/items/:itemId/approval',
    staff,
    handle(async (req, res) => {
      const { id, itemId } = itemParam.parse(req.params);
      const { approved } = z.object({ approved: z.boolean() }).parse(req.body);
      await prisma.$transaction(async (tx) => {
        const item = await tx.orderItem.findFirst({ where: { id: itemId, orderId: id }, include: { order: { select: { status: true } } } });
        if (!item) throw notFound('Order item');
        if (!['PENDING', 'CONFIRMATION_REQUIRED', 'CONFIRMED', 'IN_PRODUCTION'].includes(item.order.status)) {
          throw new HttpError(409, 'Personalization can only change before the order is ready to dispatch');
        }
        await tx.orderCustomization.updateMany({
          where: { orderItemId: itemId },
          data: approved ? { approvedAt: new Date(), approvedById: actorOf(res) } : { approvedAt: null, approvedById: null },
        });
        await audit(tx, req, res, { action: approved ? 'order.personalization.approve' : 'order.personalization.reopen', entityType: 'OrderItem', entityId: itemId });
      });
      res.json({ ok: true });
    }),
  );

  // ─── Advance payment verification ───
  r.get(
    '/payments/queue',
    staff,
    handle(async (_req, res) => {
      const payments = await prisma.payment.findMany({
        where: { purpose: 'ADVANCE', status: { in: ['AWAITING_VERIFICATION', 'PENDING'] }, order: { status: { notIn: ['CANCELLED', 'RETURNED'] } } },
        orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
        include: {
          paymentAccount: { select: { label: true, accountNumber: true, iban: true } },
          order: { select: { id: true, orderNumber: true, recipientName: true, recipientPhone: true, totalPaisa: true, status: true, createdAt: true } },
        },
        take: 200,
      });
      res.json({ items: payments });
    }),
  );

  r.post(
    '/payments/:id/verify',
    staff,
    handle(async (req, res) => {
      const { id } = idParam.parse(req.params);
      const input = paymentDecisionInput.parse(req.body);
      const actor = actorOf(res);
      try {
        await prisma.$transaction(async (tx) => {
          const payment = await tx.payment.findUnique({ where: { id } });
          if (!payment || payment.purpose !== 'ADVANCE') throw notFound('Payment');
          const allowed = input.decision === 'approve' ? ['PENDING', 'AWAITING_VERIFICATION', 'FAILED'] : ['PENDING', 'AWAITING_VERIFICATION'];
          if (!allowed.includes(payment.status)) throw new HttpError(409, 'This payment was already handled');
          const now = new Date();
          await tx.payment.update({
            where: { id },
            data:
              input.decision === 'approve'
                ? { status: 'PAID', paidAt: now, verifiedAt: now, verifiedById: actor, ...(input.reference ? { providerReference: input.reference } : {}) }
                : { status: 'FAILED', verifiedAt: now, verifiedById: actor },
          });
          const order = (await loadForWorkflow(tx, payment.orderId))!;
          if (input.decision === 'approve' && order.status === 'CONFIRMATION_REQUIRED') {
            await changeStatus(tx, order, 'CONFIRMED', { note: input.note ?? 'Advance payment verified', actorUserId: actor });
          } else {
            await tx.orderStatusHistory.create({
              data: {
                orderId: order.id,
                fromStatus: order.status,
                toStatus: order.status,
                note: `${input.decision === 'approve' ? 'Advance payment verified' : 'Advance payment rejected'}${input.note ? `: ${input.note}` : ''}`,
                actorUserId: actor,
              },
            });
          }
          await audit(tx, req, res, { action: `payment.${input.decision}`, entityType: 'Payment', entityId: id, metadata: { orderId: payment.orderId } });
        });
      } catch (err) {
        if ((err as { code?: string }).code === 'P2002') throw new HttpError(409, 'That transaction ID is already recorded on another payment');
        throw err;
      }
      res.json({ ok: true });
    }),
  );

  // ─── Shipments ───
  r.post(
    '/orders/:id/shipments',
    staff,
    handle(async (req, res) => {
      const { id } = idParam.parse(req.params);
      const input = shipmentInput.parse(req.body);
      const shipment = await prisma.$transaction(async (tx) => {
        const order = await tx.order.findUnique({ where: { id }, include: { shipments: true, payments: true } });
        if (!order) throw notFound('Order');
        if (!['CONFIRMED', 'IN_PRODUCTION', 'READY_TO_DISPATCH'].includes(order.status)) throw new HttpError(409, 'Confirm the order before booking a courier');
        if (order.shipments.some((s) => s.status !== 'CANCELLED')) throw new HttpError(409, 'This order already has a shipment. Edit it instead.');
        const courier = await tx.courier.findFirst({ where: { id: input.courierId, isActive: true } });
        if (!courier) throw new HttpError(400, 'Invalid input', [{ path: 'courierId', message: 'Choose an active courier' }]);
        const created = await tx.shipment.create({
          data: {
            orderId: id,
            courierId: courier.id,
            trackingNumber: input.trackingNumber,
            trackingUrl: courierAdapter(courier).trackingUrl(input.trackingNumber),
            status: 'BOOKED',
            bookedAt: new Date(),
            shippingCostPaisa: input.shippingCostPaisa ?? null,
            // What the rider collects: unpaid cash-on-delivery amounts.
            codAmountPaisa: order.payments.filter((p) => p.method === 'COD' && p.status === 'PENDING').reduce((s, p) => s + p.amountPaisa, 0),
          },
        });
        await audit(tx, req, res, { action: 'shipment.create', entityType: 'Shipment', entityId: created.id, metadata: { orderId: id, courier: courier.code } });
        return created;
      });
      res.status(201).json({ shipment });
    }),
  );

  r.patch(
    '/shipments/:id',
    staff,
    handle(async (req, res) => {
      const { id } = idParam.parse(req.params);
      const input = shipmentPatch.parse(req.body);
      const shipment = await prisma.$transaction(async (tx) => {
        const current = await tx.shipment.findUnique({ where: { id }, include: { courier: true } });
        if (!current) throw notFound('Shipment');
        const updated = await tx.shipment.update({
          where: { id },
          data: {
            ...(input.trackingNumber
              ? { trackingNumber: input.trackingNumber, trackingUrl: courierAdapter(current.courier).trackingUrl(input.trackingNumber) }
              : {}),
            ...(input.status ? { status: input.status } : {}),
          },
        });
        await audit(tx, req, res, { action: 'shipment.update', entityType: 'Shipment', entityId: id, metadata: { fields: Object.keys(input) } });
        return updated;
      });
      res.json({ shipment });
    }),
  );

  // ─── Staff-entered orders (WhatsApp, phone, in person) ───
  r.get(
    '/order-variants',
    staff,
    handle(async (req, res) => {
      const { q } = z.object({ q: z.string().trim().max(100).default('') }).parse(req.query);
      const variants = await prisma.productVariant.findMany({
        where: {
          isActive: true,
          product: { status: 'ACTIVE' },
          ...(q ? { OR: [{ sku: { contains: q, mode: 'insensitive' } }, { product: { title: { contains: q, mode: 'insensitive' } } }] } : {}),
        },
        orderBy: [{ product: { title: 'asc' } }, { sortOrder: 'asc' }],
        take: 30,
        include: {
          inventory: true,
          product: {
            select: {
              title: true,
              images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { s3Key: true } },
              templates: { where: { isActive: true }, select: { fields: { orderBy: { sortOrder: 'asc' } } } },
            },
          },
        },
      });
      res.json({
        items: variants.map((v) => ({
          id: v.id,
          sku: v.sku,
          title: v.title,
          productTitle: v.product.title,
          pricePaisa: v.pricePaisa,
          image: v.product.images[0] ? (storage?.publicUrl(v.product.images[0].s3Key) ?? null) : null,
          available: v.trackInventory ? (v.inventory?.quantityOnHand ?? 0) - (v.inventory?.quantityReserved ?? 0) : null,
          fields: v.product.templates.flatMap((t) =>
            t.fields.map((f) => ({
              key: f.key,
              label: f.label,
              required: f.required,
              extraPricePaisa: f.extraPricePaisa,
              maxLength: (f.config as { maxLength?: number }).maxLength ?? null,
            })),
          ),
        })),
      });
    }),
  );

  r.post(
    '/orders/quote',
    staff,
    handle(async (req, res) => {
      const { lines } = quoteInput.parse(req.body);
      const q = await quoteCart(prisma, lines, storage);
      res.json({
        lines: q.lines.map((l) => ({ index: l.index, lineTotalPaisa: l.lineTotalPaisa, problem: l.problem, problemDetail: l.problemDetail })),
        subtotalPaisa: q.subtotalPaisa,
        shippingPaisa: q.shippingPaisa,
        totalPaisa: q.totalPaisa,
        advanceRequiredPaisa: q.advanceRequiredPaisa,
        codAmountPaisa: q.codAmountPaisa,
        ok: q.ok,
      });
    }),
  );

  r.post(
    '/orders',
    staff,
    handle(async (req, res) => {
      const input = adminOrderInput.parse(req.body);
      const existing = await prisma.order.findUnique({ where: { idempotencyKey: input.idempotencyKey }, select: { id: true, orderNumber: true } });
      if (existing) {
        res.status(200).json({ order: existing, replayed: true });
        return;
      }
      try {
        const order = await prisma.$transaction(
          async (tx) => {
            const created = await placeOrder(tx, storage, { ...input, actorUserId: actorOf(res) });
            await audit(tx, req, res, { action: 'order.create', entityType: 'Order', entityId: created.id, metadata: { source: input.source } });
            return created;
          },
          { isolationLevel: 'ReadCommitted', timeout: 15_000 },
        );
        log('info', req, 'staff order placed', { orderNumber: order.orderNumber, source: input.source });
        res.status(201).json({ order: { id: order.id, orderNumber: order.orderNumber }, replayed: false });
      } catch (err) {
        if (err instanceof OutOfStock) throw new HttpError(409, `${err.message} is out of stock`);
        if ((err as { code?: string }).code === 'P2002') {
          const winner = await prisma.order.findUnique({ where: { idempotencyKey: input.idempotencyKey }, select: { id: true, orderNumber: true } });
          if (winner) {
            res.status(200).json({ order: winner, replayed: true });
            return;
          }
          throw new HttpError(409, 'That transaction ID is already recorded on another payment');
        }
        throw err;
      }
    }),
  );

  // ─── Customers ───
  r.get(
    '/customers',
    staff,
    handle(async (req, res) => {
      const { q, page } = z
        .object({ q: z.string().trim().max(100).optional(), page: z.coerce.number().int().min(1).max(10_000).default(1) })
        .parse(req.query);
      const digits = q?.replace(/\D/g, '') ?? '';
      const where: Prisma.CustomerWhereInput = q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { email: { contains: q.toLowerCase() } },
              ...(digits.length >= 4 ? [{ phone: { contains: digits.replace(/^0/, '') } }] : []),
            ],
          }
        : {};
      const pageSize = 25;
      const [total, customers] = await prisma.$transaction([
        prisma.customer.count({ where }),
        prisma.customer.findMany({
          where,
          orderBy: { updatedAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: {
            orders: { orderBy: { createdAt: 'desc' }, select: { id: true, orderNumber: true, status: true, totalPaisa: true, createdAt: true } },
            addresses: { orderBy: { createdAt: 'desc' }, take: 1, select: { city: true } },
          },
        }),
      ]);
      res.json({
        items: customers.map((c) => {
          const kept = c.orders.filter((o) => !['CANCELLED', 'RETURNED'].includes(o.status));
          return {
            id: c.id,
            name: c.name,
            phone: c.phone,
            email: c.email,
            city: c.addresses[0]?.city ?? null,
            orderCount: c.orders.length,
            spentPaisa: kept.reduce((s, o) => s + o.totalPaisa, 0),
            lastOrder: c.orders[0] ?? null,
          };
        }),
        total,
        page,
        pageSize,
      });
    }),
  );

  // ─── Dashboard ───
  r.get(
    '/dashboard',
    staff,
    handle(async (_req, res) => {
      // Pakistan time (UTC+5, no DST) so "today" matches the shop's day.
      const PKT = 5 * 3_600_000;
      const startOfDay = new Date(Math.floor((Date.now() + PKT) / 86_400_000) * 86_400_000 - PKT);
      const [byStatus, advances, personalization, today, recent, lowStock] = await Promise.all([
        prisma.order.groupBy({ by: ['status'], where: { status: { in: OPEN } }, orderBy: { status: 'asc' }, _count: { _all: true } }),
        prisma.payment.count({ where: { purpose: 'ADVANCE', status: 'AWAITING_VERIFICATION', order: { status: { notIn: ['CANCELLED', 'RETURNED'] } } } }),
        prisma.orderItem.count({ where: { order: { status: { in: ['PENDING', 'CONFIRMATION_REQUIRED', 'CONFIRMED', 'IN_PRODUCTION'] } }, customization: { some: { approvedAt: null } } } }),
        prisma.order.aggregate({ where: { createdAt: { gte: startOfDay }, status: { notIn: ['CANCELLED'] } }, _count: { _all: true }, _sum: { totalPaisa: true } }),
        prisma.order.findMany({
          orderBy: { createdAt: 'desc' },
          take: 8,
          select: { id: true, orderNumber: true, status: true, source: true, recipientName: true, totalPaisa: true, createdAt: true },
        }),
        prisma.$queryRaw<{ n: bigint }[]>`
          SELECT count(*) AS n FROM "Inventory" i JOIN "ProductVariant" v ON v.id = i."variantId"
          WHERE v."trackInventory" AND v."isActive" AND i."quantityOnHand" - i."quantityReserved" <= i."lowStockThreshold"`,
      ]);
      res.json({
        statusCounts: Object.fromEntries(byStatus.map((c) => [c.status, (c._count as { _all: number })._all])),
        advancesToVerify: advances,
        personalizationToApprove: personalization,
        today: { orders: today._count._all, revenuePaisa: today._sum.totalPaisa ?? 0 },
        lowStock: Number(lowStock[0]?.n ?? 0),
        recent,
      });
    }),
  );

  return r;
}
