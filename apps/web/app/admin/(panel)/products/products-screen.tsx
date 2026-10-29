'use client';

import { formatPkr } from '@co/shared';
import { ChevronLeft, ChevronRight, Gem, Loader2, Plus, Search } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { FormAlert } from '@/components/admin/form';
import { PageHeader } from '@/components/admin/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { adminApi, ApiError } from '@/lib/admin-api';
import { type ProductRow, type ProductStatus, STATUS_LABEL, STATUS_TONE, TYPE_LABEL } from '@/lib/catalog-types';

type ListResponse = { items: ProductRow[]; total: number; page: number; pageSize: number };

function stockLabel(p: ProductRow) {
  return p.stockOnHand === null ? 'Made to order' : `${p.stockOnHand} in stock`;
}

export function ProductsScreen() {
  const [q, setQ] = React.useState('');
  const [status, setStatus] = React.useState<'' | ProductStatus>('');
  const [page, setPage] = React.useState(1);
  const [data, setData] = React.useState<ListResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      const params = new URLSearchParams({ page: String(page) });
      if (q.trim()) params.set('q', q.trim());
      if (status) params.set('status', status);
      try {
        const res = await adminApi<ListResponse>(`/products?${params}`);
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
  }, [q, status, page]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <>
      <PageHeader
        title="Products"
        description="Catalogue, variants and prices."
        actions={
          <Button asChild>
            <Link href="/admin/products/new">
              <Plus /> New product
            </Link>
          </Button>
        }
      />
      <div className="flex flex-col gap-4 px-4 py-6 md:px-8">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              aria-label="Search products by name or SKU"
              placeholder="Search by name or SKU"
              className="pl-9"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="sm:w-48">
            <Select
              aria-label="Filter by status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as '' | ProductStatus);
                setPage(1);
              }}
            >
              <option value="">Draft & active</option>
              <option value="ACTIVE">Active</option>
              <option value="DRAFT">Draft</option>
              <option value="ARCHIVED">Archived</option>
            </Select>
          </div>
        </div>

        <FormAlert message={error} />

        {loading && !data ? (
          <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground" role="status">
            <Loader2 className="size-4 animate-spin" /> Loading products…
          </div>
        ) : data && data.items.length === 0 ? (
          <div className="mx-auto flex max-w-md flex-col items-center rounded-lg border border-dashed bg-card px-6 py-12 text-center">
            <Gem className="size-8 text-primary" aria-hidden />
            <p className="mt-3 font-medium">{q || status ? 'No products match' : 'No products yet'}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {q || status ? 'Try a different search or filter.' : 'Add your first product, or import the Shopify catalogue in Phase 2.'}
            </p>
          </div>
        ) : data ? (
          <>
            <div className="hidden overflow-hidden rounded-lg border bg-card md:block">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-semibold">Product</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Type</th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">Price</th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">Stock</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.items.map((p) => (
                    <tr key={p.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <Link href={`/admin/products/${p.id}`} className="font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                          {p.title}
                        </Link>
                        <div className="text-xs text-muted-foreground">{p.variantCount} variant{p.variantCount === 1 ? '' : 's'}</div>
                      </td>
                      <td className="px-4 py-3"><Badge tone={STATUS_TONE[p.status]}>{STATUS_LABEL[p.status]}</Badge></td>
                      <td className="px-4 py-3 text-muted-foreground">{TYPE_LABEL[p.productType]}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{p.minPricePaisa === null ? '—' : formatPkr(p.minPricePaisa)}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{stockLabel(p)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="flex flex-col gap-2 md:hidden">
              {data.items.map((p) => (
                <li key={p.id}>
                  <Link href={`/admin/products/${p.id}`} className="block rounded-lg border bg-card p-4 active:bg-muted/40">
                    <div className="flex items-start justify-between gap-3">
                      <span className="font-medium">{p.title}</span>
                      <Badge tone={STATUS_TONE[p.status]}>{STATUS_LABEL[p.status]}</Badge>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 text-sm text-muted-foreground">
                      <span className="tabular-nums">{p.minPricePaisa === null ? 'No price' : formatPkr(p.minPricePaisa)}</span>
                      <span>{stockLabel(p)}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>

            {pages > 1 && (
              <nav aria-label="Pages" className="flex items-center justify-between">
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
