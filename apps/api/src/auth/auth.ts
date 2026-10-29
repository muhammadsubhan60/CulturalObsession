import type { PrismaClient } from '@co/db';
import { betterAuth } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { admin, twoFactor } from 'better-auth/plugins';
import type { Env } from '../env';
import { createAccountLockout } from './lockout';
import { ac, roles } from './roles';

const FIFTEEN_MINUTES = 15 * 60;

const SIGN_IN_PATH = '/sign-in/email';

function emailFromBody(body: unknown): string | null {
  const email = (body as { email?: unknown } | undefined)?.email;
  return typeof email === 'string' && email.length > 0 ? email : null;
}

export function createAuth(env: Env, prisma: PrismaClient) {
  const lockout = createAccountLockout(prisma);

  return betterAuth({
    appName: 'Cultural Obsession Admin',
    baseURL: env.API_URL,
    basePath: '/api/auth',
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.WEB_ORIGIN],
    database: prismaAdapter(prisma, { provider: 'postgresql' }),
    // Staff accounts are created by an owner (or the seed script) — never by public sign-up.
    emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 12, maxPasswordLength: 128 },
    session: { expiresIn: 60 * 60 * 12, updateAge: 60 * 60 },
    plugins: [
      admin({ ac, roles, defaultRole: 'staff', adminRoles: ['owner'] }),
      twoFactor({ issuer: 'Cultural Obsession' }),
    ],
    rateLimit: {
      enabled: true,
      storage: 'database',
      window: 60,
      max: 60,
      customRules: {
        '/sign-in/email': { window: FIFTEEN_MINUTES, max: 5 },
        '/two-factor/verify-totp': { window: FIFTEEN_MINUTES, max: 5 },
        '/two-factor/verify-backup-code': { window: FIFTEEN_MINUTES, max: 5 },
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        const email = ctx.path === SIGN_IN_PATH ? emailFromBody(ctx.body) : null;
        if (!email) return;
        const retryAfter = await lockout.retryAfterSeconds(email);
        if (retryAfter > 0) {
          throw new APIError(
            'TOO_MANY_REQUESTS',
            { message: 'Too many sign-in attempts. Try again later.' },
            { 'Retry-After': String(retryAfter) },
          );
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        const email = ctx.path === SIGN_IN_PATH ? emailFromBody(ctx.body) : null;
        if (!email) return;
        const returned = ctx.context.returned;
        const failed = returned instanceof APIError && returned.statusCode === 401;
        if (failed) await lockout.recordFailure(email);
        else if (!(returned instanceof APIError)) await lockout.clear(email);
      }),
    },
    advanced: {
      useSecureCookies: env.NODE_ENV === 'production',
      ...(env.COOKIE_DOMAIN ? { crossSubDomainCookies: { enabled: true, domain: env.COOKIE_DOMAIN } } : {}),
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
