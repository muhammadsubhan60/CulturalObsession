'use client';

import { rupeesToPaisa, storeSettingsInput } from '@co/shared';
import { Check, Loader2 } from 'lucide-react';
import * as React from 'react';
import { describedBy, Field, FormAlert } from '@/components/admin/form';
import { PageHeader } from '@/components/admin/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { adminApi, ApiError, type FieldError } from '@/lib/admin-api';

type Settings = { shipping: { flatPaisa: number; freeOverPaisa: number | null }; whatsapp: { number: string; message: string } | null };

const byPath = (fields: FieldError[]) => Object.fromEntries(fields.map((f) => [f.path, f.message]));
const rupees = (paisa: number | null | undefined) => (paisa ? String(paisa / 100) : '');

export function StoreSettings({ canEdit }: { canEdit: boolean }) {
  const [loaded, setLoaded] = React.useState(false);
  const [flat, setFlat] = React.useState('');
  const [freeOver, setFreeOver] = React.useState('');
  const [number, setNumber] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    adminApi<Settings>('/store-settings')
      .then((s) => {
        setFlat(rupees(s.shipping.flatPaisa));
        setFreeOver(rupees(s.shipping.freeOverPaisa));
        setNumber(s.whatsapp?.number ?? '');
        setMessage(s.whatsapp?.message ?? '');
        setLoaded(true);
      })
      .catch((e) => setFormError(e instanceof ApiError ? e.message : 'Something went wrong, please try again.'));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaved(false);
    const body = {
      shipping: { flatPaisa: flat ? rupeesToPaisa(flat) : 0, freeOverPaisa: freeOver ? rupeesToPaisa(freeOver) : null },
      whatsapp: { number, message },
    };
    const parsed = storeSettingsInput.safeParse(body);
    if (!parsed.success) {
      setErrors(byPath(parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))));
      return;
    }
    setErrors({});
    setPending(true);
    try {
      await adminApi('/store-settings', { method: 'PUT', body: parsed.data });
      setNumber(parsed.data.whatsapp.number);
      setFormError(null);
      setSaved(true);
    } catch (err) {
      if (err instanceof ApiError) setErrors(byPath(err.fields));
      setFormError(err instanceof ApiError ? err.message : 'Something went wrong, please try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <PageHeader title="Store settings" description="Delivery charges and the WhatsApp chat button." />
      <form noValidate onSubmit={save} className="flex max-w-2xl flex-col gap-4 px-4 py-6 md:px-8">
        <FormAlert message={formError} />
        {!canEdit && <p className="text-sm text-muted-foreground">Only owners and managers can change these settings.</p>}
        {!loaded && !formError ? (
          <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground" role="status">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </div>
        ) : (
          <fieldset disabled={!canEdit || !loaded} className="flex flex-col gap-4">
            <section className="rounded-lg border bg-card p-4" aria-label="Delivery charges">
              <h2 className="mb-3 font-semibold">Delivery charges</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="ship-flat" label="Delivery charge (Rs.)" error={errors['shipping.flatPaisa']} help="Leave empty for free delivery.">
                  <Input id="ship-flat" inputMode="numeric" value={flat} onChange={(e) => setFlat(e.target.value.replace(/\D/g, ''))} aria-describedby={describedBy('ship-flat', errors['shipping.flatPaisa'], 'help')} />
                </Field>
                <Field id="ship-free" label="Free delivery over (Rs.)" error={errors['shipping.freeOverPaisa']} help="Leave empty to always charge.">
                  <Input id="ship-free" inputMode="numeric" value={freeOver} onChange={(e) => setFreeOver(e.target.value.replace(/\D/g, ''))} aria-describedby={describedBy('ship-free', errors['shipping.freeOverPaisa'], 'help')} />
                </Field>
              </div>
            </section>
            <section className="rounded-lg border bg-card p-4" aria-label="WhatsApp">
              <h2 className="mb-3 font-semibold">WhatsApp chat button</h2>
              <div className="flex flex-col gap-4">
                <Field id="wa-number" label="WhatsApp number" error={errors['whatsapp.number']} help="Country code first, e.g. 923001234567.">
                  <Input id="wa-number" inputMode="tel" value={number} onChange={(e) => setNumber(e.target.value)} aria-invalid={Boolean(errors['whatsapp.number']) || undefined} aria-describedby={describedBy('wa-number', errors['whatsapp.number'], 'help')} />
                </Field>
                <Field id="wa-message" label="First message" error={errors['whatsapp.message']} help="On product pages the product, options and name are added below it.">
                  <Textarea id="wa-message" rows={2} maxLength={300} value={message} onChange={(e) => setMessage(e.target.value)} aria-describedby={describedBy('wa-message', errors['whatsapp.message'], 'help')} />
                </Field>
              </div>
            </section>
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="animate-spin" />} Save settings
              </Button>
              {saved && (
                <span role="status" className="flex items-center gap-1 text-sm text-success">
                  <Check className="size-4" aria-hidden /> Saved. The store updates within a minute.
                </span>
              )}
            </div>
          </fieldset>
        )}
      </form>
    </>
  );
}
