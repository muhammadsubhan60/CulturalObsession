'use client';

import { useEffect } from 'react';
import { clearCart } from '@/lib/cart';

/** On the order page: the order exists, so empty the cart and forget the checkout's idempotency key. */
export function ClearCheckout() {
  useEffect(() => {
    clearCart();
    try {
      window.sessionStorage.removeItem('co.checkout.key');
    } catch {
      // storage unavailable
    }
  }, []);
  return null;
}
