import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createStaffUser } from '../auth/staff';
import { makeTestApp, WEB_ORIGIN } from './helpers';

const { app, auth, prisma } = makeTestApp();
const tag = randomUUID().slice(0, 8);
const password = `catalog-pass-${tag}`;
const managerEmail = `manager-${tag}@test.local`;
const staffEmail = `cstaff-${tag}@test.local`;
let managerCookie: string[] = [];
let staffCookie: string[] = [];

async function login(email: string) {
  const res = await request(app)
    .post('/api/auth/sign-in/email')
    .set('Origin', WEB_ORIGIN)
    .set('X-Forwarded-For', `10.99.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`)
    .send({ email, password });
  expect(res.status).toBe(200);
  return ([] as string[]).concat(res.headers['set-cookie'] ?? []);
}

const as = (cookie: string[]) => ({
  get: (url: string) => request(app).get(url).set('Cookie', cookie),
  post: (url: string, body: object) => request(app).post(url).set('Cookie', cookie).send(body),
  patch: (url: string, body: object) => request(app).patch(url).set('Cookie', cookie).send(body),
  del: (url: string) => request(app).delete(url).set('Cookie', cookie),
});

beforeAll(async () => {
  await createStaffUser(auth, { email: managerEmail, name: 'Manager', password, role: 'manager' });
  await createStaffUser(auth, { email: staffEmail, name: 'Staff', password, role: 'staff' });
  managerCookie = await login(managerEmail);
  staffCookie = await login(staffEmail);
});

afterAll(async () => {
  await prisma.product.deleteMany({ where: { slug: { startsWith: `t-${tag}` } } });
  await prisma.category.deleteMany({ where: { slug: { startsWith: `t-${tag}` } } });
  await prisma.user.deleteMany({ where: { email: { in: [managerEmail, staffEmail] } } });
});

describe('catalogue API', () => {
  it('requires a session and lets only owners/managers write', async () => {
    expect((await request(app).get('/api/admin/products')).status).toBe(401);
    expect((await as(staffCookie).get('/api/admin/products')).status).toBe(200);
    const denied = await as(staffCookie).post('/api/admin/categories', { name: 'X', slug: `t-${tag}-denied` });
    expect(denied.status).toBe(403);
  });

  it('creates collections and rejects duplicate or malformed slugs', async () => {
    const ok = await as(managerCookie).post('/api/admin/categories', { name: 'Necklace', slug: `t-${tag}-necklace` });
    expect(ok.status).toBe(201);
    const dup = await as(managerCookie).post('/api/admin/categories', { name: 'Again', slug: `t-${tag}-necklace` });
    expect(dup.status).toBe(409);
    const bad = await as(managerCookie).post('/api/admin/categories', { name: 'Bad', slug: 'Has Spaces!' });
    expect(bad.status).toBe(400);
    expect(bad.body.fields[0].path).toBe('slug');
  });

  it('creates a product with variants, finds it by title or SKU, and archives instead of deleting', async () => {
    const cat = await as(managerCookie).post('/api/admin/categories', { name: 'Rings', slug: `t-${tag}-rings` });
    const created = await as(managerCookie).post('/api/admin/products', {
      title: 'Crown Name Ring',
      slug: `t-${tag}-crown-ring`,
      productType: 'PERSONALIZABLE',
      status: 'ACTIVE',
      categoryIds: [cat.body.category.id],
    });
    expect(created.status).toBe(201);
    const productId = created.body.product.id;

    const made = await as(managerCookie).post(`/api/admin/products/${productId}/variants`, {
      sku: `T-${tag}-RING`,
      title: 'Default',
      pricePaisa: 99_900,
      compareAtPricePaisa: 149_900,
      trackInventory: false,
    });
    expect(made.status).toBe(201);
    expect(made.body.variant.inventory).toBeNull();

    const badCompare = await as(managerCookie).patch(`/api/admin/variants/${made.body.variant.id}`, { compareAtPricePaisa: 50_000 });
    expect(badCompare.status).toBe(400);
    expect(badCompare.body.fields[0].path).toBe('compareAtPricePaisa');

    const bySku = await as(staffCookie).get(`/api/admin/products?q=T-${tag}-ring`);
    expect(bySku.body.items.map((p: { id: string }) => p.id)).toContain(productId);
    expect(bySku.body.items[0]).toMatchObject({ minPricePaisa: 99_900, variantCount: 1, stockOnHand: null });

    const archived = await as(managerCookie).del(`/api/admin/products/${productId}`);
    expect(archived.body.product.status).toBe('ARCHIVED');
    const hidden = await as(staffCookie).get(`/api/admin/products?q=T-${tag}-ring`);
    expect(hidden.body.items).toHaveLength(0);
    expect(await prisma.product.count({ where: { id: productId } })).toBe(1);
  });

  it('adjusts stock atomically, records movements and never goes below zero', async () => {
    const product = await as(managerCookie).post('/api/admin/products', { title: 'Cufflinks', slug: `t-${tag}-cufflinks` });
    const variant = await as(managerCookie).post(`/api/admin/products/${product.body.product.id}/variants`, {
      sku: `T-${tag}-CUFF`,
      title: 'Silver',
      pricePaisa: 99_900,
    });
    const variantId = variant.body.variant.id;

    const add = await as(managerCookie).post(`/api/admin/variants/${variantId}/inventory`, { delta: 5, reason: 'OPENING_STOCK' });
    expect(add.status).toBe(200);
    expect(add.body.inventory.quantityOnHand).toBe(5);

    const tooMuch = await as(managerCookie).post(`/api/admin/variants/${variantId}/inventory`, { delta: -6, reason: 'DAMAGED' });
    expect(tooMuch.status).toBe(400);

    const zero = await as(managerCookie).post(`/api/admin/variants/${variantId}/inventory`, { delta: 0, reason: 'DAMAGED' });
    expect(zero.status).toBe(400);

    const movements = await as(staffCookie).get(`/api/admin/variants/${variantId}/movements`);
    expect(movements.body.items).toHaveLength(1);
    expect(movements.body.items[0]).toMatchObject({ quantityDelta: 5, reason: 'OPENING_STOCK' });

    const inv = await as(staffCookie).get(`/api/admin/inventory?q=T-${tag}-CUFF`);
    expect(inv.body.items[0]).toMatchObject({ onHand: 5, available: 5, low: false });

    expect(await prisma.auditLog.count({ where: { entityId: variantId, action: 'inventory.adjust' } })).toBe(1);
  });

  it('returns 404 for unknown products', async () => {
    expect((await as(staffCookie).get('/api/admin/products/does-not-exist')).status).toBe(404);
  });
});
