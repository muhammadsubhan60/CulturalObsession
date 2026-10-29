import type { RequestHandler } from 'express';

/**
 * Better Auth answers rate-limited requests with 429 + `X-Retry-After`.
 * Clients and proxies expect the standard `Retry-After`, so mirror it.
 */
export const standardRetryAfter: RequestHandler = (_req, res, next) => {
  const writeHead = res.writeHead;
  res.writeHead = function patchedWriteHead(this: typeof res, statusCode: number, ...rest: unknown[]) {
    if (statusCode === 429) {
      const headers = rest.find((arg): arg is Record<string, unknown> => !!arg && typeof arg === 'object' && !Array.isArray(arg));
      const fromArgs = headers && Object.entries(headers).find(([k]) => k.toLowerCase() === 'x-retry-after')?.[1];
      const value = fromArgs ?? res.getHeader('x-retry-after');
      if (value !== undefined && !res.hasHeader('retry-after')) {
        if (headers) headers['Retry-After'] = String(value);
        else res.setHeader('Retry-After', String(value));
      }
    }
    return (writeHead as (...args: unknown[]) => typeof res).call(this, statusCode, ...rest);
  } as typeof res.writeHead;
  next();
};
