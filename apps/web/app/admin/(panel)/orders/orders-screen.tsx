'use client';

import { formatPkr } from '@co/shared';
import { ChevronLeft, ChevronRight, Loader2, Palette, Plus, ReceiptText, Search, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';
import { FormAlert } from '@/components/admin/form';
import { PageHeader } from '@/components/admin/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { adminApi, ApiError } from '@/lib/admin-api';
import { formatWhen, type OrderListItem, type OrderSource, type OrderStatus, SOURCE_LABEL, STATUS_LABEL, STATUS_TONE } from '@/lib/order-types';
import { cn } from '@/lib/utils';

type ListResponse = { items: OrderListItem[]; total: number; page: number; pageSize: number; counts: Partial<Record<OrderStatus, number>> };

const FILTERS: { value: '' | 'open' | OrderStatus; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'PENDING', label: STATUS_LABEL.PENDING },
  { value: 'CONFIRMATION_REQUIRED', label: STATUS_LABEL.CONFIRMATION_REQUIRED },
  { value: 'CONFIRMED', label: STATUS_LABEL.CONFIRMED },
  { value: 'IN_PRODUCTION', label: STATUS_LABEL.IN_PRODUCTION },
  { value: 'READY_TO_DISPATCH', label: STATUS_LABEL.READY_TO_DISPATCH },
  { value: 'SHIPPED', label: STATUS_LABEL.SHIPPED },
  { value: 'DELIVERED', label: STATUS_LABEL.DELIVERED },
  { value: 'CANCELLED', label: STATUS_LABEL.CANCELLED },
  { value: 'RETURNED', label: STATUS_LABEL.RETURNED },
  { value: '', label: 'All' },
];
const OPEN: OrderStatus[] = ['PENDING', 'CONFIRMATION_REQUIRED', 'CONFIRMED', 'IN_PRODUCTION', 'READY_TO_DISPATCH', 'SHIPPED'];

export function OrdersScreen() {
  const router = useRouter();
  const params = useSearchParams();
  // Filters live in the URL so a filtered inbox can be bookmarked and Back works.
  // No status param = the open inbox; "all" = no status filter.
  const rawStatus = params.get('status');
  const status = (rawStatus === null ? 'open' : rawStatus === 'all' ? '' : rawStatus) as (typeof FILTERS)[number]['value'];
  const source = (params.get('source') ?? '') as '' | OrderSource;
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [q, setQ] = React.useState(params.get('q') ?? '');
  const [data, setData] = React.useState<ListResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  const setParam = React.useCallback(
    (next: Record<string, string>) => {
      const p = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(next)) {
        if (v) p.set(k, v);
        else p.delete(k);
      }
      if (!('page' in next)) p.delete('page');
      router.replace(`/admin/orders?${p}`, { scroll: false });
    },
    [params, router],
  );

  React.useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      const query = new URLSearchParams({ page: String(page) });
      if (status) query.set('status', status);
      if (source) query.set('source', source);
      if (q.trim()) query.set('q', q.trim());
      try {
        const res = await adminApi<ListResponse>(`/orders?${query}`);
        if (!cancelled) {
          setData(res);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof ApiError ? e.message : 'Something went wrong, please try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [q, status, source, page]);

  const counts = data?.counts ?? {};
  const countFor = (v: (typeof FILTERS)[number]['value']) =>
    v === 'open' ? OPEN.reduce((s, k) => s + (counts[k] ?? 0), 0) : v ? (counts[v] ?? 0) : null;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <>
      <PageHeader
        title="Orders"
        description="Website, WhatsApp and phone orders in one inbox."
        actions={
          <Button asChild>
            <Link href="/admin/orders/new">
              <Plus /> New order
            </Link>
          </Button>
        }
      />
      <div className="flex flex-col gap-4 px-4 py-6 md:px-8">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
          {FILTERS.map((f) => {
            const n = countFor(f.value);
            const active = status === f.value;
            return (
              <button
                key={f.value || 'all'}
                type="button"
                aria-pressed={active}
                onClick={() => setParam({ status: f.value === 'open' ? '' : f.value || 'all' })}
                className={cn(
                  'inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-accent',
                )}
              >
                {f.label}
                {n ? <span className={cn('tabular-nums text-xs', active ? 'opacity-80' : 'text-muted-foreground')}>{n}</span> : null}
              </button>
            );
          })}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              aria-label="Search by order number, name or phone"
              placeholder="Order number, name or phone"
              className="pl-9"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                if (page !== 1) setParam({ page: '' });
              }}
            />
          </div>
          <div className="sm:w-48">
            <Select aria-label="Order source" value={source} onChange={(e) => setParam({ source: e.target.value })}>
              <option value="">All sources</option>
              {(Object.keys(SOURCE_LABEL) as OrderSource[]).map((s) => (
                <option key={s} value={s}>
                  {SOURCE_LABEL[s]}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <FormAlert message={error} />

        {data === null && loading ? (
          <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground" role="status">
            <Loader2 className="size-4 animate-spin" /> Loading orders…
          </div>
        ) : data && data.items.length === 0 ? (
          <div className="mx-auto flex max-w-md flex-col items-center rounded-lg border border-dashed bg-card px-6 py-12 text-center">
            <ReceiptText className="size-8 text-primary" aria-hidden />
            <p className="mt-3 font-medium">{q || source || status !== 'open' ? 'No orders match' : 'Nothing waiting'}</p>
            <p className="mt-1 text-sm text-muted-foreground">New website orders appear here as soon as they are placed.</p>
          </div>
        ) : data ? (
          <div className={cn('transition-opacity', loading && 'opacity-60')} aria-busy={loading}>
            <ul className="divide-y overflow-hidden rounded-lg border bg-card">
              {data.items.map((o) => (
                <li key={o.id}>
                  <Link
                    href={`/admin/orders/${o.id}`}
                    className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 hover:bg-accent/60 focus-visible:bg-accent focus-visible:outline-none"
                  >
                    <div className="min-w-0 flex-1 basis-56">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-semibold text-primary">{o.orderNumber}</span>
                        <Badge tone={STATUS_TONE[o.status]}>{STATUS_LABEL[o.status]}</Badge>
                        {o.advanceStatus === 'AWAITING_VERIFICATION' && (
                          <Badge tone="warning">
                            <Wallet aria-hidden className="mr-1 size-3" /> Advance to verify
                          </Badge>
                        )}
                        {o.personalizationPending > 0 && (
                          <Badge tone="warning">
                            <Palette aria-hidden className="mr-1 size-3" /> Approve design
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1 truncate text-sm">
                        {o.recipientName}
                        <span className="text-muted-foreground">
                          {' '}
                          · {o.city ?? '—'} · {o.itemCount} {o.itemCount === 1 ? 'item' : 'items'}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-sm sm:flex-col sm:items-end sm:gap-0.5">
                      <span className="font-semibold tabular-nums">{formatPkr(o.totalPaisa)}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatWhen(o.createdAt)} · {SOURCE_LABEL[o.source]}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            {pages > 1 && (
              <nav className="mt-4 flex items-center justify-between" aria-label="Pagination">
                <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setParam({ page: String(page - 1) })}>
                  <ChevronLeft /> Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {page} of {pages}
                </span>
                <Button variant="outline" size="sm" disabled={page >= pages || loading} onClick={() => setParam({ page: String(page + 1) })}>
                  Next <ChevronRight />
                </Button>
              </nav>
            )}
          </div>
        ) : null}
      </div>
    </>
  );
}
