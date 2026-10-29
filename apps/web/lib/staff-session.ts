import 'server-only';
import { cookies } from 'next/headers';
import { API_URL } from './env';

export type StaffUser = { id: string; name: string; email: string; role: 'owner' | 'manager' | 'staff' };

/**
 * Asks the API who is signed in. The API re-checks the session and role on every
 * request; this only decides which admin screen to render.
 */
export async function getStaffUser(): Promise<StaffUser | null> {
  const cookie = (await cookies()).toString();
  if (!cookie) return null;
  const res = await fetch(`${API_URL}/api/admin/me`, { headers: { cookie }, cache: 'no-store' });
  if (res.status === 401 || res.status === 403) return null;
  if (!res.ok) throw new Error(`Session check failed (${res.status})`);
  return ((await res.json()) as { user: StaffUser }).user;
}
