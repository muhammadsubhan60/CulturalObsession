import { CartPage } from '@/components/store/cart/cart-page';
import { StoreChrome } from '@/components/store/chrome';

export const metadata = { title: 'Your Shopping Cart', robots: { index: false } };

export default function Cart() {
  return (
    <StoreChrome template="cart" currentPath="/cart">
      <CartPage />
    </StoreChrome>
  );
}
