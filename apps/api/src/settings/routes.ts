import type { PrismaClient } from '@co/db';
import { advanceRuleInput, courierInput, paymentAccountInput, staffInput, staffPatch, storeSettingsInput } from '@co/shared';
import { Router } from 'express';
import { z } from 'zod';
import type { Auth } from '../auth/auth';
import { createStaffUser } from '../auth/staff';
import { audit } from '../http/audit';
import { handle, HttpError, notFound } from '../http/errors';
import { requireStaff, type StaffSession } from '../http/require-staff';

const idParam = z.object({ id: z.string().min(1).max(64) });

const shippingSetting = z
  .object({ flatPaisa: z.number().int().min(0).default(0), freeOverPaisa: z.number().int().min(0).nullable().default(null) })
  .catch({ flatPaisa: 0, freeOverPaisa: null });
const whatsappSetting = z.object({ number: z.string(), message: z.string() }).nullable().catch(null);

/** Store configuration. Staff can read it (checkout needs it); owners and managers change it; owners manage staff. */
export function settingsRouter({ auth, prisma }: { auth: Auth; prisma: PrismaClient }) {
  const r = Router();
  const read = requireStaff(auth);
  const write = requireStaff(auth, ['owner', 'manager']);
  const owner = requireStaff(auth, ['owner']);

  // ─── Advance payment rules ───
  r.get(
    '/advance-rules',
    read,
    handle(async (_req, res) => {
      const items = await prisma.advancePaymentRule.findMany({
        orderBy: [{ isActive: 'desc' }, { priority: 'desc' }, { createdAt: 'asc' }],
        include: { category: { select: { name: true } }, product: { select: { title: true } } },
      });
      res.json({ items });
    }),
  );

  r.post(
    '/advance-rules',
    write,
    handle(async (req, res) => {
      const data = advanceRuleInput.parse(req.body);
      const rule = await prisma.$transaction(async (tx) => {
        const created = await tx.advancePaymentRule.create({ data });
        await audit(tx, req, res, { action: 'advance-rule.create', entityType: 'AdvancePaymentRule', entityId: created.id, metadata: { scope: data.scope, mode: data.mode, value: data.value } });
        return created;
      });
      res.status(201).json({ rule });
    }),
  );

  r.put(
    '/advance-rules/:id',
    write,
    handle(async (req, res) => {
      const { id } = idParam.parse(req.params);
      const data = advanceRuleInput.parse(req.body);
      const rule = await prisma.$transaction(async (tx) => {
        const updated = await tx.advancePaymentRule.update({ where: { id }, data });
        await audit(tx, req, res, { action: 'advance-rule.update', entityType: 'AdvancePaymentRule', entityId: id, metadata: { scope: data.scope, mode: data.mode, value: data.value } });
        return updated;
      });
      res.json({ rule });
    }),
  );

  r.delete(
    '/advance-rules/:id',
    write,
    handle(async (req, res) => {
      const { id } = idParam.parse(req.params);
      await prisma.$transaction(async (tx) => {
        await tx.advancePaymentRule.delete({ where: { id } });
        await audit(tx, req, res, { action: 'advance-rule.delete', entityType: 'AdvancePaymentRule', entityId: id });
      });
      res.status(204).end();
    }),
  );

  // ─── Accounts customers pay advances into ───
  r.get(
    '/payment-accounts',
    read,
    handle(async (_req, res) => {
      const items = await prisma.paymentAccount.findMany({ orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }] });
      res.json({ items });
    }),
  );

  r.post(
    '/payment-accounts',
    write,
    handle(async (req, res) => {
      const data = paymentAccountInput.parse(req.body);
      const account = await prisma.$transaction(async (tx) => {
        const created = await tx.paymentAccount.create({ data });
        await audit(tx, req, res, { action: 'payment-account.create', entityType: 'PaymentAccount', entityId: created.id });
        return created;
      });
      res.status(201).json({ account });
    }),
  );

  r.put(
    '/payment-accounts/:id',
    write,
    handle(async (req, res) => {
      const { id } = idParam.parse(req.params);
      const data = paymentAccountInput.parse(req.body);
      const account = await prisma.$transaction(async (tx) => {
        const updated = await tx.paymentAccount.update({ where: { id }, data });
        await audit(tx, req, res, { action: 'payment-account.update', entityType: 'PaymentAccount', entityId: id, metadata: { fields: Object.keys(data) } });
        return updated;
      });
      res.json({ account });
    }),
  );

  r.delete(
    '/payment-accounts/:id',
    write,
    handle(async (req, res) => {
      const { id } = idParam.parse(req.params);
      // Accounts that received payments are kept (orders show them) and only hidden from checkout.
      const archived = await prisma.$transaction(async (tx) => {
        const used = await tx.payment.count({ where: { paymentAccountId: id } });
        if (used > 0) await tx.paymentAccount.update({ where: { id }, data: { isActive: false } });
        else await tx.paymentAccount.delete({ where: { id } });
        await audit(tx, req, res, { action: used ? 'payment-account.archive' : 'payment-account.delete', entityType: 'PaymentAccount', entityId: id });
        return used > 0;
      });
      res.json({ archived });
    }),
  );

  // ─── Couriers ───
  r.get(
    '/couriers',
    read,
    handle(async (_req, res) => {
      const items = await prisma.courier.findMany({ orderBy: [{ isActive: 'desc' }, { name: 'asc' }], include: { _count: { select: { shipments: true } } } });
      res.json({ items });
    }),
  );

  r.post(
    '/couriers',
    write,
    handle(async (req, res) => {
      const data = courierInput.parse(req.body);
      const courier = await prisma.$transaction(async (tx) => {
        const created = await tx.courier.create({ data });
        await audit(tx, req, res, { action: 'courier.create', entityType: 'Courier', entityId: created.id });
        return created;
      });
      res.status(201).json({ courier });
    }),
  );

  r.put(
    '/couriers/:id',
    write,
    handle(async (req, res) => {
      const { id } = idParam.parse(req.params);
      const data = courierInput.parse(req.body);
      const courier = await prisma.$transaction(async (tx) => {
        const updated = await tx.courier.update({ where: { id }, data });
        await audit(tx, req, res, { action: 'courier.update', entityType: 'Courier', entityId: id });
        return updated;
      });
      res.json({ courier });
    }),
  );

  r.delete(
    '/couriers/:id',
    write,
    handle(async (req, res) => {
      const { id } = idParam.parse(req.params);
      const archived = await prisma.$transaction(async (tx) => {
        const used = await tx.shipment.count({ where: { courierId: id } });
        if (used > 0) await tx.courier.update({ where: { id }, data: { isActive: false } });
        else await tx.courier.delete({ where: { id } });
        await audit(tx, req, res, { action: used ? 'courier.archive' : 'courier.delete', entityType: 'Courier', entityId: id });
        return used > 0;
      });
      res.json({ archived });
    }),
  );

  // ─── Shipping and WhatsApp ───
  r.get(
    '/store-settings',
    read,
    handle(async (_req, res) => {
      const rows = await prisma.storeSetting.findMany({ where: { key: { in: ['shipping', 'whatsapp'] } } });
      const byKey = new Map(rows.map((row) => [row.key, row.value]));
      res.json({ shipping: shippingSetting.parse(byKey.get('shipping') ?? {}), whatsapp: whatsappSetting.parse(byKey.get('whatsapp') ?? null) });
    }),
  );

  r.put(
    '/store-settings',
    write,
    handle(async (req, res) => {
      const data = storeSettingsInput.parse(req.body);
      await prisma.$transaction(async (tx) => {
        for (const [key, value] of Object.entries(data)) {
          await tx.storeSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
        }
        await audit(tx, req, res, { action: 'store-settings.update', entityType: 'StoreSetting' });
      });
      res.json(data);
    }),
  );

  // ─── Staff accounts (owners only) ───
  r.get(
    '/staff',
    owner,
    handle(async (_req, res) => {
      const items = await prisma.user.findMany({
        orderBy: { createdAt: 'asc' },
        select: { id: true, name: true, email: true, role: true, banned: true, twoFactorEnabled: true, createdAt: true },
      });
      res.json({ items });
    }),
  );

  r.post(
    '/staff',
    owner,
    handle(async (req, res) => {
      const data = staffInput.parse(req.body);
      if (await prisma.user.findUnique({ where: { email: data.email }, select: { id: true } })) {
        throw new HttpError(409, 'Already exists', [{ path: 'email', message: 'Someone already uses this email' }]);
      }
      const user = await createStaffUser(auth, data);
      await audit(prisma, req, res, { action: 'staff.create', entityType: 'User', entityId: user.id, metadata: { role: data.role } });
      res.status(201).json({ user: { id: user.id, name: user.name, email: user.email, role: data.role } });
    }),
  );

  r.patch(
    '/staff/:id',
    owner,
    handle(async (req, res) => {
      const { id } = idParam.parse(req.params);
      const data = staffPatch.parse(req.body);
      const me = (res.locals.session as StaffSession).user.id;
      if (id === me) throw new HttpError(409, 'You cannot change your own role or access');
      await prisma.$transaction(async (tx) => {
        const target = await tx.user.findUnique({ where: { id }, select: { role: true } });
        if (!target) throw notFound('Staff member');
        await tx.user.update({ where: { id }, data: { ...(data.role ? { role: data.role } : {}), ...(data.banned !== undefined ? { banned: data.banned } : {}) } });
        // Removing access or changing role ends their sessions, so the change applies immediately.
        await tx.session.deleteMany({ where: { userId: id } });
        await audit(tx, req, res, { action: 'staff.update', entityType: 'User', entityId: id, metadata: data });
      });
      res.json({ ok: true });
    }),
  );

  return r;
}
