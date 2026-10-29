import { createApp } from './app';
import { loadEnv } from './env';

const env = loadEnv();
createApp(env).listen(env.PORT, () => {
  console.log(`api listening on :${env.PORT}`);
});
