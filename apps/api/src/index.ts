import { getPrisma } from '@co/db';
import { createApp } from './app';
import { createAuth } from './auth/auth';
import { loadEnv } from './env';
import { createS3Storage } from './storage/s3';

const env = loadEnv();
const prisma = getPrisma();
const auth = createAuth(env, prisma);
const storage = createS3Storage(env);
if (!storage) console.warn('S3_BUCKET / MEDIA_PUBLIC_URL not set: image uploads are disabled');
createApp(env, { auth, prisma, storage }).listen(env.PORT, () => {
  console.log(`api listening on :${env.PORT}`);
});
