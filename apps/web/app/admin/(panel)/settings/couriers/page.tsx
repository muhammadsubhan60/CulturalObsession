import { Truck } from 'lucide-react';
import { Upcoming } from '@/components/admin/upcoming';

export const metadata = { title: 'Couriers' };

export default function Page() {
  return <Upcoming title="Couriers" description="Delivery partners and tracking links." icon={Truck} phase="Phase 5 (settings)" />;
}
