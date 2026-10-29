import { CreditCard } from 'lucide-react';
import { Upcoming } from '@/components/admin/upcoming';

export const metadata = { title: 'Payments & advance' };

export default function Page() {
  return <Upcoming title="Payments & advance" description="Advance payment rules and the accounts customers pay into." icon={CreditCard} phase="Phase 5 (settings)" />;
}
