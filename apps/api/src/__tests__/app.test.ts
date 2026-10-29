import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { loadEnv } from '../env';

const env = loadEnv({ NODE_ENV: 'test', WEB_ORIGIN: 'https://shop.example.pk' });

describe('api app', () => {
  it('reports health', async () => {
    const res = await request(createApp(env)).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('allows only the web origin', async () => {
    const ok = await request(createApp(env)).get('/health').set('Origin', 'https://shop.example.pk');
    expect(ok.headers['access-control-allow-origin']).toBe('https://shop.example.pk');
    const bad = await request(createApp(env)).get('/health').set('Origin', 'https://evil.example');
    expect(bad.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('returns JSON 404 and hides x-powered-by', async () => {
    const res = await request(createApp(env)).get('/nope');
    expect(res.status).toBe(404);
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('rejects a missing WEB_ORIGIN', () => {
    expect(() => loadEnv({})).toThrow(/WEB_ORIGIN/);
  });
});
