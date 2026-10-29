import { Settings } from 'lucide-react';
import { Upcoming } from '@/components/admin/upcoming';

export const metadata = { title: 'Store settings' };

export default function Page() {
  return <Upcoming title="Store settings" description="Order numbers, shipping defaults and notifications." icon={Settings} phase="Phase 5 (settings)" />;
}
