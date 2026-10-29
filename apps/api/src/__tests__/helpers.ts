import { getPrisma } from '@co/db';
import { createApp } from '../app';
import { createAuth } from '../auth/auth';
import { loadEnv } from '../env';

export const WEB_ORIGIN = 'https://shop.example.pk';

export function makeTestApp() {
  const env = loadEnv({
    NODE_ENV: 'test',
    API_URL: 'http://127.0.0.1:4000',
    WEB_ORIGIN,
    DATABASE_URL: process.env.DATABASE_URL,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? 'test-secret-test-secret-test-secret-1234',
  });
  const prisma = getPrisma();
  const auth = createAuth(env, prisma);
  return { app: createApp(env, { auth, prisma }), auth, prisma, env };
}
