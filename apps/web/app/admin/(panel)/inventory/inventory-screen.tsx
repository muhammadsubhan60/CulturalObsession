'use client';

import { inventoryAdjustInput } from '@co/shared';
import { Boxes, Loader2, Search } from 'lucide-react';
import * as React from 'react';
import { Checkbox, describedBy, Field, FormAlert } from '@/components/admin/form';
import { PageHeader } from '@/components/admin/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { adminApi, ApiError, fieldMap } from '@/lib/admin-api';

type Row = {
  variantId: string;
  sku: string;
  variantTitle: string;
  product: { id: string; title: string };
  onHand: number;
  reserved: number;
  available: number;
  lowStockThreshold: number;
  low: boolean;
};

const REASONS = [
  { value: 'MANUAL_ADJUSTMENT', label: 'Stock count correction' },
  { value: 'OPENING_STOCK', label: 'New stock received' },
  { value: 'RETURN_RESTOCKED', label: 'Customer return restocked' },
  { value: 'DAMAGED', label: 'Damaged or lost' },
] as const;

export function InventoryScreen() {
  const [q, setQ] = React.useState('');
  const [lowOnly, setLowOnly] = React.useState(false);
  const [items, setItems] = React.useState<Row[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [adjusting, setAdjusting] = React.useState<Row | null>(null);

  const load = React.useCallback(async () => {
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (lowOnly) params.set('lowOnly', 'true');
    try {
      setItems((await adminApi<{ items: Row[] }>(`/inventory?${params}`)).items);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong, please try again.');
    }
  }, [q, lowOnly]);

  React.useEffect(() => {
    const t = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(t);
  }, [load]);

  return (
    <>
      <PageHeader title="Inventory" description="Stock for ready-made items. Made-to-order variants are not counted." />
      <div className="flex flex-col gap-4 px-4 py-6 md:px-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input type="search" aria-label="Search by product or SKU" placeholder="Search by product or SKU" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Checkbox id="inv-low" label="Low stock only" checked={lowOnly} onChange={setLowOnly} />
        </div>
        <FormAlert message={error} />
        {items === null && !error ? (
          <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground" role="status">
            <Loader2 className="size-4 animate-spin" /> Loading stock…
          </div>
        ) : items && items.length === 0 ? (
          <div className="mx-auto flex max-w-md flex-col items-center rounded-lg border border-dashed bg-card px-6 py-12 text-center">
            <Boxes className="size-8 text-primary" aria-hidden />
            <p className="mt-3 font-medium">{lowOnly || q ? 'Nothing matches' : 'No tracked stock yet'}</p>
            <p className="mt-1 text-sm text-muted-foreground">Variants with “Track stock” turned on appear here.</p>
          </div>
        ) : items ? (
          <ul className="divide-y overflow-hidden rounded-lg border bg-card">
            {items.map((row) => (
              <li key={row.variantId} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3">
                <div className="min-w-0 basis-full sm:basis-auto sm:flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{row.product.title}</span>
                    <span className="text-sm text-muted-foreground">· {row.variantTitle}</span>
                    {row.low && <Badge tone="danger">Low stock</Badge>}
                  </div>
                  <div className="mt-0.5 font-mono text-xs text-muted-foreground">{row.sku}</div>
                </div>
                <dl className="flex flex-1 gap-4 text-sm tabular-nums sm:flex-none">
                  <div>
                    <dt className="text-xs text-muted-foreground">On hand</dt>
                    <dd className="font-medium">{row.onHand}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Reserved</dt>
                    <dd>{row.reserved}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Available</dt>
                    <dd className={row.low ? 'font-semibold text-destructive' : 'font-semibold'}>{row.available}</dd>
                  </div>
                </dl>
                <Button variant="outline" size="sm" onClick={() => setAdjusting(row)}>
                  Adjust
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <AdjustDialog
        key={adjusting?.variantId ?? 'closed'}
        row={adjusting}
        onClose={() => setAdjusting(null)}
        onSaved={() => {
          setAdjusting(null);
          void load();
        }}
      />
    </>
  );
}

function AdjustDialog({ row, onClose, onSaved }: { row: Row | null; onClose: () => void; onSaved: () => void }) {
  const [direction, setDirection] = React.useState<'add' | 'remove'>('add');
  const [amount, setAmount] = React.useState('');
  const [reason, setReason] = React.useState<(typeof REASONS)[number]['value']>('OPENING_STOCK');
  const [note, setNote] = React.useState('');
  const [threshold, setThreshold] = React.useState(String(row?.lowStockThreshold ?? 3));
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const qty = Number(amount) || 0;
  const after = row ? row.onHand + (direction === 'add' ? qty : -qty) : 0;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!row) return;
    const parsed = inventoryAdjustInput.safeParse({
      delta: direction === 'add' ? qty : -qty,
      reason,
      note,
      lowStockThreshold: Number(threshold),
    });
    if (!parsed.success) {
      setErrors(fieldMap(parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))));
      return;
    }
    if (after < row.reserved) {
      setErrors({ delta: `Stock cannot go below the ${row.reserved} reserved for open orders.` });
      return;
    }
    setErrors({});
    setPending(true);
    try {
      await adminApi(`/variants/${row.variantId}/inventory`, { method: 'POST', body: parsed.data });
      onSaved();
    } catch (err) {
      setFormError(err instanceof ApiError ? (err.status === 400 ? 'Stock cannot go below zero or below reserved units.' : err.message) : 'Something went wrong, please try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={row !== null} onOpenChange={(o) => !o && onClose()} title="Adjust stock" description={row ? `${row.product.title} · ${row.variantTitle}` : undefined}>
      <form noValidate onSubmit={save} className="flex flex-col gap-4">
        <FormAlert message={formError} />
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Add or remove stock">
          {(['add', 'remove'] as const).map((d) => (
            <Button
              key={d}
              type="button"
              role="radio"
              aria-checked={direction === d}
              variant={direction === d ? 'default' : 'outline'}
              onClick={() => {
                setDirection(d);
                setReason(d === 'add' ? 'OPENING_STOCK' : 'DAMAGED');
              }}
            >
              {d === 'add' ? 'Add stock' : 'Remove stock'}
            </Button>
          ))}
        </div>
        <Field id="adj-qty" label="Quantity" error={errors.delta} help={row ? `On hand after this change: ${after}` : undefined}>
          <Input
            id="adj-qty"
            inputMode="numeric"
            autoFocus
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
            aria-invalid={Boolean(errors.delta) || undefined}
            aria-describedby={describedBy('adj-qty', errors.delta, 'help')}
          />
        </Field>
        <Field id="adj-reason" label="Reason">
          <Select id="adj-reason" value={reason} onChange={(e) => setReason(e.target.value as typeof reason)}>
            {REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="adj-note" label="Note (optional)" error={errors.note}>
          <Input id="adj-note" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <Field id="adj-threshold" label="Low-stock alert at" error={errors.lowStockThreshold} help="Flag this item when available stock reaches this number.">
          <Input
            id="adj-threshold"
            inputMode="numeric"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value.replace(/\D/g, ''))}
            aria-describedby={describedBy('adj-threshold', errors.lowStockThreshold, 'help')}
          />
        </Field>
        <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending || qty === 0}>
            {pending && <Loader2 className="animate-spin" />} Save
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
