import { ReceiptText } from 'lucide-react';
import { Upcoming } from '@/components/admin/upcoming';

export const metadata = { title: 'Orders' };

export default function Page() {
  return <Upcoming title="Orders" description="Website, WhatsApp and admin orders in one inbox." icon={ReceiptText} phase="Phase 5 (admin operations)" />;
}
