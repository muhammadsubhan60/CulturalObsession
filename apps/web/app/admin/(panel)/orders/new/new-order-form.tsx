'use client';

import { adminOrderInput, formatPkr, MAX_LINE_QUANTITY } from '@co/shared';
import { ArrowLeft, Loader2, Minus, Plus, Search, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { Checkbox, describedBy, Field, FormAlert } from '@/components/admin/form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { adminApi, ApiError, type FieldError } from '@/lib/admin-api';
import { METHOD_LABEL, type PaymentMethod } from '@/lib/order-types';
import { cn } from '@/lib/utils';

type VariantOption = {
  id: string;
  sku: string;
  title: string;
  productTitle: string;
  pricePaisa: number;
  image: string | null;
  available: number | null;
  fields: { key: string; label: string; required: boolean; extraPricePaisa: number; maxLength: number | null }[];
};
type Line = { variant: VariantOption; quantity: number; customization: Record<string, string> };
type Quote = {
  lines: { index: number; lineTotalPaisa: number; problem: string | null; problemDetail: string | null }[];
  subtotalPaisa: number;
  shippingPaisa: number;
  totalPaisa: number;
  advanceRequiredPaisa: number;
  codAmountPaisa: number;
  ok: boolean;
};
type Account = { id: string; method: PaymentMethod; label: string; isActive: boolean };

const errorsByPath = (fields: FieldError[]) => Object.fromEntries(fields.map((f) => [f.path, f.message]));

export function NewOrderForm() {
  const router = useRouter();
  const [idempotencyKey] = React.useState(() => crypto.randomUUID().replace(/-/g, ''));
  const [source, setSource] = React.useState<'WHATSAPP' | 'ADMIN'>('WHATSAPP');
  const [lines, setLines] = React.useState<Line[]>([]);
  const [customer, setCustomer] = React.useState({ name: '', phone: '', email: '' });
  const [address, setAddress] = React.useState({ city: '', area: '', addressLine: '' });
  const [note, setNote] = React.useState('');
  const [accounts, setAccounts] = React.useState<Account[]>([]);
  const [accountId, setAccountId] = React.useState('');
  const [advanceReceived, setAdvanceReceived] = React.useState(false);
  const [reference, setReference] = React.useState('');
  const [quote, setQuote] = React.useState<Quote | null>(null);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    adminApi<{ items: Account[] }>('/payment-accounts')
      .then((r) => {
        const active = r.items.filter((a) => a.isActive && a.method !== 'COD');
        setAccounts(active);
        setAccountId(active[0]?.id ?? '');
      })
      .catch(() => setAccounts([]));
  }, []);

  // Re-price whenever the cart changes; the server is the only source of prices.
  const cartLines = React.useMemo(
    () => lines.map((l) => ({ variantId: l.variant.id, quantity: l.quantity, customization: l.customization })),
    [lines],
  );
  React.useEffect(() => {
    if (cartLines.length === 0) {
      setQuote(null);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(async () => {
      try {
        const q = await adminApi<Quote>('/orders/quote', { method: 'POST', body: { lines: cartLines } });
        if (!cancelled) setQuote(q);
      } catch {
        if (!cancelled) setQuote(null);
      }
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [cartLines]);

  const needsAdvance = (quote?.advanceRequiredPaisa ?? 0) > 0;
  const account = accounts.find((a) => a.id === accountId);

  function updateLine(index: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const payment = needsAdvance ? { method: account?.method ?? 'BANK_TRANSFER', accountId, reference } : { method: 'COD' };
    const body = {
      idempotencyKey,
      source,
      lines: cartLines,
      customer,
      address,
      note,
      payment,
      advanceReceived: needsAdvance && advanceReceived,
    };
    const parsed = adminOrderInput.safeParse(body);
    if (!parsed.success) {
      setErrors(errorsByPath(parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))));
      setFormError(lines.length === 0 ? 'Add at least one product.' : 'Please fix the highlighted fields.');
      return;
    }
    setErrors({});
    setFormError(null);
    setPending(true);
    try {
      const res = await adminApi<{ order: { id: string } }>('/orders', { method: 'POST', body: parsed.data });
      router.push(`/admin/orders/${res.order.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(errorsByPath(err.fields));
        setFormError(err.status === 409 ? (err.fields[0]?.message ?? err.message) : err.message);
      } else {
        setFormError('Something went wrong, please try again.');
      }
      setPending(false);
    }
  }

  const err = (path: string) => errors[path];

  return (
    <>
      <div className="border-b bg-card px-4 py-5 md:px-8">
        <Link href="/admin/orders" className="inline-flex min-h-9 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden /> Orders
        </Link>
        <h1 className="mt-1 font-serif text-2xl font-bold text-primary">New order</h1>
        <p className="mt-1 text-sm text-muted-foreground">For customers who ordered on WhatsApp, by phone or in person. Prices come from the catalogue.</p>
      </div>
      <form noValidate onSubmit={submit} className="grid gap-4 px-4 py-6 md:px-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          <FormAlert message={formError} />
          <Card title="Ordered via">
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Ordered via">
              {(
                [
                  ['WHATSAPP', 'WhatsApp'],
                  ['ADMIN', 'Phone / in person'],
                ] as const
              ).map(([value, label]) => (
                <Button key={value} type="button" role="radio" aria-checked={source === value} variant={source === value ? 'default' : 'outline'} onClick={() => setSource(value)}>
                  {label}
                </Button>
              ))}
            </div>
          </Card>

          <Card title="Products">
            <ProductPicker onPick={(variant) => setLines((ls) => [...ls, { variant, quantity: 1, customization: {} }])} />
            {lines.length > 0 && (
              <ul className="mt-4 divide-y rounded-md border">
                {lines.map((line, index) => {
                  const problem = quote?.lines[index]?.problem ? (quote.lines[index]!.problemDetail ?? 'Not available') : null;
                  return (
                    <li key={`${line.variant.id}-${index}`} className="flex flex-col gap-3 p-3">
                      <div className="flex items-start gap-3">
                        {line.variant.image ? (
                          <img src={line.variant.image} alt="" className="size-12 shrink-0 rounded-md border object-cover" loading="lazy" />
                        ) : (
                          <div className="size-12 shrink-0 rounded-md border bg-muted" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="font-medium">{line.variant.productTitle}</div>
                          <div className="text-sm text-muted-foreground">
                            {line.variant.title !== 'Default' ? `${line.variant.title} · ` : ''}
                            {formatPkr(line.variant.pricePaisa)}
                          </div>
                          {problem && <p className="mt-1 text-sm text-destructive">{problem}</p>}
                        </div>
                        <Button type="button" size="icon" variant="ghost" aria-label={`Remove ${line.variant.productTitle}`} onClick={() => setLines((ls) => ls.filter((_, i) => i !== index))}>
                          <Trash2 />
                        </Button>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">Quantity</span>
                        <Button type="button" size="icon" variant="outline" aria-label="Fewer" disabled={line.quantity <= 1} onClick={() => updateLine(index, { quantity: line.quantity - 1 })}>
                          <Minus />
                        </Button>
                        <span className="w-8 text-center tabular-nums" aria-live="polite">
                          {line.quantity}
                        </span>
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          aria-label="More"
                          disabled={line.quantity >= MAX_LINE_QUANTITY}
                          onClick={() => updateLine(index, { quantity: line.quantity + 1 })}
                        >
                          <Plus />
                        </Button>
                      </div>
                      {line.variant.fields.map((f) => {
                        const id = `line-${index}-${f.key}`;
                        return (
                          <Field
                            key={f.key}
                            id={id}
                            label={`${f.label}${f.required ? '' : ' (optional)'}${f.extraPricePaisa ? ` · +${formatPkr(f.extraPricePaisa)}` : ''}`}
                            help={f.maxLength ? `Up to ${f.maxLength} characters. Copy it exactly as the customer wrote it.` : undefined}
                          >
                            <Input
                              id={id}
                              value={line.customization[f.key] ?? ''}
                              maxLength={f.maxLength ?? 200}
                              onChange={(e) => updateLine(index, { customization: { ...line.customization, [f.key]: e.target.value } })}
                              aria-describedby={describedBy(id, undefined, f.maxLength ? 'help' : undefined)}
                            />
                          </Field>
                        );
                      })}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card title="Customer">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="c-name" label="Name" error={err('customer.name')}>
                <Input id="c-name" autoComplete="off" value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} aria-invalid={Boolean(err('customer.name')) || undefined} aria-describedby={describedBy('c-name', err('customer.name'))} />
              </Field>
              <Field id="c-phone" label="Mobile number" error={err('customer.phone')}>
                <Input id="c-phone" inputMode="tel" placeholder="0300 1234567" value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} aria-invalid={Boolean(err('customer.phone')) || undefined} aria-describedby={describedBy('c-phone', err('customer.phone'))} />
              </Field>
              <Field id="c-email" label="Email (optional)" error={err('customer.email')}>
                <Input id="c-email" type="email" inputMode="email" value={customer.email} onChange={(e) => setCustomer({ ...customer, email: e.target.value })} aria-invalid={Boolean(err('customer.email')) || undefined} aria-describedby={describedBy('c-email', err('customer.email'))} />
              </Field>
              <Field id="a-city" label="City" error={err('address.city')}>
                <Input id="a-city" value={address.city} onChange={(e) => setAddress({ ...address, city: e.target.value })} aria-invalid={Boolean(err('address.city')) || undefined} aria-describedby={describedBy('a-city', err('address.city'))} />
              </Field>
              <div className="sm:col-span-2">
                <Field id="a-line" label="Address" error={err('address.addressLine')}>
                  <Input id="a-line" value={address.addressLine} onChange={(e) => setAddress({ ...address, addressLine: e.target.value })} aria-invalid={Boolean(err('address.addressLine')) || undefined} aria-describedby={describedBy('a-line', err('address.addressLine'))} />
                </Field>
              </div>
              <Field id="a-area" label="Area (optional)">
                <Input id="a-area" value={address.area} onChange={(e) => setAddress({ ...address, area: e.target.value })} />
              </Field>
            </div>
            <div className="mt-4">
              <Field id="o-note" label="Customer note (optional)">
                <Textarea id="o-note" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
              </Field>
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-4 lg:sticky lg:top-4 lg:self-start">
          <Card title="Summary">
            {quote ? (
              <dl className="flex flex-col gap-1.5 text-sm">
                <SumRow label="Subtotal" value={formatPkr(quote.subtotalPaisa)} />
                <SumRow label="Shipping" value={quote.shippingPaisa ? formatPkr(quote.shippingPaisa) : 'Free'} />
                <SumRow label="Total" value={formatPkr(quote.totalPaisa)} strong />
                {needsAdvance && <SumRow label="Advance required" value={formatPkr(quote.advanceRequiredPaisa)} />}
                <SumRow label="Cash on delivery" value={formatPkr(quote.codAmountPaisa)} />
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">Add products to see the total.</p>
            )}
          </Card>
          {needsAdvance && (
            <Card title="Advance payment">
              {accounts.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Add a payment account in{' '}
                  <Link href="/admin/settings/payments" className="font-medium text-primary underline">
                    Payments &amp; advance
                  </Link>{' '}
                  first.
                </p>
              ) : (
                <div className="flex flex-col gap-4">
                  <Field id="p-account" label="Paid into" error={err('payment.accountId')}>
                    <Select id="p-account" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.label} ({METHOD_LABEL[a.method]})
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Checkbox id="p-received" label="Advance already received" checked={advanceReceived} onChange={setAdvanceReceived} />
                  <Field id="p-ref" label="Transaction ID (optional)" error={err('payment.reference')}>
                    <Input id="p-ref" value={reference} maxLength={80} onChange={(e) => setReference(e.target.value)} />
                  </Field>
                </div>
              )}
            </Card>
          )}
          <Button type="submit" size="lg" disabled={pending || lines.length === 0 || (quote !== null && !quote.ok) || (needsAdvance && !accountId)}>
            {pending && <Loader2 className="animate-spin" />} Create order
          </Button>
          {quote && !quote.ok && <p className="text-sm text-destructive">Fix the highlighted products first.</p>}
        </div>
      </form>
    </>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border bg-card p-4" aria-label={title}>
      <h2 className="mb-3 font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function SumRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn('flex justify-between gap-4', strong && 'border-t pt-1.5 font-semibold')}>
      <dt className={strong ? undefined : 'text-muted-foreground'}>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

function ProductPicker({ onPick }: { onPick: (v: VariantOption) => void }) {
  const [q, setQ] = React.useState('');
  const [results, setResults] = React.useState<VariantOption[] | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (q.trim().length < 2) {
      setResults(null);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(async () => {
      setLoading(true);
      try {
        const r = await adminApi<{ items: VariantOption[] }>(`/order-variants?q=${encodeURIComponent(q.trim())}`);
        if (!cancelled) setResults(r.items);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [q]);

  return (
    <div>
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input type="search" aria-label="Search products by name or SKU" placeholder="Search products by name or SKU" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
        {loading && <Loader2 aria-hidden className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
      </div>
      {results && (
        <ul className="mt-2 max-h-72 divide-y overflow-y-auto rounded-md border" aria-label="Search results">
          {results.length === 0 ? (
            <li className="px-3 py-3 text-sm text-muted-foreground">No products match.</li>
          ) : (
            results.map((v) => (
              <li key={v.id}>
                <button
                  type="button"
                  disabled={v.available !== null && v.available < 1}
                  className="flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => {
                    onPick(v);
                    setQ('');
                  }}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{v.productTitle}</span>
                    <span className="block text-xs text-muted-foreground">
                      {v.title !== 'Default' ? `${v.title} · ` : ''}
                      {v.sku}
                      {v.available !== null ? ` · ${v.available > 0 ? `${v.available} in stock` : 'Out of stock'}` : ''}
                    </span>
                  </span>
                  <span className="text-sm tabular-nums">{formatPkr(v.pricePaisa)}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
