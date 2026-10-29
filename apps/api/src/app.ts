import { toNodeHandler } from 'better-auth/node';
import cors from 'cors';
import type { PrismaClient } from '@co/db';
import express from 'express';
import helmet from 'helmet';
import type { Auth } from './auth/auth';
import { catalogRouter } from './catalog/routes';
import type { Env } from './env';
import { errorHandler } from './http/errors';
import { requireStaff, type StaffSession } from './http/require-staff';
import { standardRetryAfter } from './http/retry-after';

export function createApp(env: Env, deps: { auth: Auth; prisma: PrismaClient }) {
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

  app.use('/api/admin', catalogRouter(deps));

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use(errorHandler);

  return app;
}
