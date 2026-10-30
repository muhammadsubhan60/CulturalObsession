import { TrackOrder } from '@/components/store/checkout/track-order';
import { StoreChrome } from '@/components/store/chrome';

export const metadata = { title: 'Track your order', robots: { index: false } };

export default function TrackOrderPage() {
  return (
    <StoreChrome template="contact" currentPath="/track-order">
      <TrackOrder />
    </StoreChrome>
  );
}
