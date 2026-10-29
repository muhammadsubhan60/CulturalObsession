import { getPrisma } from '@co/db';
import { createApp } from './app';
import { createAuth } from './auth/auth';
import { loadEnv } from './env';

const env = loadEnv();
const auth = createAuth(env, getPrisma());
createApp(env, { auth }).listen(env.PORT, () => {
  console.log(`api listening on :${env.PORT}`);
});
