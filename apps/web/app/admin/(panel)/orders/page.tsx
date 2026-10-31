import { Suspense } from 'react';
import { OrdersScreen } from './orders-screen';

export const metadata = { title: 'Orders' };

export default function Page() {
  return (
    <Suspense>
      <OrdersScreen />
    </Suspense>
  );
}
