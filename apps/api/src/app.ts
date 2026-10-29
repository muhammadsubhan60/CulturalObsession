import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import type { Env } from './env';

export function createApp(env: Env) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: [env.WEB_ORIGIN], credentials: true }));
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  return app;
}
