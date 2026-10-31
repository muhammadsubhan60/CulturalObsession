'use client';

import { courierInput } from '@co/shared';
import { Loader2, Pencil, Plus, Truck } from 'lucide-react';
import * as React from 'react';
import { Checkbox, describedBy, DialogActions, Field, FormAlert } from '@/components/admin/form';
import { PageHeader } from '@/components/admin/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { adminApi, ApiError, fieldMap } from '@/lib/admin-api';

type Courier = { id: string; name: string; code: string; isActive: boolean; trackingUrlTemplate: string | null; _count: { shipments: number } };

/** Common Pakistani couriers. Tracking links differ per account, so staff paste their own. */
const PRESETS = [
  { name: 'TCS', code: 'tcs' },
  { name: 'Leopards Courier', code: 'leopards' },
  { name: 'PostEx', code: 'postex' },
  { name: 'Trax', code: 'trax' },
  { name: 'M&P', code: 'mnp' },
];

export function CouriersSettings({ canEdit }: { canEdit: boolean }) {
  const [items, setItems] = React.useState<Courier[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<Courier | Partial<Courier> | null>(null);

  const load = React.useCallback(async () => {
    try {
      setItems((await adminApi<{ items: Courier[] }>('/couriers')).items);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong, please try again.');
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const unused = PRESETS.filter((p) => !items?.some((c) => c.code === p.code));

  return (
    <>
      <PageHeader
        title="Couriers"
        description="Book parcels on the courier's portal, then add the tracking number to the order. Customers get the tracking link."
        actions={
          canEdit ? (
            <Button onClick={() => setEditing({})}>
              <Plus /> Add courier
            </Button>
          ) : undefined
        }
      />
      <div className="flex flex-col gap-4 px-4 py-6 md:px-8">
        <FormAlert message={error} />
        {items === null && !error ? (
          <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground" role="status">
            <Loader2 className="size-4 animate-spin" /> Loading couriers…
          </div>
        ) : items ? (
          <>
            {items.length === 0 ? (
              <div className="mx-auto flex max-w-md flex-col items-center rounded-lg border border-dashed bg-card px-6 py-12 text-center">
                <Truck className="size-8 text-primary" aria-hidden />
                <p className="mt-3 font-medium">No couriers yet</p>
                <p className="mt-1 text-sm text-muted-foreground">Add the couriers you use to start dispatching orders.</p>
              </div>
            ) : (
              <ul className="divide-y overflow-hidden rounded-lg border bg-card">
                {items.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{c.name}</span>
                        {!c.isActive && <Badge>Off</Badge>}
                      </div>
                      <div className="mt-0.5 break-all text-sm text-muted-foreground">
                        {c.trackingUrlTemplate ?? 'No tracking link'} · {c._count.shipments} {c._count.shipments === 1 ? 'parcel' : 'parcels'}
                      </div>
                    </div>
                    {canEdit && (
                      <Button size="icon" variant="ghost" aria-label={`Edit ${c.name}`} onClick={() => setEditing(c)}>
                        <Pencil />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {canEdit && unused.length > 0 && (
              <div>
                <p className="text-sm text-muted-foreground">Quick add:</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {unused.map((p) => (
                    <Button key={p.code} size="sm" variant="outline" onClick={() => setEditing({ ...p, isActive: true })}>
                      <Plus /> {p.name}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : null}
      </div>
      <CourierDialog
        key={editing ? (editing.id ?? editing.code ?? 'new') : 'closed'}
        courier={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          void load();
        }}
      />
    </>
  );
}

function CourierDialog({ courier, onClose, onSaved }: { courier: Partial<Courier> | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = React.useState({
    name: courier?.name ?? '',
    code: courier?.code ?? '',
    trackingUrlTemplate: courier?.trackingUrlTemplate ?? '',
    isActive: courier?.isActive ?? true,
  });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const body = { ...form, code: form.code || form.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') };
    const parsed = courierInput.safeParse(body);
    if (!parsed.success) {
      setErrors(fieldMap(parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))));
      return;
    }
    setErrors({});
    setPending(true);
    try {
      await adminApi(courier?.id ? `/couriers/${courier.id}` : '/couriers', { method: courier?.id ? 'PUT' : 'POST', body });
      onSaved();
    } catch (err) {
      if (err instanceof ApiError) setErrors(fieldMap(err.fields));
      setFormError(err instanceof ApiError ? err.message : 'Something went wrong, please try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={courier !== null} onOpenChange={(o) => !o && onClose()} title={courier?.id ? 'Edit courier' : 'Add courier'}>
      <form noValidate onSubmit={save} className="flex flex-col gap-4">
        <FormAlert message={formError} />
        <Field id="c-name" label="Name" error={errors.name}>
          <Input id="c-name" value={form.name} maxLength={80} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-describedby={describedBy('c-name', errors.name)} />
        </Field>
        <Field
          id="c-url"
          label="Tracking link (optional)"
          error={errors.trackingUrlTemplate}
          help="Use {tracking} where the tracking number goes. Check it once with a real parcel."
        >
          <Input
            id="c-url"
            type="url"
            inputMode="url"
            placeholder="https://courier.pk/track?cn={tracking}"
            value={form.trackingUrlTemplate}
            onChange={(e) => setForm({ ...form, trackingUrlTemplate: e.target.value })}
            aria-invalid={Boolean(errors.trackingUrlTemplate) || undefined}
            aria-describedby={describedBy('c-url', errors.trackingUrlTemplate, 'help')}
          />
        </Field>
        <Checkbox id="c-active" label="Available when dispatching" checked={form.isActive} onChange={(v) => setForm({ ...form, isActive: v })} />
        <DialogActions pending={pending} onCancel={onClose} />
      </form>
    </Dialog>
  );
}
