import { Users } from 'lucide-react';
import { Upcoming } from '@/components/admin/upcoming';

export const metadata = { title: 'Customers' };

export default function Page() {
  return <Upcoming title="Customers" description="Everyone who has ordered, by phone number." icon={Users} phase="Phase 5 (admin operations)" />;
}
