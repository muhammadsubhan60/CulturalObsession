'use client';

import { formatPkr } from '@co/shared';
import { ArrowLeft, Check, CircleAlert, ExternalLink, Loader2, MessageCircle, Phone, Truck, Undo2 } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { Checkbox, describedBy, Field, FormAlert } from '@/components/admin/form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { VerifyDialog } from '@/components/admin/verify-dialog';
import { adminApi, ApiError, fieldMap } from '@/lib/admin-api';
import {
  ACTION_LABEL,
  formatWhen,
  METHOD_LABEL,
  type NextStep,
  type OrderDetail,
  type OrderStatus,
  PAYMENT_STATUS,
  PURPOSE_LABEL,
  SOURCE_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
  whatsappLink,
} from '@/lib/order-types';
import { cn } from '@/lib/utils';

type Detail = { order: OrderDetail; next: NextStep[] };
type Payment = OrderDetail['payments'][number];
const PRE_DISPATCH: OrderStatus[] = ['PENDING', 'CONFIRMATION_REQUIRED', 'CONFIRMED', 'IN_PRODUCTION'];
const CAN_SHIP: OrderStatus[] = ['CONFIRMED', 'IN_PRODUCTION', 'READY_TO_DISPATCH'];
const errorText = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong, please try again.');

export function OrderScreen({ id }: { id: string }) {
  const [data, setData] = React.useState<Detail | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [moving, setMoving] = React.useState<OrderStatus | null>(null);
  const [verifying, setVerifying] = React.useState<{ payment: Payment; decision: 'approve' | 'reject' } | null>(null);
  const [shipping, setShipping] = React.useState<OrderDetail['shipments'][number] | 'new' | null>(null);

  const load = React.useCallback(async () => {
    try {
      setData(await adminApi<Detail>(`/orders/${id}`));
      setError(null);
    } catch (e) {
      setError(errorText(e));
    }
  }, [id]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const done = (message: string) => {
    setNotice(message);
    void load();
  };

  if (!data) {
    return (
      <div className="px-4 py-10 md:px-8">
        {error ? (
          <FormAlert message={error} />
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <Loader2 className="size-4 animate-spin" /> Loading order…
          </div>
        )}
      </div>
    );
  }

  const { order, next } = data;
  const forward = next.filter((n) => n.status !== 'CANCELLED' && n.status !== 'RETURNED');
  const backward = next.filter((n) => n.status === 'CANCELLED' || n.status === 'RETURNED');
  const activeShipment = order.shipments.find((s) => s.status !== 'CANCELLED');

  return (
    <>
      <div className="border-b bg-card px-4 py-5 md:px-8">
        <Link href="/admin/orders" className="inline-flex min-h-9 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden /> Orders
        </Link>
        <div className="mt-1 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-serif text-2xl font-bold text-primary">{order.orderNumber}</h1>
              <Badge tone={STATUS_TONE[order.status]}>{STATUS_LABEL[order.status]}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatWhen(order.createdAt)} · {SOURCE_LABEL[order.source]} · {formatPkr(order.totalPaisa)}
            </p>
          </div>
          {next.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {forward.map((n, i) => (
                <Button key={n.status} variant={i === 0 ? 'default' : 'outline'} disabled={Boolean(n.blocker)} onClick={() => setMoving(n.status)}>
                  {ACTION_LABEL[n.status]}
                </Button>
              ))}
              {backward.map((n) => (
                <Button key={n.status} variant="outline" className="text-destructive" onClick={() => setMoving(n.status)}>
                  {ACTION_LABEL[n.status]}
                </Button>
              ))}
            </div>
          )}
        </div>
        {forward.some((n) => n.blocker) && (
          <ul className="mt-3 flex flex-col gap-1">
            {forward
              .filter((n) => n.blocker)
              .map((n) => (
                <li key={n.status} className="flex items-start gap-2 text-sm text-warning">
                  <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                  <span>
                    <span className="font-medium">{ACTION_LABEL[n.status]}:</span> {n.blocker}
                  </span>
                </li>
              ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-4 px-4 py-6 md:px-8">
        <FormAlert message={error} />
        {notice && (
          <div role="status" className="flex items-center gap-2 rounded-md border border-success/30 bg-success/5 px-3 py-2 text-sm text-success">
            <Check aria-hidden className="size-4" /> {notice}
          </div>
        )}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex min-w-0 flex-col gap-4">
            <Items order={order} onChanged={done} onError={setError} />
            <Section title="Payments">
              <ul className="divide-y">
                {order.payments.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0 flex-1 basis-48">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{PURPOSE_LABEL[p.purpose]}</span>
                        <Badge tone={PAYMENT_STATUS[p.status].tone}>{PAYMENT_STATUS[p.status].label}</Badge>
                      </div>
                      <div className="mt-0.5 text-sm text-muted-foreground">
                        {METHOD_LABEL[p.method]}
                        {p.paymentAccount ? ` → ${p.paymentAccount.label}` : ''}
                        {p.providerReference ? (
                          <>
                            {' · '}TID <span className="font-mono text-foreground">{p.providerReference}</span>
                          </>
                        ) : null}
                      </div>
                    </div>
                    <span className="font-semibold tabular-nums">{formatPkr(p.amountPaisa)}</span>
                    {p.purpose === 'ADVANCE' && ['PENDING', 'AWAITING_VERIFICATION', 'FAILED'].includes(p.status) && PRE_DISPATCH.includes(order.status) && (
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => setVerifying({ payment: p, decision: 'approve' })}>
                          Mark received
                        </Button>
                        {p.status !== 'FAILED' && (
                          <Button size="sm" variant="outline" onClick={() => setVerifying({ payment: p, decision: 'reject' })}>
                            Not received
                          </Button>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </Section>
            <Section
              title="Shipment"
              action={
                !activeShipment && CAN_SHIP.includes(order.status) ? (
                  <Button size="sm" variant="outline" onClick={() => setShipping('new')}>
                    <Truck /> Add courier
                  </Button>
                ) : null
              }
            >
              {activeShipment ? (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{activeShipment.courier.name}</div>
                    <div className="mt-0.5 text-sm text-muted-foreground">
                      Tracking <span className="font-mono text-foreground">{activeShipment.trackingNumber}</span>
                      {activeShipment.codAmountPaisa > 0 && <> · collect {formatPkr(activeShipment.codAmountPaisa)}</>}
                    </div>
                  </div>
                  {activeShipment.trackingUrl && (
                    <Button asChild size="sm" variant="outline">
                      <a href={activeShipment.trackingUrl} target="_blank" rel="noopener noreferrer">
                        Track <ExternalLink />
                      </a>
                    </Button>
                  )}
                  {!['DELIVERED', 'RETURNED'].includes(order.status) && (
                    <Button size="sm" variant="ghost" onClick={() => setShipping(activeShipment)}>
                      Edit
                    </Button>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {CAN_SHIP.includes(order.status) ? 'Book the parcel on the courier portal, then add the tracking number here.' : 'Confirm the order before booking a courier.'}
                </p>
              )}
            </Section>
            <Section title="History">
              <ol className="relative flex flex-col gap-4 border-l pl-5">
                {[...order.statusHistory].reverse().map((h) => (
                  <li key={h.id} className="relative">
                    <span aria-hidden className="absolute -left-[25px] top-1.5 size-2.5 rounded-full border-2 border-card bg-primary" />
                    <div className="text-sm">
                      <span className="font-medium">{h.fromStatus === h.toStatus ? 'Note' : STATUS_LABEL[h.toStatus]}</span>
                      <span className="text-muted-foreground">
                        {' '}
                        · {formatWhen(h.createdAt)}
                        {h.actorName ? ` · ${h.actorName}` : ''}
                      </span>
                    </div>
                    {h.note && <p className="mt-0.5 text-sm text-muted-foreground">{h.note}</p>}
                  </li>
                ))}
              </ol>
            </Section>
          </div>

          <div className="flex flex-col gap-4">
            <CustomerCard order={order} />
            <Section title="Totals">
              <dl className="flex flex-col gap-1.5 text-sm">
                <Row label="Subtotal" value={formatPkr(order.subtotalPaisa)} />
                {order.discountPaisa > 0 && <Row label="Discount" value={`−${formatPkr(order.discountPaisa)}`} />}
                <Row label="Shipping" value={order.shippingPaisa ? formatPkr(order.shippingPaisa) : 'Free'} />
                <Row label="Total" value={formatPkr(order.totalPaisa)} strong />
                {order.advanceRequiredPaisa > 0 && <Row label="Advance" value={formatPkr(order.advanceRequiredPaisa)} />}
                <Row label="Cash on delivery" value={formatPkr(order.codAmountPaisa)} />
              </dl>
            </Section>
            <NoteCard key={order.internalNote ?? ''} order={order} onSaved={() => done('Note saved')} />
          </div>
        </div>
      </div>

      <StatusDialog
        key={`s-${moving}`}
        order={order}
        to={moving}
        onClose={() => setMoving(null)}
        onDone={(to) => {
          setMoving(null);
          done(`Order marked ${STATUS_LABEL[to].toLowerCase()}`);
        }}
      />
      <VerifyDialog
        key={`v-${verifying?.payment.id}-${verifying?.decision}`}
        state={verifying}
        onClose={() => setVerifying(null)}
        onDone={(approved) => {
          setVerifying(null);
          done(approved ? 'Advance marked as received' : 'Advance marked as not received');
        }}
      />
      <ShipmentDialog
        key={`sh-${shipping === 'new' ? 'new' : shipping?.id}`}
        orderId={order.id}
        shipment={shipping}
        onClose={() => setShipping(null)}
        onDone={() => {
          setShipping(null);
          done('Shipment saved');
        }}
      />
    </>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border bg-card p-4" aria-label={title}>
      <div className="mb-3 flex min-h-9 items-center justify-between gap-2">
        <h2 className="font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn('flex justify-between gap-4', strong && 'border-t pt-1.5 font-semibold')}>
      <dt className={strong ? undefined : 'text-muted-foreground'}>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

function Items({ order, onChanged, onError }: { order: OrderDetail; onChanged: (m: string) => void; onError: (m: string) => void }) {
  const [busy, setBusy] = React.useState<string | null>(null);
  const editable = PRE_DISPATCH.includes(order.status);

  async function setApproval(itemId: string, approved: boolean) {
    setBusy(itemId);
    try {
      await adminApi(`/orders/${order.id}/items/${itemId}/approval`, { method: 'POST', body: { approved } });
      onChanged(approved ? 'Personalization approved' : 'Personalization reopened');
    } catch (e) {
      onError(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Section title={`Items (${order.items.reduce((s, i) => s + i.quantity, 0)})`}>
      <ul className="divide-y">
        {order.items.map((item) => {
          const approved = item.customization.length > 0 && item.customization.every((c) => c.approvedAt);
          return (
            <li key={item.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                <div className="min-w-0">
                  <div className="font-medium">
                    {item.variant ? (
                      <Link href={`/admin/products/${item.variant.product.id}`} className="hover:underline">
                        {item.productTitleSnapshot}
                      </Link>
                    ) : (
                      item.productTitleSnapshot
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {[item.variantTitleSnapshot, item.skuSnapshot].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <div className="ml-auto text-right text-sm tabular-nums">
                  <div className="font-semibold">{formatPkr(item.lineTotalPaisa)}</div>
                  <div className="text-muted-foreground">
                    {item.quantity} × {formatPkr(item.unitPricePaisa + item.customizationPaisa)}
                  </div>
                </div>
              </div>
              {item.customization.length > 0 && (
                <div className={cn('rounded-md border p-3', approved ? 'border-success/30 bg-success/5' : 'border-warning/40 bg-warning/5')}>
                  <dl className="flex flex-col gap-1">
                    {item.customization.map((c) => (
                      <div key={c.id} className="flex flex-wrap gap-x-2 text-sm">
                        <dt className="text-muted-foreground">{c.labelSnapshot}:</dt>
                        {/* Customer text, rendered as text only. */}
                        <dd className="break-all font-semibold">{String(c.value)}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <span className={cn('text-sm font-medium', approved ? 'text-success' : 'text-warning')}>
                      {approved ? 'Design approved for production' : 'Check spelling with the customer, then approve'}
                    </span>
                    {editable &&
                      (approved ? (
                        <Button size="sm" variant="ghost" disabled={busy === item.id} onClick={() => setApproval(item.id, false)}>
                          <Undo2 /> Reopen
                        </Button>
                      ) : (
                        <Button size="sm" disabled={busy === item.id} onClick={() => setApproval(item.id, true)}>
                          {busy === item.id ? <Loader2 className="animate-spin" /> : <Check />} Approve
                        </Button>
                      ))}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

function CustomerCard({ order }: { order: OrderDetail }) {
  const a = order.shippingAddress;
  const message = `Assalam o Alaikum ${order.recipientName}, this is Cultural Obsession about your order ${order.orderNumber}.`;
  return (
    <Section title="Customer">
      <div className="flex flex-col gap-3 text-sm">
        <div>
          <div className="font-medium">{order.recipientName}</div>
          <div className="text-muted-foreground">{order.recipientPhone}</div>
          {order.customer.email && <div className="break-all text-muted-foreground">{order.customer.email}</div>}
          <div className="mt-1 text-xs text-muted-foreground">
            {order.customer._count.orders} {order.customer._count.orders === 1 ? 'order' : 'orders'} in total
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button asChild variant="outline" size="sm">
            <a href={whatsappLink(order.recipientPhone, message)} target="_blank" rel="noopener noreferrer">
              <MessageCircle /> WhatsApp
            </a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href={`tel:${order.recipientPhone}`}>
              <Phone /> Call
            </a>
          </Button>
        </div>
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Ship to</div>
          <address className="mt-1 not-italic">
            {a.addressLine}
            <br />
            {[a.area, a.city, a.postalCode].filter(Boolean).join(', ')}
          </address>
        </div>
        {order.customerNote && (
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Customer note</div>
            <p className="mt-1 whitespace-pre-wrap break-words">{order.customerNote}</p>
          </div>
        )}
        {(order.utmSource || order.utmCampaign) && (
          <div className="text-xs text-muted-foreground">
            Came from {order.utmSource ?? 'unknown'}
            {order.utmCampaign ? ` · ${order.utmCampaign}` : ''}
          </div>
        )}
      </div>
    </Section>
  );
}

function NoteCard({ order, onSaved }: { order: OrderDetail; onSaved: () => void }) {
  const [value, setValue] = React.useState(order.internalNote ?? '');
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const dirty = value !== (order.internalNote ?? '');

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    try {
      await adminApi(`/orders/${order.id}`, { method: 'PATCH', body: { internalNote: value } });
      setError(null);
      onSaved();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <Section title="Staff note">
      <form onSubmit={save} className="flex flex-col gap-2">
        <FormAlert message={error} />
        <Textarea
          aria-label="Staff note (never shown to the customer)"
          rows={4}
          maxLength={2000}
          value={value}
          placeholder="Only staff see this"
          onChange={(e) => setValue(e.target.value)}
        />
        <Button type="submit" size="sm" variant="outline" className="self-end" disabled={!dirty || pending}>
          {pending && <Loader2 className="animate-spin" />} Save note
        </Button>
      </form>
    </Section>
  );
}

function StatusDialog({ order, to, onClose, onDone }: { order: OrderDetail; to: OrderStatus | null; onClose: () => void; onDone: (to: OrderStatus) => void }) {
  const [note, setNote] = React.useState('');
  const [restock, setRestock] = React.useState(true);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const destructive = to === 'CANCELLED' || to === 'RETURNED';
  const hasTracked = order.items.some((i) => i.variant?.trackInventory);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!to) return;
    setPending(true);
    try {
      await adminApi(`/orders/${order.id}/status`, { method: 'POST', body: { status: to, note, restock: to === 'RETURNED' && restock } });
      onDone(to);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setPending(false);
    }
  }

  const explain: Partial<Record<OrderStatus, string>> = {
    CANCELLED: 'Reserved stock goes back on sale and unpaid payments are closed. This cannot be undone.',
    RETURNED: 'Uncollected cash on delivery is closed. This cannot be undone.',
    SHIPPED: 'Reserved stock is taken off the shelf.',
    DELIVERED: 'Cash on delivery is marked as collected.',
  };

  return (
    <Dialog open={to !== null} onOpenChange={(o) => !o && onClose()} title={to ? `${ACTION_LABEL[to]}?` : ''} description={to ? `${order.orderNumber} · ${order.recipientName}` : undefined}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <FormAlert message={error} />
        {to && explain[to] && <p className="text-sm text-muted-foreground">{explain[to]}</p>}
        <Field id="status-note" label={destructive ? 'Reason' : 'Note (optional)'}>
          <Textarea id="status-note" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {to === 'RETURNED' && hasTracked && <Checkbox id="restock" label="Put the returned items back in stock" checked={restock} onChange={setRestock} />}
        <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose}>
            Keep as is
          </Button>
          <Button type="submit" variant={destructive ? 'destructive' : 'default'} disabled={pending}>
            {pending && <Loader2 className="animate-spin" />} {to ? ACTION_LABEL[to] : ''}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

type Courier = { id: string; name: string; isActive: boolean };

function ShipmentDialog({
  orderId,
  shipment,
  onClose,
  onDone,
}: {
  orderId: string;
  shipment: OrderDetail['shipments'][number] | 'new' | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const isNew = shipment === 'new';
  const [couriers, setCouriers] = React.useState<Courier[] | null>(null);
  const [courierId, setCourierId] = React.useState('');
  const [tracking, setTracking] = React.useState(shipment && shipment !== 'new' ? (shipment.trackingNumber ?? '') : '');
  const [cost, setCost] = React.useState('');
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    if (!isNew) return;
    adminApi<{ items: Courier[] }>('/couriers')
      .then((r) => {
        const active = r.items.filter((c) => c.isActive);
        setCouriers(active);
        setCourierId(active[0]?.id ?? '');
      })
      .catch((e) => setError(errorText(e)));
  }, [isNew]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!shipment) return;
    setPending(true);
    try {
      if (isNew) {
        await adminApi(`/orders/${orderId}/shipments`, {
          method: 'POST',
          body: { courierId, trackingNumber: tracking.trim(), shippingCostPaisa: cost ? Number(cost) * 100 : null },
        });
      } else {
        await adminApi(`/shipments/${shipment.id}`, { method: 'PATCH', body: { trackingNumber: tracking.trim() } });
      }
      onDone();
    } catch (err) {
      if (err instanceof ApiError && err.fields.length) setErrors(fieldMap(err.fields));
      setError(errorText(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={shipment !== null} onOpenChange={(o) => !o && onClose()} title={isNew ? 'Add courier' : 'Edit tracking number'}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <FormAlert message={error} />
        {isNew &&
          (couriers && couriers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No couriers yet.{' '}
              <Link href="/admin/settings/couriers" className="font-medium text-primary underline">
                Add one in settings
              </Link>
              .
            </p>
          ) : (
            <Field id="ship-courier" label="Courier" error={errors.courierId}>
              <Select id="ship-courier" value={courierId} onChange={(e) => setCourierId(e.target.value)} disabled={!couriers}>
                {couriers?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          ))}
        <Field id="ship-tracking" label="Tracking number" error={errors.trackingNumber}>
          <Input
            id="ship-tracking"
            autoFocus
            autoCapitalize="characters"
            value={tracking}
            maxLength={64}
            onChange={(e) => setTracking(e.target.value)}
            aria-invalid={Boolean(errors.trackingNumber) || undefined}
            aria-describedby={describedBy('ship-tracking', errors.trackingNumber)}
          />
        </Field>
        {isNew && (
          <Field id="ship-cost" label="Courier charge in Rs. (optional)" help="What the courier bills you, for your records.">
            <Input id="ship-cost" inputMode="numeric" value={cost} onChange={(e) => setCost(e.target.value.replace(/\D/g, ''))} aria-describedby="ship-cost-help" />
          </Field>
        )}
        <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending || !tracking.trim() || (isNew && !courierId)}>
            {pending && <Loader2 className="animate-spin" />} Save
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
