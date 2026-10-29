import { LayoutDashboard } from 'lucide-react';
import { Upcoming } from '@/components/admin/upcoming';

export const metadata = { title: 'Dashboard' };

export default function DashboardPage() {
  return (
    <Upcoming
      title="Dashboard"
      description="Orders to confirm, items to produce and parcels to dispatch."
      icon={LayoutDashboard}
      phase="Phase 5 (admin operations)"
    />
  );
}
