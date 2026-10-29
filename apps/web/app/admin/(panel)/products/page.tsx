import { Gem } from 'lucide-react';
import { Upcoming } from '@/components/admin/upcoming';

export const metadata = { title: 'Products' };

export default function Page() {
  return <Upcoming title="Products" description="Catalogue, variants, prices and personalization." icon={Gem} phase="Phase 1 (catalogue management)" />;
}
