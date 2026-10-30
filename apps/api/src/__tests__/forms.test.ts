import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { makeTestApp } from './helpers';

const { app, prisma } = makeTestApp();
const tag = randomUUID().slice(0, 8);
const ip = (n: number) => `198.51.${tag.charCodeAt(1) % 200}.${n}`;
const TOKEN = 'internal-test-token-internal-test-token-0000';

afterAll(async () => {
  await prisma.contactSubmission.deleteMany({ where: { email: { endsWith: `${tag}@test.local` } } });
});

describe('storefront forms', () => {
  it('stores a contact message with a normalised phone number', async () => {
    const res = await request(app)
      .post('/api/store/contact')
      
      .set('X-Internal-Token', TOKEN)
      .set('X-Shopper-IP', ip(1))
      .send({ name: 'Ayesha', email: `Ayesha-${tag}@test.local`, phone: '0300-1234567', message: 'Can you engrave Urdu?' });
    expect(res.status).toBe(201);
    const row = await prisma.contactSubmission.findFirst({ where: { email: `ayesha-${tag}@test.local` } });
    expect(row).toMatchObject({ kind: 'CONTACT', phone: '+923001234567', message: 'Can you engrave Urdu?' });
  });

  it('rejects an invalid email with 400', async () => {
    const res = await request(app).post('/api/store/contact')
      .set('X-Internal-Token', TOKEN)
      .set('X-Shopper-IP', ip(2)).send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(res.body.fields[0].path).toBe('email');
  });

  it('subscribes an email once', async () => {
    for (let i = 0; i < 2; i++) {
      expect((await request(app).post('/api/store/newsletter')
      .set('X-Internal-Token', TOKEN)
      .set('X-Shopper-IP', ip(3)).send({ email: `news-${tag}@test.local` })).status).toBe(201);
    }
    expect(await prisma.contactSubmission.count({ where: { email: `news-${tag}@test.local` } })).toBe(1);
  });

  it('ignores X-Shopper-IP without the internal token, so callers cannot rotate it', async () => {
    const codes = [];
    for (let i = 0; i < 6; i++) {
      codes.push(
        (await request(app).post('/api/store/newsletter').set('X-Forwarded-For', `203.0.113.${tag.charCodeAt(2) % 200}`).set('X-Shopper-IP', `10.0.0.${i}`).send({ email: `rot${i}-${tag}@test.local` })).status,
      );
    }
    expect(codes[5]).toBe(429);
  });

  it('limits submissions to 5 per minute per shopper', async () => {
    const codes = [];
    for (let i = 0; i < 6; i++) {
      codes.push((await request(app).post('/api/store/newsletter')
      .set('X-Internal-Token', TOKEN)
      .set('X-Shopper-IP', ip(4)).send({ email: `spam${i}-${tag}@test.local` })).status);
    }
    expect(codes.slice(0, 5).every((c) => c === 201)).toBe(true);
    expect(codes[5]).toBe(429);
  });
});
