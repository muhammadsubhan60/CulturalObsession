import { getStaffUser } from '@/lib/staff-session';
import { DashboardScreen } from './dashboard-screen';

export const metadata = { title: 'Dashboard' };

export default async function DashboardPage() {
  const user = await getStaffUser();
  return <DashboardScreen name={user?.name ?? ''} />;
}
