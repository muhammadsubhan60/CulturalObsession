import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly fields?: Array<{ path: string; message: string }>,
  ) {
    super(message);
  }
}

export const notFound = (what = 'Resource') => new HttpError(404, `${what} not found`);

/** Lets async route handlers throw; Express 5 forwards rejections, this keeps types tidy. */
export function handle(fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}

type PrismaLikeError = { code?: string; meta?: { target?: unknown; modelName?: string }; message?: string };

/** Turns validation, Prisma and constraint errors into safe client responses; everything else is a 500. */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, ...(err.fields ? { fields: err.fields } : {}) });
    return;
  }
  if (err instanceof ZodError) {
    log('warn', req, 'validation failed', { fields: err.issues.map((i) => i.path.join('.')) });
    res.status(400).json({
      error: 'Invalid input',
      fields: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
    return;
  }
  const e = err as PrismaLikeError;
  if (e?.code === 'P2002') {
    res.status(409).json({ error: 'Already exists', fields: fieldsOf(e.meta?.target) });
    return;
  }
  if (e?.code === 'P2025') {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  if (e?.code === 'P2003') {
    res.status(400).json({ error: 'Refers to something that does not exist' });
    return;
  }
  if (typeof e?.message === 'string' && /_chk\b|violates check constraint/.test(e.message)) {
    res.status(400).json({ error: 'Value not allowed', constraint: e.message.match(/"?(\w+_chk)"?/)?.[1] });
    return;
  }
  log('error', req, err instanceof Error ? err.message : String(err));
  res.status(500).json({ error: 'Something went wrong' });
};

function fieldsOf(target: unknown): string[] {
  if (Array.isArray(target)) return target.map(String);
  if (typeof target === 'string') return [target];
  return [];
}

export function log(level: 'info' | 'warn' | 'error', req: Request, message: string, extra: Record<string, unknown> = {}) {
  const userId = (req.res?.locals.session as { user?: { id?: string } } | undefined)?.user?.id;
  console[level === 'info' ? 'log' : level](
    JSON.stringify({ level, time: new Date().toISOString(), method: req.method, path: req.path, userId, message, ...extra }),
  );
}
