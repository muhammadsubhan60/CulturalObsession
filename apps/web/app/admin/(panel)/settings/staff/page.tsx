import { notFound } from 'next/navigation';
import { getStaffUser } from '@/lib/staff-session';
import { StaffSettings } from './staff-settings';

export const metadata = { title: 'Staff' };

export default async function Page() {
  // Display gate only — the API's staff-management endpoints independently require the owner role.
  const user = await getStaffUser();
  if (user?.role !== 'owner') notFound();
  return <StaffSettings meId={user.id} />;
}
