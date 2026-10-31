'use client';

import { formatPkr } from '@co/shared';
import { Check, Loader2, Wallet } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { FormAlert } from '@/components/admin/form';
import { PageHeader } from '@/components/admin/page-header';
import { VerifyDialog } from '@/components/admin/verify-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { adminApi, ApiError } from '@/lib/admin-api';
import { formatWhen, METHOD_LABEL, PAYMENT_STATUS, type PaymentMethod, type PaymentStatus, STATUS_LABEL, type OrderStatus } from '@/lib/order-types';

type QueueItem = {
  id: string;
  method: PaymentMethod;
  status: PaymentStatus;
  amountPaisa: number;
  providerReference: string | null;
  createdAt: string;
  paymentAccount: { label: string; accountNumber: string | null; iban: string | null } | null;
  order: { id: string; orderNumber: string; recipientName: string; recipientPhone: string; totalPaisa: number; status: OrderStatus; createdAt: string };
};

export function PaymentsScreen() {
  const [items, setItems] = React.useState<QueueItem[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [verifying, setVerifying] = React.useState<{ payment: QueueItem; decision: 'approve' | 'reject' } | null>(null);

  const load = React.useCallback(async () => {
    try {
      setItems((await adminApi<{ items: QueueItem[] }>('/payments/queue')).items);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong, please try again.');
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const toVerify = items?.filter((p) => p.status === 'AWAITING_VERIFICATION') ?? [];
  const notPaid = items?.filter((p) => p.status === 'PENDING') ?? [];

  return (
    <>
      <PageHeader title="Advance payments" description="Customers who sent an advance by bank, Raast or wallet. Check your account, then mark each one." />
      <div className="flex flex-col gap-6 px-4 py-6 md:px-8">
        <FormAlert message={error} />
        {notice && (
          <div role="status" className="flex items-center gap-2 rounded-md border border-success/30 bg-success/5 px-3 py-2 text-sm text-success">
            <Check aria-hidden className="size-4" /> {notice}
          </div>
        )}
        {items === null && !error ? (
          <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground" role="status">
            <Loader2 className="size-4 animate-spin" /> Loading payments…
          </div>
        ) : items && items.length === 0 ? (
          <div className="mx-auto flex max-w-md flex-col items-center rounded-lg border border-dashed bg-card px-6 py-12 text-center">
            <Wallet className="size-8 text-primary" aria-hidden />
            <p className="mt-3 font-medium">All caught up</p>
            <p className="mt-1 text-sm text-muted-foreground">No advance payments are waiting.</p>
          </div>
        ) : (
          <>
            <Group title="To verify" hint="The customer entered a transaction ID." items={toVerify} onDecide={(payment, decision) => setVerifying({ payment, decision })} />
            <Group title="Not paid yet" hint="Waiting for the customer to send the advance." items={notPaid} onDecide={(payment, decision) => setVerifying({ payment, decision })} />
          </>
        )}
      </div>
      <VerifyDialog
        key={`${verifying?.payment.id}-${verifying?.decision}`}
        state={verifying}
        onClose={() => setVerifying(null)}
        onDone={(approved) => {
          setNotice(`${verifying?.payment.order.orderNumber}: advance marked as ${approved ? 'received' : 'not received'}`);
          setVerifying(null);
          void load();
        }}
      />
    </>
  );
}

function Group({ title, hint, items, onDecide }: { title: string; hint: string; items: QueueItem[]; onDecide: (p: QueueItem, d: 'approve' | 'reject') => void }) {
  if (items.length === 0) return null;
  return (
    <section aria-label={title}>
      <h2 className="font-semibold">
        {title} <span className="font-normal text-muted-foreground">({items.length})</span>
      </h2>
      <p className="text-sm text-muted-foreground">{hint}</p>
      <ul className="mt-3 divide-y overflow-hidden rounded-lg border bg-card">
        {items.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3">
            <div className="min-w-0 flex-1 basis-60">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/admin/orders/${p.order.id}`} className="font-mono text-sm font-semibold text-primary hover:underline">
                  {p.order.orderNumber}
                </Link>
                <Badge tone={PAYMENT_STATUS[p.status].tone}>{PAYMENT_STATUS[p.status].label}</Badge>
                <span className="text-xs text-muted-foreground">{STATUS_LABEL[p.order.status]}</span>
              </div>
              <div className="mt-1 text-sm">
                {p.order.recipientName} <span className="text-muted-foreground">· {p.order.recipientPhone}</span>
              </div>
              <div className="mt-0.5 text-sm text-muted-foreground">
                {METHOD_LABEL[p.method]}
                {p.paymentAccount ? ` → ${p.paymentAccount.label}` : ''}
                {p.providerReference ? (
                  <>
                    {' · '}TID <span className="font-mono text-foreground">{p.providerReference}</span>
                  </>
                ) : null}
                {' · '}
                {formatWhen(p.order.createdAt)}
              </div>
            </div>
            <div className="text-right">
              <div className="font-semibold tabular-nums">{formatPkr(p.amountPaisa)}</div>
              <div className="text-xs text-muted-foreground">of {formatPkr(p.order.totalPaisa)}</div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => onDecide(p, 'approve')}>
                Mark received
              </Button>
              <Button size="sm" variant="outline" onClick={() => onDecide(p, 'reject')}>
                Not received
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
