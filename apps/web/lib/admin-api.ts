'use client';

import { API_URL } from './env';

export type FieldError = { path: string; message: string };

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly fields: FieldError[] = [],
    readonly retryAfter: number | null = null,
  ) {
    super(message);
  }
}

/** Calls the admin API with the staff cookie. 401 sends the user back to sign-in. */
export async function adminApi<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/admin${path}`, {
      method: init.method ?? 'GET',
      credentials: 'include',
      headers: init.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Could not reach the server. Check your connection and try again.');
  }
  if (res.status === 401) {
    window.location.assign('/admin/login');
    throw new ApiError(401, 'Your session has ended. Please sign in again.');
  }
  if (res.status === 204) return undefined as T;
  const body = (await res.json().catch(() => ({}))) as { error?: string; fields?: FieldError[] };
  if (!res.ok) {
    const retry = res.headers.get('Retry-After');
    throw new ApiError(res.status, messageFor(res.status, body.error, retry), body.fields ?? [], retry ? Number(retry) : null);
  }
  return body as T;
}

function messageFor(status: number, error: string | undefined, retryAfter: string | null): string {
  if (status === 403) return "You don't have permission to do that.";
  if (status === 404) return 'That item no longer exists.';
  if (status === 409) return 'Something with that value already exists.';
  if (status === 429) return `Too many requests. Try again in ${retryAfter ?? 'a few'} seconds.`;
  if (status === 400) return error === 'Invalid input' ? 'Please fix the highlighted fields.' : (error ?? 'Please check your input.');
  return 'Something went wrong, please try again.';
}

/** Field errors keyed by top-level field name, from either the server or a client-side Zod parse. */
export function fieldMap(fields: FieldError[]): Record<string, string> {
  return Object.fromEntries(fields.map((f) => [f.path.split('.')[0] ?? f.path, f.message]));
}
