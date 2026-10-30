'use client';

import { formatPkr } from '@co/shared';
import * as React from 'react';
import { clearCart, readCart, type CartLine } from '@/lib/cart';
import { StoreError, storeFetch, type Quote } from '@/lib/store-client';

type Account = { id: string; method: 'BANK_TRANSFER' | 'RAAST' | 'JAZZCASH' | 'EASYPAISA'; label: string; accountTitle: string; accountNumber: string | null; iban: string | null; bankName: string | null; instructions: string | null };
type Placed = { order: { orderNumber: string; accessKey: string } };
type FormFields = { name: string; phone: string; email: string; city: string; area: string; addressLine: string; postalCode: string; note: string; reference: string };
type Fields = Record<string, string>;

const SID = 'template--checkout__main';

const ErrorIcon = () => (
  <svg aria-hidden="true" focusable="false" role="presentation" className="icon icon-error" viewBox="0 0 13 13">
    <circle cx="6.5" cy="6.50049" r="5.5" stroke="white" strokeWidth="2" />
    <circle cx="6.5" cy="6.5" r="5.5" fill="#EB001B" stroke="#EB001B" strokeWidth="0.7" />
    <path d="M5.87413 3.52832L5.97439 7.57216H7.02713L7.12739 3.52832H5.87413ZM6.50076 9.66091C6.88091 9.66091 7.18169 9.37267 7.18169 9.00504C7.18169 8.63742 6.88091 8.34917 6.50076 8.34917C6.12061 8.34917 5.81982 8.63742 5.81982 9.00504C5.81982 9.37267 6.12061 9.66091 6.50076 9.66091Z" fill="white" />
  </svg>
);

function idempotencyKey(): string {
  try {
    const existing = window.sessionStorage.getItem('co.checkout.key');
    if (existing) return existing;
    const key = crypto.randomUUID().replace(/-/g, '');
    window.sessionStorage.setItem('co.checkout.key', key);
    return key;
  } catch {
    return crypto.randomUUID().replace(/-/g, '');
  }
}

function attribution(): Record<string, string> {
  try {
    return JSON.parse(window.sessionStorage.getItem('co.attribution') ?? '{}');
  } catch {
    return {};
  }
}

function Field({ id, label, error, type = 'text', autoComplete, value, onChange, required, inputMode, textarea }: {
  id: string; label: string; error?: string; type?: string; autoComplete?: string; value: string; onChange: (v: string) => void; required?: boolean; inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode']; textarea?: boolean;
}) {
  const common = {
    id,
    className: `field__input${textarea ? ' text-area' : ''}`,
    placeholder: label,
    value,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? `${id}-error` : undefined,
    'aria-required': required || undefined,
  };
  return (
    <div>
      <div className="field">
        {textarea ? (
          <textarea {...common} rows={3} onChange={(e) => onChange(e.target.value)} />
        ) : (
          <input {...common} type={type} autoComplete={autoComplete} inputMode={inputMode} onChange={(e) => onChange(e.target.value)} />
        )}
        <label className="field__label" htmlFor={id}>
          {label}
          {required ? <span aria-hidden="true"> *</span> : null}
        </label>
      </div>
      {error && (
        <small className="co-checkout__error form__message" id={`${id}-error`}>
          <ErrorIcon />
          {error}
        </small>
      )}
    </div>
  );
}

const METHOD_LABEL: Record<Account['method'], string> = { BANK_TRANSFER: 'Bank transfer', RAAST: 'Raast', JAZZCASH: 'JazzCash', EASYPAISA: 'Easypaisa' };

export function CheckoutPage() {
  const [lines, setLines] = React.useState<CartLine[] | null>(null);
  const [quote, setQuote] = React.useState<Quote | null>(null);
  const [accounts, setAccounts] = React.useState<Account[]>([]);
  const [form, setForm] = React.useState<FormFields>({ name: '', phone: '', email: '', city: '', area: '', addressLine: '', postalCode: '', note: '', reference: '' });
  const [accountId, setAccountId] = React.useState('');
  const [errors, setErrors] = React.useState<Fields>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const set = (k: keyof FormFields) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  React.useEffect(() => {
    const cart = readCart();
    setLines(cart);
    if (cart.length === 0) return;
    storeFetch<Quote>('/cart/quote', { lines: cart.map(({ variantId, quantity, customization }) => ({ variantId, quantity, customization })) })
      .then(setQuote)
      .catch((e) => setFormError(e.message));
    storeFetch<{ accounts: Account[] }>('/payment-accounts')
      .then((r) => {
        setAccounts(r.accounts);
        if (r.accounts[0]) setAccountId(r.accounts[0].id);
      })
      .catch(() => undefined);
  }, []);

  const needsAdvance = (quote?.advanceRequiredPaisa ?? 0) > 0;
  const account = accounts.find((a) => a.id === accountId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!lines || !quote) return;
    setPending(true);
    setFormError(null);
    setErrors({});
    try {
      const placed = await storeFetch<Placed>('/orders', {
        idempotencyKey: idempotencyKey(),
        lines: lines.map(({ variantId, quantity, customization }) => ({ variantId, quantity, customization })),
        customer: { name: form.name, phone: form.phone, email: form.email },
        address: { city: form.city, area: form.area, addressLine: form.addressLine, postalCode: form.postalCode },
        note: form.note,
        payment: needsAdvance ? { method: account?.method ?? 'BANK_TRANSFER', accountId, reference: form.reference } : { method: 'COD' },
        attribution: attribution(),
      });
      clearCart();
      try {
        window.sessionStorage.removeItem('co.checkout.key');
      } catch {
        // ignore
      }
      window.location.assign(`/orders/${placed.order.orderNumber}?key=${encodeURIComponent(placed.order.accessKey)}`);
    } catch (err) {
      setPending(false);
      if (err instanceof StoreError) {
        const map: Fields = {};
        for (const f of err.fields) map[f.path.split('.').pop()!] = f.message;
        setErrors(map);
        setFormError(err.message);
        const first = err.fields[0]?.path.split('.').pop();
        if (first) document.getElementById(`Checkout-${first}`)?.focus();
      } else setFormError('Something went wrong, please try again.');
    }
  }

  if (lines && lines.length === 0) {
    return (
      <div className="page-width section-padding center" style={{ padding: '6rem 0' }}>
        <h1 className="title title--primary">Your cart is empty</h1>
        <a href="/collections/all" className="button">
          Continue shopping
        </a>
      </div>
    );
  }

  return (
    <div id={`shopify-section-${SID}`} className="shopify-section">
      <link rel="stylesheet" href="/storefront/checkout.css" />
      <div className="page-width" style={{ paddingTop: '3.6rem', paddingBottom: '3.6rem' }}>
        <div className="title-wrapper-with-link">
          <h1 className="title title--primary">Checkout</h1>
          <a href="/cart" className="underlined-link">
            Back to cart
          </a>
        </div>
        <form className="co-checkout" noValidate onSubmit={submit}>
          <div>
            {formError && (
              <h2 className="form-status form-status-list form__message" role="alert" tabIndex={-1}>
                <ErrorIcon /> {formError}
              </h2>
            )}
            <section className="co-checkout__section" aria-labelledby="co-contact">
              <h2 className="h4" id="co-contact">
                Contact
              </h2>
              <div className="co-checkout__row co-checkout__row--2">
                <Field id="Checkout-name" label="Full name" required autoComplete="name" value={form.name} onChange={set('name')} error={errors.name} />
                <Field id="Checkout-phone" label="Mobile number" required type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={set('phone')} error={errors.phone} />
              </div>
              <div className="co-checkout__row">
                <Field id="Checkout-email" label="Email (optional)" type="email" autoComplete="email" value={form.email} onChange={set('email')} error={errors.email} />
              </div>
            </section>
            <section className="co-checkout__section" aria-labelledby="co-delivery">
              <h2 className="h4" id="co-delivery">
                Delivery
              </h2>
              <div className="co-checkout__row co-checkout__row--2">
                <Field id="Checkout-city" label="City" required autoComplete="address-level2" value={form.city} onChange={set('city')} error={errors.city} />
                <Field id="Checkout-area" label="Area (optional)" autoComplete="address-level3" value={form.area} onChange={set('area')} error={errors.area} />
              </div>
              <div className="co-checkout__row">
                <Field id="Checkout-addressLine" label="House, street and landmark" required autoComplete="street-address" value={form.addressLine} onChange={set('addressLine')} error={errors.addressLine} />
              </div>
              <div className="co-checkout__row co-checkout__row--2">
                <Field id="Checkout-postalCode" label="Postal code (optional)" inputMode="numeric" autoComplete="postal-code" value={form.postalCode} onChange={set('postalCode')} error={errors.postalCode} />
              </div>
              <div className="co-checkout__row">
                <Field id="Checkout-note" label="Order note (optional)" textarea value={form.note} onChange={set('note')} error={errors.note} />
              </div>
            </section>
            <section className="co-checkout__section" aria-labelledby="co-payment">
              <h2 className="h4" id="co-payment">
                Payment
              </h2>
              {!quote ? (
                <p className="caption-large">Loading…</p>
              ) : needsAdvance ? (
                <>
                  <div className="co-notice rte">
                    <p>
                      Personalized pieces are made for you, so we need an advance of <strong>{formatPkr(quote.advanceRequiredPaisa)}</strong> before we start. Pay the remaining{' '}
                      <strong>{formatPkr(quote.codAmountPaisa)}</strong> in cash on delivery.
                    </p>
                  </div>
                  {accounts.length === 0 ? (
                    <p className="co-checkout__error form__message">
                      <ErrorIcon /> Online advance payments are not set up yet. Please order on WhatsApp.
                    </p>
                  ) : (
                    <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
                      <legend className="visually-hidden">Where will you send the advance?</legend>
                      {accounts.map((a) => (
                        <label key={a.id} className="co-pay-option">
                          <input type="radio" name="account" value={a.id} checked={accountId === a.id} onChange={() => setAccountId(a.id)} />
                          <strong>{a.label}</strong> <span className="caption-large">({METHOD_LABEL[a.method]})</span>
                          {accountId === a.id && (
                            <div className="co-pay-option__details">
                              <div>Account title: {a.accountTitle}</div>
                              {a.bankName && <div>Bank: {a.bankName}</div>}
                              {a.accountNumber && <div>Account / mobile number: {a.accountNumber}</div>}
                              {a.iban && <div>IBAN: {a.iban}</div>}
                              {a.instructions && <div className="caption-large">{a.instructions}</div>}
                            </div>
                          )}
                        </label>
                      ))}
                      {errors.accountId && (
                        <small className="co-checkout__error form__message">
                          <ErrorIcon />
                          {errors.accountId}
                        </small>
                      )}
                      <div className="co-checkout__row" style={{ marginTop: '1.6rem' }}>
                        <Field id="Checkout-reference" label="Transaction ID (after you pay)" value={form.reference} onChange={set('reference')} error={errors.reference} />
                      </div>
                      <p className="caption-large">You can also send the payment screenshot on WhatsApp after placing the order.</p>
                    </fieldset>
                  )}
                </>
              ) : (
                <label className="co-pay-option">
                  <input type="radio" name="payment" checked readOnly /> <strong>Cash on delivery</strong>
                  <div className="co-pay-option__details">Pay {formatPkr(quote.totalPaisa)} when your order arrives. Our team will call to confirm your order first.</div>
                </label>
              )}
            </section>
            <button type="submit" className="button button--full-width" disabled={!quote || !quote.ok || pending || (needsAdvance && accounts.length === 0)}>
              {pending ? 'Placing your order…' : needsAdvance ? `Place order · pay ${formatPkr(quote?.advanceRequiredPaisa ?? 0)} advance` : 'Place order'}
            </button>
          </div>

          <aside className="co-summary" aria-labelledby="co-summary">
            <h2 className="h4" id="co-summary" style={{ marginTop: 0 }}>
              Order summary
            </h2>
            {!quote ? (
              <p className="caption-large">Loading…</p>
            ) : (
              <>
                {quote.lines.map((l) => (
                  <div className="co-summary__line" key={`${l.variantId}-${l.index}`}>
                    {l.image ? <img src={l.image} alt="" loading="lazy" /> : <span />}
                    <div>
                      <div>{l.productTitle}</div>
                      <p className="co-summary__meta">
                        {[l.variantTitle, ...l.customization.map((c) => `${c.label}: ${c.value}`)].filter(Boolean).join(' · ')}
                      </p>
                      <p className="co-summary__meta">Qty {l.quantity}</p>
                      {l.problem && (
                        <small className="co-checkout__error form__message">
                          <ErrorIcon /> {l.problem === 'out_of_stock' ? 'Sold out' : l.problem === 'unavailable' ? 'No longer available' : l.problemDetail}
                        </small>
                      )}
                    </div>
                    <div>{formatPkr(l.lineTotalPaisa)}</div>
                  </div>
                ))}
                <div className="co-summary__totals">
                  <div>
                    <span>Subtotal</span>
                    <span>{formatPkr(quote.subtotalPaisa)}</span>
                  </div>
                  <div>
                    <span>Shipping</span>
                    <span>{quote.shippingPaisa ? formatPkr(quote.shippingPaisa) : 'Free'}</span>
                  </div>
                  <div className="co-summary__grand">
                    <span>Total</span>
                    <span>{formatPkr(quote.totalPaisa)}</span>
                  </div>
                  {needsAdvance && (
                    <>
                      <div>
                        <span>Advance now</span>
                        <span>{formatPkr(quote.advanceRequiredPaisa)}</span>
                      </div>
                      <div>
                        <span>Cash on delivery</span>
                        <span>{formatPkr(quote.codAmountPaisa)}</span>
                      </div>
                    </>
                  )}
                </div>
                {!quote.ok && (
                  <p className="caption-large">
                    Some items need attention. <a href="/cart">Review your cart</a>.
                  </p>
                )}
              </>
            )}
          </aside>
        </form>
      </div>
    </div>
  );
}
