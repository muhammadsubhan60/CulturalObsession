import { getStaffUser } from '@/lib/staff-session';
import { CouriersSettings } from './couriers-settings';

export const metadata = { title: 'Couriers' };

export default async function Page() {
  const user = await getStaffUser();
  return <CouriersSettings canEdit={user?.role === 'owner' || user?.role === 'manager'} />;
}
