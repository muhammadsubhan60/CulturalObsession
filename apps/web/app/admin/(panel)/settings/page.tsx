import { getStaffUser } from '@/lib/staff-session';
import { StoreSettings } from './store-settings';

export const metadata = { title: 'Store settings' };

export default async function Page() {
  const user = await getStaffUser();
  return <StoreSettings canEdit={user?.role === 'owner' || user?.role === 'manager'} />;
}
