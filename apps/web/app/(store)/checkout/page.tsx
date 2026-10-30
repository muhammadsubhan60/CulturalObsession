import { CheckoutPage } from '@/components/store/checkout/checkout-page';
import { StoreChrome } from '@/components/store/chrome';

export const metadata = { title: 'Checkout', robots: { index: false } };

export default function Checkout() {
  return (
    <StoreChrome template="cart">
      <CheckoutPage />
    </StoreChrome>
  );
}
