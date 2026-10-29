import type { PrismaClient } from '@co/db';

export const LOCKOUT_MAX_FAILURES = 10;
export const LOCKOUT_WINDOW_SECONDS = 15 * 60;

/**
 * Per-account sign-in lockout, independent of the per-IP rate limit, so rotating IPs
 * cannot brute-force one account. Counters share Better Auth's rateLimit table.
 */
export function createAccountLockout(prisma: PrismaClient, now: () => number = Date.now) {
  const keyFor = (email: string) => `signin-fail:${email.trim().toLowerCase()}`;
  const windowMs = LOCKOUT_WINDOW_SECONDS * 1000;

  return {
    /** Seconds until the account unlocks, or 0 when sign-in may proceed. */
    async retryAfterSeconds(email: string): Promise<number> {
      const row = await prisma.rateLimit.findUnique({ where: { key: keyFor(email) } });
      if (!row || row.count < LOCKOUT_MAX_FAILURES) return 0;
      const remaining = Number(row.lastRequest) + windowMs - now();
      return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
    },

    async recordFailure(email: string): Promise<void> {
      const key = keyFor(email);
      const at = BigInt(now());
      const row = await prisma.rateLimit.findUnique({ where: { key } });
      // The window starts at the first failure; an expired window starts over.
      if (!row || Number(row.lastRequest) + windowMs <= now()) {
        await prisma.rateLimit.upsert({ where: { key }, create: { key, count: 1, lastRequest: at }, update: { count: 1, lastRequest: at } });
      } else {
        await prisma.rateLimit.update({ where: { key }, data: { count: { increment: 1 } } });
      }
    },

    async clear(email: string): Promise<void> {
      await prisma.rateLimit.deleteMany({ where: { key: keyFor(email) } });
    },
  };
}
