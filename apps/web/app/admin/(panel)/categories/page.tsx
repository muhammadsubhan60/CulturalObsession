import { FolderTree } from 'lucide-react';
import { Upcoming } from '@/components/admin/upcoming';

export const metadata = { title: 'Collections' };

export default function Page() {
  return <Upcoming title="Collections" description="Group products the way the storefront shows them." icon={FolderTree} phase="Phase 1 (catalogue management)" />;
}
