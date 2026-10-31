'use client';

import { formatPkr } from '@co/shared';
import { Loader2 } from 'lucide-react';
import * as React from 'react';
import { describedBy, Field, FormAlert } from '@/components/admin/form';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { adminApi, ApiError } from '@/lib/admin-api';

const errorText = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong, please try again.');

/** Confirms an advance payment as received (or not) — used on the order page and the payments queue. */
export function VerifyDialog({
  state,
  onClose,
  onDone,
}: {
  state: { payment: { id: string; amountPaisa: number; providerReference: string | null }; decision: 'approve' | 'reject' } | null;
  onClose: () => void;
  onDone: (approved: boolean) => void;
}) {
  const [reference, setReference] = React.useState('');
  const [note, setNote] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const approve = state?.decision === 'approve';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!state) return;
    setPending(true);
    try {
      await adminApi(`/payments/${state.payment.id}/verify`, { method: 'POST', body: { decision: state.decision, reference, note } });
      onDone(approve);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={state !== null}
      onOpenChange={(o) => !o && onClose()}
      title={approve ? 'Advance received?' : 'Advance not received?'}
      description={state ? `${formatPkr(state.payment.amountPaisa)}${state.payment.providerReference ? ` · TID ${state.payment.providerReference}` : ''}` : undefined}
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <FormAlert message={error} />
        <p className="text-sm text-muted-foreground">
          {approve
            ? 'Check the amount has arrived in the account before confirming. The order moves to Confirmed.'
            : 'The customer can pay again; the order keeps waiting for its advance.'}
        </p>
        {approve && !state?.payment.providerReference && (
          <Field id="verify-ref" label="Transaction ID (optional)" help="From the customer's screenshot. The same ID cannot be used twice.">
            <Input id="verify-ref" value={reference} maxLength={80} onChange={(e) => setReference(e.target.value)} aria-describedby={describedBy('verify-ref', undefined, 'help')} />
          </Field>
        )}
        <Field id="verify-note" label="Note (optional)">
          <Input id="verify-note" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose}>
            Back
          </Button>
          <Button type="submit" variant={approve ? 'default' : 'destructive'} disabled={pending}>
            {pending && <Loader2 className="animate-spin" />} {approve ? 'Mark received' : 'Mark not received'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
