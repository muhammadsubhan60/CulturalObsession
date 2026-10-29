import { toNodeHandler } from 'better-auth/node';
import cors from 'cors';
import express, { type ErrorRequestHandler } from 'express';
import helmet from 'helmet';
import type { Auth } from './auth/auth';
import type { Env } from './env';
import { requireStaff, type StaffSession } from './http/require-staff';
import { standardRetryAfter } from './http/retry-after';

export function createApp(env: Env, deps: { auth: Auth }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: [env.WEB_ORIGIN], credentials: true, exposedHeaders: ['Retry-After'] }));

  // Better Auth reads the raw body itself, so it is mounted before express.json().
  app.all('/api/auth/{*splat}', standardRetryAfter, toNodeHandler(deps.auth));

  app.use(express.json({ limit: '100kb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/api/admin/me', requireStaff(deps.auth), (_req, res) => {
    const { user } = res.locals.session as StaffSession;
    res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  });

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  const onError: ErrorRequestHandler = (err, req, res, _next) => {
    console.error(JSON.stringify({ level: 'error', path: req.path, message: err instanceof Error ? err.message : String(err) }));
    res.status(500).json({ error: 'Something went wrong' });
  };
  app.use(onError);

  return app;
}
