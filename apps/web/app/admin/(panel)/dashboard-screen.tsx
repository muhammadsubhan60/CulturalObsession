'use client';

import { formatPkr } from '@co/shared';
import { Boxes, Loader2, type LucideIcon, Package, Palette, PhoneCall, Truck, Wallet } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { FormAlert } from '@/components/admin/form';
import { PageHeader } from '@/components/admin/page-header';
import { Badge } from '@/components/ui/badge';
import { adminApi, ApiError } from '@/lib/admin-api';
import { formatWhen, type OrderSource, type OrderStatus, SOURCE_LABEL, STATUS_LABEL, STATUS_TONE } from '@/lib/order-types';
import { cn } from '@/lib/utils';

type Dashboard = {
  statusCounts: Partial<Record<OrderStatus, number>>;
  advancesToVerify: number;
  personalizationToApprove: number;
  today: { orders: number; revenuePaisa: number };
  lowStock: number;
  recent: { id: string; orderNumber: string; status: OrderStatus; source: OrderSource; recipientName: string; totalPaisa: number; createdAt: string }[];
};

export function DashboardScreen({ name }: { name: string }) {
  const [data, setData] = React.useState<Dashboard | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    adminApi<Dashboard>('/dashboard')
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Something went wrong, please try again.'));
  }, []);

  const c = data?.statusCounts ?? {};
  const tasks: { label: string; count: number; href: string; icon: LucideIcon }[] = data
    ? [
        { label: 'Orders to confirm by phone', count: c.PENDING ?? 0, href: '/admin/orders?status=PENDING', icon: PhoneCall },
        { label: 'Advance payments to verify', count: data.advancesToVerify, href: '/admin/payments', icon: Wallet },
        { label: 'Designs to approve', count: data.personalizationToApprove, href: '/admin/orders', icon: Palette },
        { label: 'In production', count: c.IN_PRODUCTION ?? 0, href: '/admin/orders?status=IN_PRODUCTION', icon: Package },
        { label: 'Ready to dispatch', count: c.READY_TO_DISPATCH ?? 0, href: '/admin/orders?status=READY_TO_DISPATCH', icon: Truck },
        { label: 'Low-stock items', count: data.lowStock, href: '/admin/inventory', icon: Boxes },
      ]
    : [];

  return (
    <>
      <PageHeader title={`Salam, ${name.split(' ')[0]}`} description="What needs doing today." />
      <div className="flex flex-col gap-6 px-4 py-6 md:px-8">
        <FormAlert message={error} />
        {!data && !error ? (
          <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground" role="status">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </div>
        ) : data ? (
          <>
            <dl className="grid grid-cols-2 gap-3 sm:max-w-md">
              <div className="rounded-lg border bg-card p-4">
                <dt className="text-sm text-muted-foreground">Orders today</dt>
                <dd className="mt-1 font-serif text-2xl font-bold text-primary tabular-nums">{data.today.orders}</dd>
              </div>
              <div className="rounded-lg border bg-card p-4">
                <dt className="text-sm text-muted-foreground">Sales today</dt>
                <dd className="mt-1 font-serif text-2xl font-bold text-primary tabular-nums">{formatPkr(data.today.revenuePaisa).replace(' PKR', '')}</dd>
              </div>
            </dl>
            <section aria-label="Work queue">
              <h2 className="mb-3 font-semibold">Work queue</h2>
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {tasks.map((t) => (
                  <li key={t.label}>
                    <Link
                      href={t.href}
                      className={cn(
                        'flex min-h-16 items-center gap-3 rounded-lg border bg-card p-4 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        t.count === 0 && 'opacity-70',
                      )}
                    >
                      <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-full', t.count ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
                        <t.icon className="size-5" aria-hidden />
                      </span>
                      <span className="flex-1 text-sm">{t.label}</span>
                      <span className="font-serif text-xl font-bold tabular-nums">{t.count}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
            <section aria-label="Latest orders">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-semibold">Latest orders</h2>
                <Link href="/admin/orders?status=all" className="text-sm font-medium text-primary hover:underline">
                  View all
                </Link>
              </div>
              {data.recent.length === 0 ? (
                <p className="text-sm text-muted-foreground">No orders yet.</p>
              ) : (
                <ul className="divide-y overflow-hidden rounded-lg border bg-card">
                  {data.recent.map((o) => (
                    <li key={o.id}>
                      <Link href={`/admin/orders/${o.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-accent/60">
                        <span className="font-mono text-sm font-semibold text-primary">{o.orderNumber}</span>
                        <Badge tone={STATUS_TONE[o.status]}>{STATUS_LABEL[o.status]}</Badge>
                        <span className="min-w-0 flex-1 truncate text-sm">{o.recipientName}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatWhen(o.createdAt)} · {SOURCE_LABEL[o.source]}
                        </span>
                        <span className="text-sm font-semibold tabular-nums">{formatPkr(o.totalPaisa)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        ) : null}
      </div>
    </>
  );
}
