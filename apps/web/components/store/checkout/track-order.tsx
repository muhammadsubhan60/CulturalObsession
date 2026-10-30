'use client';

import * as React from 'react';
import { StoreError, storeFetch } from '@/lib/store-client';

/** Order lookup by order number + phone, in the theme's contact-form style. */
export function TrackOrder() {
  const [orderNumber, setOrderNumber] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const r = await storeFetch<{ orderNumber: string; accessKey: string }>('/orders/track', { orderNumber, phone });
      window.location.assign(`/orders/${r.orderNumber}?key=${encodeURIComponent(r.accessKey)}`);
    } catch (err) {
      setPending(false);
      setError(
        err instanceof StoreError && err.status === 404
          ? 'We could not find an order with that number and phone. Check both and try again.'
          : err instanceof StoreError
            ? (err.fields[0]?.message ?? err.message)
            : 'Something went wrong, please try again.',
      );
    }
  }

  return (
    <div className="contact page-width page-width--narrow" style={{ paddingTop: '3.6rem', paddingBottom: '7.5rem' }}>
      <h1 className="title title--primary">Track your order</h1>
      <form className="isolate" noValidate onSubmit={submit}>
        {error && (
          <h2 className="form-status form-status-list form__message" role="alert">
            {error}
          </h2>
        )}
        <div className="contact__fields">
          <div className="field">
            <input className="field__input" id="Track-number" value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} placeholder="Order number" autoComplete="off" />
            <label className="field__label" htmlFor="Track-number">
              Order number (e.g. CO-100001)
            </label>
          </div>
          <div className="field">
            <input className="field__input" id="Track-phone" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Mobile number" />
            <label className="field__label" htmlFor="Track-phone">
              Mobile number used for the order
            </label>
          </div>
        </div>
        <div className="contact__button">
          <button type="submit" className="button" disabled={pending}>
            {pending ? 'Looking…' : 'Find my order'}
          </button>
        </div>
      </form>
    </div>
  );
}
