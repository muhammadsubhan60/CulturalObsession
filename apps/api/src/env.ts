import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  /** Public URL of this API, e.g. https://api.culturalobsession.deltalabs.tech */
  API_URL: z.url(),
  /** Storefront/admin origin, e.g. https://culturalobsession.deltalabs.tech */
  WEB_ORIGIN: z.url(),
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32),
  /** Parent domain shared by web and api so admin cookies reach both (e.g. culturalobsession.deltalabs.tech). */
  COOKIE_DOMAIN: z.string().min(1).optional(),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Invalid environment: ${fields}`);
  }
  return parsed.data;
}
