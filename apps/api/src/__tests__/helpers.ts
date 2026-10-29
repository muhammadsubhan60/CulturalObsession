import { getPrisma } from '@co/db';
import { createApp } from '../app';
import { createAuth } from '../auth/auth';
import { loadEnv } from '../env';
import { createS3Storage } from '../storage/s3';

export const WEB_ORIGIN = 'https://shop.example.pk';

export function makeTestApp() {
  const env = loadEnv({
    NODE_ENV: 'test',
    API_URL: 'http://127.0.0.1:4000',
    WEB_ORIGIN,
    DATABASE_URL: process.env.DATABASE_URL,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? 'test-secret-test-secret-test-secret-1234',
    // Local SeaweedFS from docker-compose.dev.yml (CI starts the same container).
    S3_BUCKET: process.env.S3_BUCKET ?? 'co-test-media',
    S3_REGION: 'us-east-1',
    S3_ENDPOINT: process.env.S3_ENDPOINT ?? 'http://127.0.0.1:8333',
    S3_FORCE_PATH_STYLE: 'true',
    S3_ACCESS_KEY_ID: 'co_local',
    S3_SECRET_ACCESS_KEY: 'co_local_secret',
    MEDIA_PUBLIC_URL: 'http://127.0.0.1:8333/co-test-media',
  });
  const prisma = getPrisma();
  const auth = createAuth(env, prisma);
  const storage = createS3Storage(env);
  return { app: createApp(env, { auth, prisma, storage }), auth, prisma, env, storage };
}
