import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeTestApp } from './helpers';

const { app, prisma } = makeTestApp();
const tag = randomUUID().slice(0, 8);
const TOKEN = 'internal-test-token-internal-test-token-0000';
let ipCounter = 0;
// Every request gets its own shopper IP so the order rate limit never interferes between tests.
const post = (url: string, body: object) =>
  request(app).post(url).set('X-Internal-Token', TOKEN).set('X-Shopper-IP', `192.0.2.${tag.charCodeAt(0) % 50}.${++ipCounter}`).send(body);
const key = () => `test-${tag}-${randomUUID()}`;

let readyVariant = '';
let personalVariant = '';
let stockVariant = '';
let personalProductId = '';
let accountId = '';

const customer = { name: 'Ayesha Khan', phone: '0300 1234567' };
const address = { city: 'Lahore', addressLine: 'House 12, Street 4, Gulberg III' };
const checkout = (lines: object[], extra: object = {}) => ({
  idempotencyKey: key(),
  lines,
  customer,
  address,
  payment: { method: 'COD' },
  ...extra,
});

beforeAll(async () => {
  const ready = await prisma.product.create({
    data: {
      title: `Ready ${tag}`,
      slug: `t-${tag}-ready`,
      description: '',
      status: 'ACTIVE',
      variants: { create: { sku: `T-${tag}-R`, title: 'Default', pricePaisa: 150_000, trackInventory: false } },
    },
    include: { variants: true },
  });
  readyVariant = ready.variants[0]!.id;
  const personal = await prisma.product.create({
    data: {
      title: `Name Necklace ${tag}`,
      slug: `t-${tag}-personal`,
      description: '',
      status: 'ACTIVE',
      productType: 'PERSONALIZABLE',
      variants: { create: { sku: `T-${tag}-P`, title: 'Gold', pricePaisa: 99_900, trackInventory: false } },
      templates: {
        create: { name: 'P', fields: { create: { key: 'text-1', label: 'Customize Name', fieldType: 'text', required: true, extraPricePaisa: 10_000, config: { maxLength: 12 } } } },
      },
    },
    include: { variants: true },
  });
  personalVariant = personal.variants[0]!.id;
  personalProductId = personal.id;
  const stocked = await prisma.product.create({
    data: {
      title: `Last One ${tag}`,
      slug: `t-${tag}-stock`,
      description: '',
      status: 'ACTIVE',
      variants: { create: { sku: `T-${tag}-S`, title: 'Default', pricePaisa: 50_000, trackInventory: true, inventory: { create: { quantityOnHand: 1 } } } },
    },
    include: { variants: true },
  });
  stockVariant = stocked.variants[0]!.id;
  accountId = (await prisma.paymentAccount.create({ data: { method: 'JAZZCASH', label: `JazzCash ${tag}`, accountTitle: 'Cultural Obsession', accountNumber: '03001112223' } })).id;
});

afterAll(async () => {
  const orders = await prisma.order.findMany({ where: { items: { some: { skuSnapshot: { startsWith: `T-${tag}` } } } }, select: { id: true } });
  await prisma.order.deleteMany({ where: { id: { in: orders.map((o) => o.id) } } });
  await prisma.advancePaymentRule.deleteMany({ where: { name: { startsWith: `t-${tag}` } } });
  await prisma.paymentAccount.deleteMany({ where: { label: `JazzCash ${tag}` } });
  await prisma.product.deleteMany({ where: { slug: { startsWith: `t-${tag}` } } });
  await prisma.customer.deleteMany({ where: { phone: '+923001234567', orders: { none: {} } } });
});

describe('cart quote', () => {
  it('prices from the database and ignores prices sent by the browser', async () => {
    const res = await post('/api/store/cart/quote', {
      lines: [{ variantId: personalVariant, quantity: 2, customization: { 'text-1': 'Ayesha' }, pricePaisa: 1 }],
    });
    expect(res.status).toBe(200);
    expect(res.body.lines[0]).toMatchObject({ unitPricePaisa: 99_900, customizationPaisa: 10_000, lineTotalPaisa: 219_800, problem: null });
    expect(res.body.subtotalPaisa).toBe(219_800);
    expect(res.body.ok).toBe(true);
  });

  it('flags missing or too-long personalization and unknown variants', async () => {
    const res = await post('/api/store/cart/quote', {
      lines: [
        { variantId: personalVariant, quantity: 1 },
        { variantId: personalVariant, quantity: 1, customization: { 'text-1': 'Muhammad Abdullah Khan' } },
        { variantId: 'does-not-exist', quantity: 1 },
      ],
    });
    expect(res.body.lines.map((l: { problem: string }) => l.problem)).toEqual(['customization', 'customization', 'unavailable']);
    expect(res.body.ok).toBe(false);
  });
});

describe('placing orders', () => {
  it('creates a COD order with snapshots, history and a numbered, keyed status link', async () => {
    const res = await post('/api/store/orders', checkout([{ variantId: readyVariant, quantity: 2 }], { note: 'Gift wrap please' }));
    expect(res.status).toBe(201);
    const o = res.body.order;
    expect(o.orderNumber).toMatch(/^CO-\d{6,}$/);
    expect(o).toMatchObject({ status: 'PENDING', totalPaisa: 300_000, codAmountPaisa: 300_000, advanceRequiredPaisa: 0, recipientPhone: '+923001234567' });
    expect(o.items[0]).toMatchObject({ title: `Ready ${tag}`, quantity: 2, lineTotalPaisa: 300_000 });
    expect(o.payments).toEqual([expect.objectContaining({ method: 'COD', purpose: 'FULL', status: 'PENDING', amountPaisa: 300_000 })]);

    const view = await request(app).get(`/api/store/orders/${o.orderNumber}?key=${o.accessKey}`);
    expect(view.status).toBe(200);
    expect(view.body.order.history[0].status).toBe('PENDING');
    expect(JSON.stringify(view.body)).not.toMatch(/internalNote|actorUserId/);
    expect((await request(app).get(`/api/store/orders/${o.orderNumber}?key=wrong-key-0000000`)).status).toBe(404);
  });

  it('returns the same order for a repeated or concurrent submit with the same key', async () => {
    const body = checkout([{ variantId: readyVariant, quantity: 1 }]);
    const [a, b] = await Promise.all([post('/api/store/orders', body), post('/api/store/orders', body)]);
    expect([a.status, b.status].sort()).toEqual([200, 201]);
    expect(a.body.order.orderNumber).toBe(b.body.order.orderNumber);
    const again = await post('/api/store/orders', body);
    expect(again.body).toMatchObject({ replayed: true, order: { orderNumber: a.body.order.orderNumber } });
    expect(await prisma.order.count({ where: { idempotencyKey: body.idempotencyKey } })).toBe(1);
  });

  it('refuses an order whose personalization is missing', async () => {
    const res = await post('/api/store/orders', checkout([{ variantId: personalVariant, quantity: 1 }]));
    expect(res.status).toBe(409);
    expect(res.body.fields[0].path).toBe('lines.0');
  });

  it('requires the configured advance for personalized items and records it for verification', async () => {
    await prisma.advancePaymentRule.create({
      data: { name: `t-${tag}-personal`, scope: 'PRODUCT', productId: personalProductId, mode: 'FIXED', value: 30_000 },
    });
    const lines = [{ variantId: personalVariant, quantity: 2, customization: { 'text-1': 'Ayesha' } }];

    const cod = await post('/api/store/orders', checkout(lines));
    expect(cod.status).toBe(400);
    expect(cod.body.fields[0].path).toBe('payment.method');

    const res = await post('/api/store/orders', checkout(lines, { payment: { method: 'JAZZCASH', accountId, reference: 'TID123456' } }));
    expect(res.status).toBe(201);
    expect(res.body.order).toMatchObject({ status: 'CONFIRMATION_REQUIRED', totalPaisa: 219_800, advanceRequiredPaisa: 60_000, codAmountPaisa: 159_800 });
    const purposes = res.body.order.payments.map((p: { purpose: string; status: string }) => `${p.purpose}:${p.status}`).sort();
    expect(purposes).toEqual(['ADVANCE:AWAITING_VERIFICATION', 'BALANCE:PENDING']);
    expect(res.body.order.payments.find((p: { purpose: string }) => p.purpose === 'ADVANCE').account.accountNumber).toBe('03001112223');
  });

  it('sells the last tracked unit exactly once under concurrency', async () => {
    const [a, b] = await Promise.all([
      post('/api/store/orders', checkout([{ variantId: stockVariant, quantity: 1 }])),
      post('/api/store/orders', checkout([{ variantId: stockVariant, quantity: 1 }])),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    const inv = await prisma.inventory.findUnique({ where: { variantId: stockVariant } });
    expect(inv).toMatchObject({ quantityOnHand: 1, quantityReserved: 1 });
  });

  it('rejects invalid phone numbers and addresses', async () => {
    const res = await post('/api/store/orders', checkout([{ variantId: readyVariant, quantity: 1 }], { customer: { name: 'A', phone: '12345' } }));
    expect(res.status).toBe(400);
    expect(res.body.fields.map((f: { path: string }) => f.path).sort()).toEqual(['customer.name', 'customer.phone']);
  });
});

describe('order tracking', () => {
  it('finds an order by number and phone, with one answer for any mismatch', async () => {
    const placed = await post('/api/store/orders', checkout([{ variantId: readyVariant, quantity: 1 }]));
    const number = placed.body.order.orderNumber;
    const ok = await post('/api/store/orders/track', { orderNumber: number.replace('CO-', ''), phone: '+92 300 1234567' });
    expect(ok.body).toEqual({ orderNumber: number, accessKey: placed.body.order.accessKey });
    const wrongPhone = await post('/api/store/orders/track', { orderNumber: number, phone: '03009999999' });
    const wrongNumber = await post('/api/store/orders/track', { orderNumber: 'CO-999999999', phone: '03001234567' });
    expect(wrongPhone.status).toBe(404);
    expect(wrongNumber.body).toEqual(wrongPhone.body);
  });
});
