import { formatPkr } from '@co/shared';
import { notFound } from 'next/navigation';
import { ClearCheckout } from '@/components/store/checkout/clear-checkout';
import { StoreChrome } from '@/components/store/chrome';
import { storeGetFresh } from '@/lib/store-api';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Your order', robots: { index: false, follow: false } };

type Params = Promise<{ number: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;
type Order = {
  orderNumber: string;
  status: string;
  createdAt: string;
  paymentMethod: string;
  subtotalPaisa: number;
  shippingPaisa: number;
  totalPaisa: number;
  advanceRequiredPaisa: number;
  codAmountPaisa: number;
  recipientName: string;
  recipientPhone: string;
  address: { city?: string; area?: string; addressLine?: string; postalCode?: string };
  items: { title: string; variantTitle: string | null; quantity: number; lineTotalPaisa: number; customization: { label: string; value: string }[] }[];
  payments: {
    purpose: string;
    status: string;
    amountPaisa: number;
    hasReference: boolean;
    account: { label: string; accountTitle: string; accountNumber: string | null; iban: string | null; bankName: string | null; instructions: string | null } | null;
  }[];
  shipments: { courier: string; trackingNumber: string | null; trackingUrl: string | null; status: string }[];
};

const STATUS: Record<string, string> = {
  PENDING: 'Order received — we will call you to confirm it.',
  CONFIRMATION_REQUIRED: 'Waiting for your advance payment before we start making it.',
  CONFIRMED: 'Confirmed — being prepared.',
  IN_PRODUCTION: 'Being made for you.',
  READY_TO_DISPATCH: 'Ready to ship.',
  SHIPPED: 'On its way.',
  DELIVERED: 'Delivered. Enjoy!',
  CANCELLED: 'Cancelled.',
  RETURNED: 'Returned.',
};

export default async function OrderPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { number } = await params;
  const { key } = await searchParams;
  if (typeof key !== 'string' || !/^CO-\d{6,9}$/.test(number)) notFound();
  const data = await storeGetFresh<{ order: Order }>(`/orders/${number}?key=${encodeURIComponent(key)}`);
  if (!data) notFound();
  const o = data.order;
  const advance = o.payments.find((p) => p.purpose === 'ADVANCE');
  const advanceDue = advance && advance.status !== 'PAID';
  const shipment = o.shipments.find((s) => s.trackingNumber);

  return (
    <StoreChrome template="cart">
      <ClearCheckout />
      <link rel="stylesheet" href="/storefront/checkout.css" />
      <div className="page-width" style={{ paddingTop: '3.6rem', paddingBottom: '3.6rem' }}>
        <p className="caption-with-letter-spacing">Order {o.orderNumber}</p>
        <h1 className="title title--primary" style={{ marginTop: '.4rem' }}>
          Thank you, {o.recipientName.split(' ')[0]}!
        </h1>
        <div className="co-notice rte" role="status">
          <p>
            <strong>{STATUS[o.status] ?? o.status}</strong>
          </p>
          {advanceDue && advance && (
            <p>
              Please send the advance of <strong>{formatPkr(advance.amountPaisa)}</strong>
              {advance.account ? (
                <>
                  {' '}
                  to <strong>{advance.account.label}</strong> — {advance.account.accountTitle}
                  {advance.account.bankName ? `, ${advance.account.bankName}` : ''}
                  {advance.account.accountNumber ? `, ${advance.account.accountNumber}` : ''}
                  {advance.account.iban ? `, IBAN ${advance.account.iban}` : ''}.
                </>
              ) : (
                '.'
              )}{' '}
              {advance.hasReference ? 'We have your transaction ID and will verify it shortly.' : 'Then share the transaction ID or screenshot with us on WhatsApp, quoting your order number.'}
            </p>
          )}
          {shipment && (
            <p>
              Shipped with {shipment.courier}: tracking number <strong>{shipment.trackingNumber}</strong>
              {shipment.trackingUrl && /^https:\/\//.test(shipment.trackingUrl) && (
                <>
                  {' '}
                  —{' '}
                  <a href={shipment.trackingUrl} target="_blank" rel="noopener noreferrer">
                    track parcel
                  </a>
                </>
              )}
            </p>
          )}
        </div>

        <div className="co-checkout">
          <div>
            <h2 className="h4">Items</h2>
            {o.items.map((i, n) => (
              <div className="co-summary__line" style={{ gridTemplateColumns: '1fr auto' }} key={n}>
                <div>
                  <div>
                    {i.title} × {i.quantity}
                  </div>
                  <p className="co-summary__meta">{[i.variantTitle, ...i.customization.map((c) => `${c.label}: ${c.value}`)].filter(Boolean).join(' · ')}</p>
                </div>
                <div>{formatPkr(i.lineTotalPaisa)}</div>
              </div>
            ))}
            <div className="co-summary__totals">
              <div>
                <span>Subtotal</span>
                <span>{formatPkr(o.subtotalPaisa)}</span>
              </div>
              <div>
                <span>Shipping</span>
                <span>{o.shippingPaisa ? formatPkr(o.shippingPaisa) : 'Free'}</span>
              </div>
              <div className="co-summary__grand">
                <span>Total</span>
                <span>{formatPkr(o.totalPaisa)}</span>
              </div>
              {o.advanceRequiredPaisa > 0 && (
                <div>
                  <span>Advance</span>
                  <span>{formatPkr(o.advanceRequiredPaisa)}</span>
                </div>
              )}
              <div>
                <span>Cash on delivery</span>
                <span>{formatPkr(o.codAmountPaisa)}</span>
              </div>
            </div>
          </div>
          <aside className="co-summary">
            <div className="co-order-meta" style={{ gridTemplateColumns: '1fr' }}>
              <div>
                <h2 className="h5" style={{ marginTop: 0 }}>
                  Delivery to
                </h2>
                <p className="rte" style={{ margin: 0 }}>
                  {o.recipientName}
                  <br />
                  {o.address.addressLine}
                  <br />
                  {[o.address.area, o.address.city, o.address.postalCode].filter(Boolean).join(', ')}
                  <br />
                  {o.recipientPhone}
                </p>
              </div>
              <div>
                <h2 className="h5">Need help?</h2>
                <p className="rte" style={{ margin: 0 }}>
                  Keep this page&rsquo;s link to check your order later, or <a href="/pages/contact">contact us</a> with your order number.
                </p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </StoreChrome>
  );
}
