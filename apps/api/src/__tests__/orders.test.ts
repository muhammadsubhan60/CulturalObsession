import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createStaffUser } from '../auth/staff';
import { makeTestApp, WEB_ORIGIN } from './helpers';

const { app, auth, prisma } = makeTestApp();
const tag = randomUUID().slice(0, 8);
const TOKEN = 'internal-test-token-internal-test-token-0000';
const password = `orders-pass-${tag}`;
const managerEmail = `omanager-${tag}@test.local`;
const staffEmail = `ostaff-${tag}@test.local`;
let manager: string[] = [];
let staff: string[] = [];
let ipCounter = 0;

let readyVariant = '';
let personalVariant = '';
let stockVariant = '';
let personalProductId = '';
let accountId = '';
let courierId = '';

async function login(email: string) {
  const res = await request(app)
    .post('/api/auth/sign-in/email')
    .set('Origin', WEB_ORIGIN)
    .set('X-Forwarded-For', `10.98.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`)
    .send({ email, password });
  expect(res.status).toBe(200);
  return ([] as string[]).concat(res.headers['set-cookie'] ?? []);
}

const as = (cookie: string[]) => ({
  get: (url: string) => request(app).get(url).set('Cookie', cookie),
  post: (url: string, body: object) => request(app).post(url).set('Cookie', cookie).send(body),
  put: (url: string, body: object) => request(app).put(url).set('Cookie', cookie).send(body),
  patch: (url: string, body: object) => request(app).patch(url).set('Cookie', cookie).send(body),
});

/** Places a website order the way the storefront does. */
async function websiteOrder(lines: object[], payment: object = { method: 'COD' }) {
  const res = await request(app)
    .post('/api/store/orders')
    .set('X-Internal-Token', TOKEN)
    .set('X-Shopper-IP', `198.51.100.${tag.charCodeAt(1) % 50}.${++ipCounter}`)
    .send({
      idempotencyKey: `test-${tag}-${randomUUID()}`,
      lines,
      customer: { name: 'Sana Ahmed', phone: '0321 7654321' },
      address: { city: 'Karachi', addressLine: 'Flat 3, Block 7, Clifton' },
      payment,
    });
  expect(res.status).toBe(201);
  return (await prisma.order.findUniqueOrThrow({ where: { orderNumber: res.body.order.orderNumber } })).id;
}

const move = (id: string, status: string, extra: object = {}) => as(staff).post(`/api/admin/orders/${id}/status`, { status, ...extra });

beforeAll(async () => {
  await createStaffUser(auth, { email: managerEmail, name: 'Manager', password, role: 'manager' });
  await createStaffUser(auth, { email: staffEmail, name: 'Staff', password, role: 'staff' });
  manager = await login(managerEmail);
  staff = await login(staffEmail);

  const ready = await prisma.product.create({
    data: {
      title: `Ready ${tag}`,
      slug: `t-${tag}-oready`,
      description: '',
      status: 'ACTIVE',
      variants: { create: { sku: `O-${tag}-R`, title: 'Default', pricePaisa: 200_000, trackInventory: false } },
    },
    include: { variants: true },
  });
  readyVariant = ready.variants[0]!.id;
  const personal = await prisma.product.create({
    data: {
      title: `Name Ring ${tag}`,
      slug: `t-${tag}-opersonal`,
      description: '',
      status: 'ACTIVE',
      productType: 'PERSONALIZABLE',
      variants: { create: { sku: `O-${tag}-P`, title: 'Silver', pricePaisa: 150_000, trackInventory: false } },
      templates: { create: { name: 'P', fields: { create: { key: 'text-1', label: 'Customize Name', fieldType: 'text', required: true, config: { maxLength: 12 } } } } },
    },
    include: { variants: true },
  });
  personalVariant = personal.variants[0]!.id;
  personalProductId = personal.id;
  const stocked = await prisma.product.create({
    data: {
      title: `Stocked ${tag}`,
      slug: `t-${tag}-ostock`,
      description: '',
      status: 'ACTIVE',
      variants: { create: { sku: `O-${tag}-S`, title: 'Default', pricePaisa: 50_000, trackInventory: true, inventory: { create: { quantityOnHand: 5 } } } },
    },
    include: { variants: true },
  });
  stockVariant = stocked.variants[0]!.id;
  accountId = (await prisma.paymentAccount.create({ data: { method: 'EASYPAISA', label: `Easypaisa ${tag}`, accountTitle: 'Cultural Obsession', accountNumber: '03451112223' } })).id;
  await prisma.advancePaymentRule.create({ data: { name: `t-${tag}-ring`, scope: 'PRODUCT', productId: personalProductId, mode: 'PERCENT', value: 5000 } });
});

afterAll(async () => {
  const orders = await prisma.order.findMany({ where: { items: { some: { skuSnapshot: { startsWith: `O-${tag}` } } } }, select: { id: true } });
  const ids = orders.map((o) => o.id);
  await prisma.shipment.deleteMany({ where: { orderId: { in: ids } } });
  await prisma.order.deleteMany({ where: { id: { in: ids } } });
  await prisma.courier.deleteMany({ where: { code: { startsWith: `t-${tag}` } } });
  await prisma.advancePaymentRule.deleteMany({ where: { name: { startsWith: `t-${tag}` } } });
  await prisma.paymentAccount.deleteMany({ where: { label: { contains: tag } } });
  await prisma.product.deleteMany({ where: { slug: { startsWith: `t-${tag}` } } });
  await prisma.customer.deleteMany({ where: { phone: { in: ['+923217654321', '+923331112222'] }, orders: { none: {} } } });
  await prisma.user.deleteMany({ where: { email: { in: [managerEmail, staffEmail] } } });
});

describe('order inbox', () => {
  it('needs a staff session', async () => {
    expect((await request(app).get('/api/admin/orders')).status).toBe(401);
    expect((await request(app).get('/api/admin/dashboard')).status).toBe(401);
  });

  it('lists, filters and finds orders by phone in any format', async () => {
    const id = await websiteOrder([{ variantId: readyVariant, quantity: 1 }]);
    const order = await prisma.order.findUniqueOrThrow({ where: { id } });
    const byPhone = await as(staff).get('/api/admin/orders?q=0321%207654321&status=open');
    expect(byPhone.status).toBe(200);
    expect(byPhone.body.items.map((o: { id: string }) => o.id)).toContain(id);
    const byNumber = await as(staff).get(`/api/admin/orders?q=${order.orderNumber.toLowerCase()}`);
    expect(byNumber.body.items[0]).toMatchObject({ id, status: 'PENDING', source: 'WEBSITE', city: 'Karachi', itemCount: 1 });
    expect(byNumber.body.counts.PENDING).toBeGreaterThan(0);

    const detail = await as(staff).get(`/api/admin/orders/${id}`);
    expect(detail.body.order.accessKey).toBeUndefined();
    expect(detail.body.next).toEqual([
      { status: 'CONFIRMED', blocker: null },
      { status: 'CANCELLED', blocker: null },
    ]);
  });

  it('keeps an internal note that customers never see', async () => {
    const id = await websiteOrder([{ variantId: readyVariant, quantity: 1 }]);
    expect((await as(staff).patch(`/api/admin/orders/${id}`, { internalNote: 'Called, gift for sister' })).status).toBe(200);
    expect((await prisma.order.findUniqueOrThrow({ where: { id } })).internalNote).toBe('Called, gift for sister');
  });
});

describe('order workflow', () => {
  it('runs a personalized advance order from checkout to delivery', async () => {
    const id = await websiteOrder([{ variantId: personalVariant, quantity: 1, customization: { 'text-1': 'Zainab' } }], {
      method: 'EASYPAISA',
      accountId,
      reference: `TX${tag}`,
    });

    // Cannot confirm before the advance is verified.
    const early = await move(id, 'CONFIRMED');
    expect(early.status).toBe(409);
    expect(early.body.error).toMatch(/advance/i);

    const queue = await as(staff).get('/api/admin/payments/queue');
    const payment = queue.body.items.find((p: { order: { id: string } }) => p.order.id === id);
    expect(payment).toMatchObject({ status: 'AWAITING_VERIFICATION', amountPaisa: 75_000, providerReference: `TX${tag}` });

    // Verifying the advance confirms the order.
    expect((await as(staff).post(`/api/admin/payments/${payment.id}/verify`, { decision: 'approve' })).status).toBe(200);
    expect((await prisma.order.findUniqueOrThrow({ where: { id } })).status).toBe('CONFIRMED');

    // Production waits for the personalization to be approved.
    const blocked = await move(id, 'IN_PRODUCTION');
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toMatch(/personalization/i);
    const item = await prisma.orderItem.findFirstOrThrow({ where: { orderId: id } });
    expect((await as(staff).post(`/api/admin/orders/${id}/items/${item.id}/approval`, { approved: true })).status).toBe(200);
    expect((await move(id, 'IN_PRODUCTION')).status).toBe(200);
    expect((await move(id, 'READY_TO_DISPATCH')).status).toBe(200);

    // Dispatch needs a courier and tracking number.
    expect((await move(id, 'SHIPPED')).status).toBe(409);
    const courier = await as(manager).post('/api/admin/couriers', {
      name: 'Test Courier',
      code: `t-${tag}-tcs`,
      trackingUrlTemplate: 'https://track.example.pk/?cn={tracking}',
    });
    expect(courier.status).toBe(201);
    courierId = courier.body.courier.id;
    const shipment = await as(staff).post(`/api/admin/orders/${id}/shipments`, { courierId, trackingNumber: 'KHI123456' });
    expect(shipment.status).toBe(201);
    expect(shipment.body.shipment).toMatchObject({ trackingUrl: 'https://track.example.pk/?cn=KHI123456', codAmountPaisa: 75_000, status: 'BOOKED' });
    expect((await as(staff).post(`/api/admin/orders/${id}/shipments`, { courierId, trackingNumber: 'KHI999' })).status).toBe(409);
    expect((await move(id, 'SHIPPED')).status).toBe(200);

    expect((await move(id, 'DELIVERED')).status).toBe(200);
    const done = await prisma.order.findUniqueOrThrow({ where: { id }, include: { payments: true, statusHistory: { orderBy: { createdAt: 'asc' } }, shipments: true } });
    expect(done.payments.every((p) => p.status === 'PAID')).toBe(true);
    expect(done.shipments[0]!.status).toBe('DELIVERED');
    expect(done.statusHistory.map((h) => h.toStatus)).toEqual(['CONFIRMATION_REQUIRED', 'CONFIRMED', 'IN_PRODUCTION', 'READY_TO_DISPATCH', 'SHIPPED', 'DELIVERED']);

    // The customer's status page shows the tracking link.
    const order = await prisma.order.findUniqueOrThrow({ where: { id } });
    const view = await request(app).get(`/api/store/orders/${order.orderNumber}?key=${order.accessKey}`);
    expect(view.body.order.shipments[0]).toMatchObject({ courier: 'Test Courier', trackingNumber: 'KHI123456' });
  });

  it('refuses edges that are not in the workflow', async () => {
    const id = await websiteOrder([{ variantId: readyVariant, quantity: 1 }]);
    expect((await move(id, 'DELIVERED')).status).toBe(409);
    expect((await move(id, 'NOT_A_STATUS')).status).toBe(400);
  });

  it('releases reserved stock on cancel and takes it off the shelf on dispatch', async () => {
    const stock = () => prisma.inventory.findUniqueOrThrow({ where: { variantId: stockVariant } });
    const cancelled = await websiteOrder([{ variantId: stockVariant, quantity: 2 }]);
    expect(await stock()).toMatchObject({ quantityOnHand: 5, quantityReserved: 2 });
    expect((await move(cancelled, 'CANCELLED', { note: 'Customer changed mind' })).status).toBe(200);
    expect(await stock()).toMatchObject({ quantityOnHand: 5, quantityReserved: 0 });
    expect((await prisma.payment.findFirstOrThrow({ where: { orderId: cancelled } })).status).toBe('FAILED');

    const shipped = await websiteOrder([{ variantId: stockVariant, quantity: 1 }]);
    expect((await move(shipped, 'CONFIRMED')).status).toBe(200);
    expect((await move(shipped, 'READY_TO_DISPATCH')).status).toBe(200);
    expect((await as(staff).post(`/api/admin/orders/${shipped}/shipments`, { courierId, trackingNumber: 'LHE777' })).status).toBe(201);
    expect((await move(shipped, 'SHIPPED')).status).toBe(200);
    expect(await stock()).toMatchObject({ quantityOnHand: 4, quantityReserved: 0 });

    // Returned and restocked.
    expect((await move(shipped, 'RETURNED', { restock: true })).status).toBe(200);
    expect(await stock()).toMatchObject({ quantityOnHand: 5, quantityReserved: 0 });
    const reasons = await prisma.inventoryMovement.findMany({ where: { variantId: stockVariant }, orderBy: { createdAt: 'asc' }, select: { reason: true } });
    expect(reasons.map((r) => r.reason)).toEqual(['ORDER_RESERVED', 'ORDER_RELEASED', 'ORDER_RESERVED', 'ORDER_FULFILLED', 'RETURN_RESTOCKED']);
  });

  it('rejects an advance and refuses a transaction ID that is already used', async () => {
    const first = await websiteOrder([{ variantId: personalVariant, quantity: 1, customization: { 'text-1': 'Ali' } }], { method: 'EASYPAISA', accountId, reference: `DUP${tag}` });
    const second = await websiteOrder([{ variantId: personalVariant, quantity: 1, customization: { 'text-1': 'Omar' } }], { method: 'EASYPAISA', accountId });
    const p1 = await prisma.payment.findFirstOrThrow({ where: { orderId: first, purpose: 'ADVANCE' } });
    const p2 = await prisma.payment.findFirstOrThrow({ where: { orderId: second, purpose: 'ADVANCE' } });
    expect((await as(staff).post(`/api/admin/payments/${p1.id}/verify`, { decision: 'approve' })).status).toBe(200);
    const dup = await as(staff).post(`/api/admin/payments/${p2.id}/verify`, { decision: 'approve', reference: `DUP${tag}` });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toMatch(/already recorded/);
    expect((await as(staff).post(`/api/admin/payments/${p2.id}/verify`, { decision: 'reject', note: 'No money received' })).status).toBe(200);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: p2.id } })).status).toBe('FAILED');
    expect((await prisma.order.findUniqueOrThrow({ where: { id: second } })).status).toBe('CONFIRMATION_REQUIRED');
    expect((await as(staff).post(`/api/admin/payments/${p2.id}/verify`, { decision: 'reject' })).status).toBe(409);
  });
});

describe('staff-entered orders', () => {
  const base = () => ({
    idempotencyKey: `admin-${tag}-${randomUUID()}`,
    customer: { name: 'Hira Malik', phone: '0333 1112222' },
    address: { city: 'Islamabad', addressLine: 'House 9, Street 2, F-7/3' },
  });

  it('prices from the catalogue and creates a confirmed WhatsApp order', async () => {
    const variants = await as(staff).get(`/api/admin/order-variants?q=${encodeURIComponent(`Name Ring ${tag}`)}`);
    expect(variants.body.items[0]).toMatchObject({ id: personalVariant, fields: [expect.objectContaining({ key: 'text-1', required: true, maxLength: 12 })] });

    const lines = [{ variantId: personalVariant, quantity: 1, customization: { 'text-1': 'Hira' } }];
    const quote = await as(staff).post('/api/admin/orders/quote', { lines });
    expect(quote.body).toMatchObject({ totalPaisa: 150_000, advanceRequiredPaisa: 75_000, ok: true });

    const body = { ...base(), lines, source: 'WHATSAPP', advanceReceived: true, payment: { method: 'EASYPAISA', accountId, reference: `WA${tag}` } };
    const res = await as(staff).post('/api/admin/orders', body);
    expect(res.status).toBe(201);
    const order = await prisma.order.findUniqueOrThrow({ where: { id: res.body.order.id }, include: { payments: true } });
    expect(order).toMatchObject({ source: 'WHATSAPP', status: 'CONFIRMED' });
    expect(order.payments.find((p) => p.purpose === 'ADVANCE')).toMatchObject({ status: 'PAID', amountPaisa: 75_000 });
    expect((await as(staff).post('/api/admin/orders', body)).body).toMatchObject({ replayed: true, order: { id: order.id } });
  });

  it('keeps advance orders waiting when the advance has not arrived', async () => {
    const res = await as(staff).post('/api/admin/orders', {
      ...base(),
      lines: [{ variantId: personalVariant, quantity: 1, customization: { 'text-1': 'Sara' } }],
      source: 'ADMIN',
      payment: { method: 'EASYPAISA', accountId },
    });
    expect(res.status).toBe(201);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: res.body.order.id } })).status).toBe('CONFIRMATION_REQUIRED');
    const cod = await as(staff).post('/api/admin/orders', { ...base(), lines: [{ variantId: readyVariant, quantity: 1 }], source: 'ADMIN', payment: { method: 'COD' } });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: cod.body.order.id } })).status).toBe('CONFIRMED');
  });

  it('shows the work queue on the dashboard', async () => {
    const res = await as(staff).get('/api/admin/dashboard');
    expect(res.status).toBe(200);
    expect(res.body.today.orders).toBeGreaterThan(0);
    expect(res.body.recent.length).toBeGreaterThan(0);
  });
});

describe('settings', () => {
  it('lets only owners and managers change advance rules, and validates scope', async () => {
    const rule = { name: `t-${tag}-global`, scope: 'GLOBAL', mode: 'NONE', isActive: false };
    expect((await as(staff).post('/api/admin/advance-rules', rule)).status).toBe(403);
    const missing = await as(manager).post('/api/admin/advance-rules', { ...rule, scope: 'CATEGORY' });
    expect(missing.status).toBe(400);
    expect(missing.body.fields[0].path).toBe('categoryId');
    const created = await as(manager).post('/api/admin/advance-rules', { ...rule, productId: 'ignored-for-global' });
    expect(created.status).toBe(201);
    expect(created.body.rule).toMatchObject({ scope: 'GLOBAL', productId: null, value: 0 });
    const pct = await as(manager).put(`/api/admin/advance-rules/${created.body.rule.id}`, { ...rule, mode: 'PERCENT', value: 20_000 });
    expect(pct.status).toBe(400);
  });

  it('manages payment accounts and keeps used ones as archived', async () => {
    const bad = await as(manager).post('/api/admin/payment-accounts', { method: 'BANK_TRANSFER', label: 'Meezan', accountTitle: 'CO', iban: 'PK12' });
    expect(bad.status).toBe(400);
    const ok = await as(manager).post('/api/admin/payment-accounts', {
      method: 'BANK_TRANSFER',
      label: `Meezan ${tag}`,
      accountTitle: 'Cultural Obsession',
      iban: 'pk36 scbl 0000 0011 2345 6702',
    });
    expect(ok.status).toBe(201);
    expect(ok.body.account.iban).toBe('PK36SCBL0000001123456702');
    const deleted = await request(app).delete(`/api/admin/payment-accounts/${ok.body.account.id}`).set('Cookie', manager);
    expect(deleted.body).toEqual({ archived: false });
    const used = await request(app).delete(`/api/admin/payment-accounts/${accountId}`).set('Cookie', manager);
    expect(used.body).toEqual({ archived: true });
    await prisma.paymentAccount.update({ where: { id: accountId }, data: { isActive: true } });
  });

  it('saves shipping and WhatsApp settings used by the storefront', async () => {
    const before = await as(staff).get('/api/admin/store-settings');
    expect(before.status).toBe(200);
    const bad = await as(manager).put('/api/admin/store-settings', { shipping: { flatPaisa: 25_000, freeOverPaisa: null }, whatsapp: { number: '0317 6642250', message: '' } });
    expect(bad.status).toBe(400);
    const ok = await as(manager).put('/api/admin/store-settings', { ...before.body, whatsapp: { number: '+92 317 6642250', message: 'Salam' } });
    expect(ok.status).toBe(200);
    expect((await request(app).get('/api/store/settings')).body.whatsapp).toEqual({ number: '923176642250', message: 'Salam' });
    await as(manager).put('/api/admin/store-settings', { shipping: before.body.shipping, whatsapp: before.body.whatsapp ?? { number: '923176642250', message: '' } });
  });

  it('keeps staff management to owners', async () => {
    expect((await as(manager).get('/api/admin/staff')).status).toBe(403);
    expect((await as(manager).post('/api/admin/staff', { name: 'X', email: `x-${tag}@test.local`, password: 'long-enough-pass', role: 'owner' })).status).toBe(403);
  });
});
