import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createStaffUser } from '../auth/staff';
import { makeTestApp, WEB_ORIGIN } from './helpers';

const { app, auth, prisma } = makeTestApp();
const tag = randomUUID().slice(0, 8);
const password = `correct-horse-${tag}`;
const ownerEmail = `owner-${tag}@test.local`;
const staffEmail = `staff-${tag}@test.local`;
let ip = 0;
// Each test gets its own client IP so rate-limit counters never leak between tests.
const nextIp = () => `10.${tag.charCodeAt(0) % 250}.${Math.floor(++ip / 250)}.${ip % 250}`;

function signIn(email: string, pass: string, clientIp = nextIp()) {
  return request(app)
    .post('/api/auth/sign-in/email')
    .set('Origin', WEB_ORIGIN)
    .set('X-Forwarded-For', clientIp)
    .send({ email, password: pass });
}

beforeAll(async () => {
  await createStaffUser(auth, { email: ownerEmail, name: 'Owner', password, role: 'owner' });
  await createStaffUser(auth, { email: staffEmail, name: 'Staff', password, role: 'staff' });
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { in: [ownerEmail, staffEmail, `new-${tag}@test.local`] } } });
  await prisma.rateLimit.deleteMany({ where: { key: { startsWith: `10.${tag.charCodeAt(0) % 250}.` } } });
});

describe('admin auth', () => {
  it('has public sign-up disabled', async () => {
    const res = await request(app)
      .post('/api/auth/sign-up/email')
      .set('Origin', WEB_ORIGIN)
      .set('X-Forwarded-For', nextIp())
      .send({ email: `new-${tag}@test.local`, password, name: 'Intruder' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await prisma.user.count({ where: { email: `new-${tag}@test.local` } })).toBe(0);
  });

  it('refuses a wrong password without revealing which part was wrong', async () => {
    const res = await signIn(ownerEmail, 'not-the-password-123');
    expect(res.status).toBe(401);
    expect(JSON.stringify(res.body)).not.toMatch(/password_hash|scrypt/);
  });

  it('signs in with an httpOnly session cookie and never returns the token in a cookie-less form', async () => {
    const res = await signIn(ownerEmail, password);
    expect(res.status).toBe(200);
    const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
    const session = cookies.find((c) => c.includes('session_token'));
    expect(session).toMatch(/HttpOnly/i);
    expect(session).toMatch(/SameSite=Lax/i);
  });

  it('protects admin routes and reports the staff role', async () => {
    expect((await request(app).get('/api/admin/me')).status).toBe(401);

    const login = await signIn(staffEmail, password);
    const cookie = ([] as string[]).concat(login.headers['set-cookie'] ?? []);
    const me = await request(app).get('/api/admin/me').set('Cookie', cookie);
    expect(me.status).toBe(200);
    expect(me.body.user).toMatchObject({ email: staffEmail, role: 'staff' });
  });

  it('lets only owners use staff-management endpoints', async () => {
    const staffCookie = ([] as string[]).concat((await signIn(staffEmail, password)).headers['set-cookie'] ?? []);
    const denied = await request(app).get('/api/auth/admin/list-users').set('Origin', WEB_ORIGIN).set('Cookie', staffCookie);
    expect(denied.status).toBe(403);

    const ownerCookie = ([] as string[]).concat((await signIn(ownerEmail, password)).headers['set-cookie'] ?? []);
    const allowed = await request(app).get('/api/auth/admin/list-users').set('Origin', WEB_ORIGIN).set('Cookie', ownerCookie);
    expect(allowed.status).toBe(200);
  });

  it('rate-limits sign-in to 5 attempts per 15 minutes with 429 + Retry-After', async () => {
    const clientIp = nextIp();
    for (let i = 0; i < 5; i++) {
      expect((await signIn(ownerEmail, 'wrong-password-xyz', clientIp)).status).toBe(401);
    }
    const blocked = await signIn(ownerEmail, password, clientIp);
    expect(blocked.status).toBe(429);
    const retryAfter = Number(blocked.headers['retry-after']);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(15 * 60);
  });

  it('rejects staff passwords shorter than 12 characters', async () => {
    await expect(
      createStaffUser(auth, { email: `short-${tag}@test.local`, name: 'S', password: 'short', role: 'staff' }),
    ).rejects.toThrow(/12 characters/);
  });
});

describe('per-account lockout', () => {
  it('locks an account after 10 failures from different IPs and keeps it locked for the right password', async () => {
    const email = `locked-${tag}@test.local`;
    await createStaffUser(auth, { email, name: 'Locked', password, role: 'staff' });
    try {
      for (let i = 0; i < 10; i++) {
        expect((await signIn(email, 'wrong-password-xyz')).status).toBe(401);
      }
      const blocked = await signIn(email, password);
      expect(blocked.status).toBe(429);
      expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    } finally {
      await prisma.user.deleteMany({ where: { email } });
      await prisma.rateLimit.deleteMany({ where: { key: `signin-fail:${email}` } });
    }
  });

  it('clears the failure counter after a successful sign-in', async () => {
    const email = `recover-${tag}@test.local`;
    await createStaffUser(auth, { email, name: 'Recover', password, role: 'staff' });
    try {
      for (let i = 0; i < 3; i++) await signIn(email, 'wrong-password-xyz');
      expect((await signIn(email, password)).status).toBe(200);
      expect(await prisma.rateLimit.count({ where: { key: `signin-fail:${email}` } })).toBe(0);
    } finally {
      await prisma.user.deleteMany({ where: { email } });
    }
  });
});
