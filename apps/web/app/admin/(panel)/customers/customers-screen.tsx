'use client';

import { formatPkr } from '@co/shared';
import { ChevronLeft, ChevronRight, Loader2, MessageCircle, Search, Users } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { FormAlert } from '@/components/admin/form';
import { PageHeader } from '@/components/admin/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { adminApi, ApiError } from '@/lib/admin-api';
import { formatWhen, type OrderStatus, whatsappLink } from '@/lib/order-types';

type Customer = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  city: string | null;
  orderCount: number;
  spentPaisa: number;
  lastOrder: { id: string; orderNumber: string; status: OrderStatus; createdAt: string } | null;
};
type ListResponse = { items: Customer[]; total: number; page: number; pageSize: number };

export function CustomersScreen() {
  const [q, setQ] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [data, setData] = React.useState<ListResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    const t = window.setTimeout(async () => {
      setLoading(true);
      const params = new URLSearchParams({ page: String(page) });
      if (q.trim()) params.set('q', q.trim());
      try {
        const res = await adminApi<ListResponse>(`/customers?${params}`);
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
      window.clearTimeout(t);
    };
  }, [q, page]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <>
      <PageHeader title="Customers" description="Everyone who has ordered, by phone number." />
      <div className="flex flex-col gap-4 px-4 py-6 md:px-8">
        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label="Search by name, phone or email"
            placeholder="Name, phone or email"
            className="pl-9"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <FormAlert message={error} />
        {data === null && loading ? (
          <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground" role="status">
            <Loader2 className="size-4 animate-spin" /> Loading customers…
          </div>
        ) : data && data.items.length === 0 ? (
          <div className="mx-auto flex max-w-md flex-col items-center rounded-lg border border-dashed bg-card px-6 py-12 text-center">
            <Users className="size-8 text-primary" aria-hidden />
            <p className="mt-3 font-medium">{q ? 'No customers match' : 'No customers yet'}</p>
          </div>
        ) : data ? (
          <>
            <ul className="divide-y overflow-hidden rounded-lg border bg-card" aria-busy={loading}>
              {data.items.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                  <div className="min-w-0 flex-1 basis-56">
                    <div className="font-medium">{c.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {c.phone}
                      {c.city ? ` · ${c.city}` : ''}
                      {c.email ? ` · ${c.email}` : ''}
                    </div>
                    {c.lastOrder && (
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        Last order{' '}
                        <Link href={`/admin/orders/${c.lastOrder.id}`} className="font-mono text-primary hover:underline">
                          {c.lastOrder.orderNumber}
                        </Link>{' '}
                        · {formatWhen(c.lastOrder.createdAt)}
                      </div>
                    )}
                  </div>
                  <div className="text-right text-sm">
                    <div className="font-semibold tabular-nums">{formatPkr(c.spentPaisa)}</div>
                    <div className="text-xs text-muted-foreground">
                      {c.orderCount} {c.orderCount === 1 ? 'order' : 'orders'}
                    </div>
                  </div>
                  <Button asChild size="icon" variant="ghost" aria-label={`WhatsApp ${c.name}`}>
                    <a href={whatsappLink(c.phone)} target="_blank" rel="noopener noreferrer">
                      <MessageCircle />
                    </a>
                  </Button>
                </li>
              ))}
            </ul>
            {pages > 1 && (
              <nav className="flex items-center justify-between" aria-label="Pagination">
                <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft /> Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {page} of {pages}
                </span>
                <Button variant="outline" size="sm" disabled={page >= pages || loading} onClick={() => setPage((p) => p + 1)}>
                  Next <ChevronRight />
                </Button>
              </nav>
            )}
          </>
        ) : null}
      </div>
    </>
  );
}
