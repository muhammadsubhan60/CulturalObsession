'use client';

import { STAFF_ROLES, staffInput } from '@co/shared';
import { Loader2, Plus, ShieldCheck } from 'lucide-react';
import * as React from 'react';
import { describedBy, DialogActions, Field, FormAlert } from '@/components/admin/form';
import { PageHeader } from '@/components/admin/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { adminApi, ApiError, fieldMap } from '@/lib/admin-api';

type Role = (typeof STAFF_ROLES)[number];
type Member = { id: string; name: string; email: string; role: Role; banned: boolean | null; twoFactorEnabled: boolean | null };

const ROLE_HELP: Record<Role, string> = {
  owner: 'Everything, including staff accounts',
  manager: 'Orders, products and store settings',
  staff: 'Orders, payments and dispatch only',
};
const errorText = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong, please try again.');

export function StaffSettings({ meId }: { meId: string }) {
  const [items, setItems] = React.useState<Member[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [confirming, setConfirming] = React.useState<Member | null>(null);

  const load = React.useCallback(async () => {
    try {
      setItems((await adminApi<{ items: Member[] }>('/staff')).items);
      setError(null);
    } catch (e) {
      setError(errorText(e));
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function update(m: Member, patch: { role?: Role; banned?: boolean }) {
    setBusy(m.id);
    try {
      await adminApi(`/staff/${m.id}`, { method: 'PATCH', body: patch });
      await load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
      setConfirming(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Staff"
        description="Who can sign in to this admin. Changing a role signs that person out."
        actions={
          <Button onClick={() => setAdding(true)}>
            <Plus /> Add staff
          </Button>
        }
      />
      <div className="flex flex-col gap-4 px-4 py-6 md:px-8">
        <FormAlert message={error} />
        {items === null && !error ? (
          <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground" role="status">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </div>
        ) : items ? (
          <ul className="divide-y overflow-hidden rounded-lg border bg-card">
            {items.map((m) => {
              const me = m.id === meId;
              return (
                <li key={m.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3">
                  <div className="min-w-0 flex-1 basis-56">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{m.name}</span>
                      {me && <Badge>You</Badge>}
                      {m.banned && <Badge tone="danger">No access</Badge>}
                      {m.twoFactorEnabled && (
                        <Badge tone="success">
                          <ShieldCheck aria-hidden className="mr-1 size-3" /> 2FA
                        </Badge>
                      )}
                    </div>
                    <div className="mt-0.5 break-all text-sm text-muted-foreground">{m.email}</div>
                  </div>
                  <div className="w-40">
                    <Select aria-label={`Role for ${m.name}`} value={m.role} disabled={me || busy === m.id || Boolean(m.banned)} onChange={(e) => update(m, { role: e.target.value as Role })}>
                      {STAFF_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r[0]!.toUpperCase() + r.slice(1)}
                        </option>
                      ))}
                    </Select>
                  </div>
                  {!me &&
                    (m.banned ? (
                      <Button size="sm" variant="outline" disabled={busy === m.id} onClick={() => update(m, { banned: false })}>
                        Restore access
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" className="text-destructive" disabled={busy === m.id} onClick={() => setConfirming(m)}>
                        Remove access
                      </Button>
                    ))}
                </li>
              );
            })}
          </ul>
        ) : null}
        <dl className="grid gap-2 text-sm sm:grid-cols-3">
          {STAFF_ROLES.map((r) => (
            <div key={r} className="rounded-md border bg-card p-3">
              <dt className="font-medium capitalize">{r}</dt>
              <dd className="text-muted-foreground">{ROLE_HELP[r]}</dd>
            </div>
          ))}
        </dl>
      </div>
      <AddStaffDialog
        key={adding ? 'open' : 'closed'}
        open={adding}
        onClose={() => setAdding(false)}
        onSaved={() => {
          setAdding(false);
          void load();
        }}
      />
      <Dialog open={confirming !== null} onOpenChange={(o) => !o && setConfirming(null)} title={`Remove access for ${confirming?.name ?? ''}?`}>
        <p className="text-sm text-muted-foreground">They are signed out now and cannot sign in again until you restore access. Their past actions stay in order history.</p>
        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => setConfirming(null)}>
            Keep access
          </Button>
          <Button variant="destructive" disabled={busy !== null} onClick={() => confirming && update(confirming, { banned: true })}>
            Remove access
          </Button>
        </div>
      </Dialog>
    </>
  );
}

function AddStaffDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = React.useState({ name: '', email: '', password: '', role: 'staff' as Role });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const parsed = staffInput.safeParse(form);
    if (!parsed.success) {
      setErrors(fieldMap(parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))));
      return;
    }
    setErrors({});
    setPending(true);
    try {
      await adminApi('/staff', { method: 'POST', body: parsed.data });
      onSaved();
    } catch (err) {
      if (err instanceof ApiError) setErrors(fieldMap(err.fields));
      setFormError(err instanceof ApiError && err.status === 409 ? 'Someone already uses this email.' : errorText(err));
    } finally {
      setPending(false);
    }
  }

  const input = (key: 'name' | 'email' | 'password', label: string, extra: React.InputHTMLAttributes<HTMLInputElement>, help?: string) => (
    <Field id={`st-${key}`} label={label} error={errors[key]} help={help}>
      <Input
        id={`st-${key}`}
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        aria-invalid={Boolean(errors[key]) || undefined}
        aria-describedby={describedBy(`st-${key}`, errors[key], help)}
        {...extra}
      />
    </Field>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title="Add staff" description="Share the password with them privately. They can turn on two-step sign-in after their first login.">
      <form noValidate onSubmit={save} className="flex flex-col gap-4">
        <FormAlert message={formError} />
        {input('name', 'Name', { autoComplete: 'off', maxLength: 80 })}
        {input('email', 'Email', { type: 'email', inputMode: 'email', autoComplete: 'off' })}
        {input('password', 'Temporary password', { type: 'password', autoComplete: 'new-password' }, 'At least 12 characters.')}
        <Field id="st-role" label="Role" help={ROLE_HELP[form.role]}>
          <Select id="st-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })} aria-describedby="st-role-help">
            {STAFF_ROLES.map((r) => (
              <option key={r} value={r}>
                {r[0]!.toUpperCase() + r.slice(1)}
              </option>
            ))}
          </Select>
        </Field>
        <DialogActions pending={pending} onCancel={onClose} label="Add staff" />
      </form>
    </Dialog>
  );
}
