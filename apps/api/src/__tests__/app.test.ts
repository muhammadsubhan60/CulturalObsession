import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { loadEnv } from '../env';
import { makeTestApp, WEB_ORIGIN } from './helpers';

const { app } = makeTestApp();

describe('api app', () => {
  it('reports health', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('allows only the web origin', async () => {
    const ok = await request(app).get('/health').set('Origin', WEB_ORIGIN);
    expect(ok.headers['access-control-allow-origin']).toBe(WEB_ORIGIN);
    const bad = await request(app).get('/health').set('Origin', 'https://evil.example');
    expect(bad.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('returns JSON 404 and hides x-powered-by', async () => {
    const res = await request(app).get('/nope');
    expect(res.status).toBe(404);
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('rejects missing or weak configuration', () => {
    expect(() => loadEnv({})).toThrow(/WEB_ORIGIN/);
    expect(() =>
      loadEnv({ API_URL: 'http://a.test', WEB_ORIGIN: 'http://b.test', DATABASE_URL: 'x', BETTER_AUTH_SECRET: 'short' }),
    ).toThrow(/BETTER_AUTH_SECRET/);
  });
});
