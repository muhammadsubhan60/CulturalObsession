import { UserCog } from 'lucide-react';
import { notFound } from 'next/navigation';
import { Upcoming } from '@/components/admin/upcoming';
import { getStaffUser } from '@/lib/staff-session';

export const metadata = { title: 'Staff' };

export default async function Page() {
  // Display gate only — the API's staff-management endpoints independently require the owner role.
  if ((await getStaffUser())?.role !== 'owner') notFound();
  return (
    <Upcoming title="Staff" description="Who can sign in to this admin and what they can do." icon={UserCog} phase="Phase 5 (settings)" />
  );
}
