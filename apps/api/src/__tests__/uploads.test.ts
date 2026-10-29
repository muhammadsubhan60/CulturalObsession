import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createStaffUser } from '../auth/staff';
import { sniffImageType } from '../uploads/images';
import { makeTestApp, WEB_ORIGIN } from './helpers';

const { app, auth, prisma, env, storage } = makeTestApp();
const tag = randomUUID().slice(0, 8);
const password = `upload-pass-${tag}`;
const managerEmail = `umanager-${tag}@test.local`;
const staffEmail = `ustaff-${tag}@test.local`;
let manager: string[] = [];
let staff: string[] = [];
let productId = '';

// Smallest valid PNG (1×1 transparent pixel).
const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082',
  'hex',
);

async function login(email: string) {
  const res = await request(app)
    .post('/api/auth/sign-in/email')
    .set('Origin', WEB_ORIGIN)
    .set('X-Forwarded-For', `10.98.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`)
    .send({ email, password });
  return ([] as string[]).concat(res.headers['set-cookie'] ?? []);
}

async function presignAndPut(body: Buffer, contentType: string) {
  const presign = await request(app)
    .post('/api/admin/uploads/product-images')
    .set('Cookie', manager)
    .send({ contentType, size: body.length });
  expect(presign.status).toBe(201);
  const put = await fetch(presign.body.uploadUrl, { method: 'PUT', headers: presign.body.headers, body: new Uint8Array(body) });
  expect(put.ok).toBe(true);
  return presign.body.key as string;
}

beforeAll(async () => {
  const s3 = new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    forcePathStyle: true,
    credentials: { accessKeyId: env.S3_ACCESS_KEY_ID!, secretAccessKey: env.S3_SECRET_ACCESS_KEY! },
  });
  await s3.send(new CreateBucketCommand({ Bucket: env.S3_BUCKET! })).catch(() => undefined);
  await createStaffUser(auth, { email: managerEmail, name: 'M', password, role: 'manager' });
  await createStaffUser(auth, { email: staffEmail, name: 'S', password, role: 'staff' });
  manager = await login(managerEmail);
  staff = await login(staffEmail);
  const product = await request(app).post('/api/admin/products').set('Cookie', manager).send({ title: 'Upload test', slug: `t-${tag}-upload` });
  productId = product.body.product.id;
});

afterAll(async () => {
  await prisma.product.deleteMany({ where: { slug: { startsWith: `t-${tag}` } } });
  await prisma.user.deleteMany({ where: { email: { in: [managerEmail, staffEmail] } } });
});

describe('image sniffing', () => {
  it('detects formats by content, not by name', () => {
    expect(sniffImageType(PNG)).toBe('image/png');
    expect(sniffImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffImageType(Buffer.from('RIFF\0\0\0\0WEBPVP8 '))).toBe('image/webp');
    expect(sniffImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull();
  });
});

describe('product image uploads', () => {
  it('only lets owners and managers request upload URLs, for allowed types and sizes', async () => {
    const asStaff = await request(app).post('/api/admin/uploads/product-images').set('Cookie', staff).send({ contentType: 'image/png', size: 100 });
    expect(asStaff.status).toBe(403);
    const svg = await request(app).post('/api/admin/uploads/product-images').set('Cookie', manager).send({ contentType: 'image/svg+xml', size: 100 });
    expect(svg.status).toBe(400);
    const huge = await request(app).post('/api/admin/uploads/product-images').set('Cookie', manager).send({ contentType: 'image/jpeg', size: 6 * 1024 * 1024 });
    expect(huge.status).toBe(400);
  });

  it('renames uploads to a UUID key and attaches a real image', async () => {
    const key = await presignAndPut(PNG, 'image/png');
    expect(key).toMatch(/^products\/[0-9a-f-]{36}\.png$/);
    const attach = await request(app).post(`/api/admin/products/${productId}/images`).set('Cookie', manager).send({ key, altText: 'Front' });
    expect(attach.status).toBe(201);
    expect(attach.body.image.url).toBe(`${env.MEDIA_PUBLIC_URL}/${key}`);
    const detail = await request(app).get(`/api/admin/products/${productId}`).set('Cookie', staff);
    expect(detail.body.product.images[0]).toMatchObject({ s3Key: key, altText: 'Front' });
  });

  it('rejects and deletes a file whose bytes are not the image it claims to be', async () => {
    const key = await presignAndPut(Buffer.from('<?php echo "not an image"; ?>'), 'image/png');
    const attach = await request(app).post(`/api/admin/products/${productId}/images`).set('Cookie', manager).send({ key });
    expect(attach.status).toBe(400);
    expect(await storage!.head(key)).toBeNull();
  });

  it('refuses keys that were not issued by the upload endpoint', async () => {
    const res = await request(app).post(`/api/admin/products/${productId}/images`).set('Cookie', manager).send({ key: '../../etc/passwd' });
    expect(res.status).toBe(400);
  });

  it('reorders and deletes images, removing the stored file', async () => {
    const a = await presignAndPut(PNG, 'image/png');
    const imgA = (await request(app).post(`/api/admin/products/${productId}/images`).set('Cookie', manager).send({ key: a })).body.image;
    const all = (await request(app).get(`/api/admin/products/${productId}`).set('Cookie', manager)).body.product.images as { id: string }[];
    const reversed = all.map((i) => i.id).reverse();
    expect((await request(app).put(`/api/admin/products/${productId}/images/order`).set('Cookie', manager).send({ imageIds: reversed })).status).toBe(204);
    const after = (await request(app).get(`/api/admin/products/${productId}`).set('Cookie', manager)).body.product.images as { id: string }[];
    expect(after.map((i) => i.id)).toEqual(reversed);

    expect((await request(app).delete(`/api/admin/images/${imgA.id}`).set('Cookie', manager)).status).toBe(204);
    expect(await storage!.head(a)).toBeNull();
  });
});
