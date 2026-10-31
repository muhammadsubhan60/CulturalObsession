import { getStaffUser } from '@/lib/staff-session';
import { PaymentsSettings } from './payments-settings';

export const metadata = { title: 'Payments & advance' };

export default async function Page() {
  const user = await getStaffUser();
  return <PaymentsSettings canEdit={user?.role === 'owner' || user?.role === 'manager'} />;
}
