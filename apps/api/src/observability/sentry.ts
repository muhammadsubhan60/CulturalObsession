import * as Sentry from '@sentry/node';

/**
 * Error reporting. Off unless SENTRY_DSN is set. Request bodies, cookies and auth headers are
 * stripped before anything leaves the server, so customer details and sessions never reach Sentry.
 */
export function initSentry(dsn: string | undefined, environment: string) {
  if (!dsn) return false;
  Sentry.init({
    dsn,
    environment,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend(event) {
      if (event.request) {
        delete event.request.cookies;
        delete event.request.data;
        delete event.request.query_string;
        if (event.request.headers) {
          for (const h of Object.keys(event.request.headers)) {
            if (/cookie|authorization|token|x-shopper-ip/i.test(h)) delete event.request.headers[h];
          }
        }
      }
      return event;
    },
  });
  return true;
}

export function captureError(err: unknown, context: Record<string, unknown> = {}) {
  Sentry.captureException(err, { extra: context });
}

export const flushSentry = (ms = 2000) => Sentry.flush(ms);
