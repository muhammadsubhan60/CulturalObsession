import { Boxes } from 'lucide-react';
import { Upcoming } from '@/components/admin/upcoming';

export const metadata = { title: 'Inventory' };

export default function Page() {
  return <Upcoming title="Inventory" description="Stock for ready-made items. Made-to-order items are not counted." icon={Boxes} phase="Phase 1 (catalogue management)" />;
}
