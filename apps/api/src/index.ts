import { getPrisma } from '@co/db';
import { createApp } from './app';
import { createAuth } from './auth/auth';
import { loadEnv } from './env';

const env = loadEnv();
const prisma = getPrisma();
const auth = createAuth(env, prisma);
createApp(env, { auth, prisma }).listen(env.PORT, () => {
  console.log(`api listening on :${env.PORT}`);
});
