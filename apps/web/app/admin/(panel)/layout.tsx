import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AdminShell } from '@/components/admin/admin-shell';
import { getStaffUser } from '@/lib/staff-session';

// Every admin request re-checks the session with the API; nothing here is cached.
export const dynamic = 'force-dynamic';

export default async function PanelLayout({ children }: { children: ReactNode }) {
  const user = await getStaffUser();
  if (!user) redirect('/admin/login');
  return <AdminShell user={user}>{children}</AdminShell>;
}
