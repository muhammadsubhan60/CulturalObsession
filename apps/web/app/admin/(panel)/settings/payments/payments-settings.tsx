'use client';

import { ADVANCE_METHODS, advanceRuleInput, formatPkr, paymentAccountInput, rupeesToPaisa } from '@co/shared';
import { CreditCard, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import * as React from 'react';
import { Checkbox, describedBy, DialogActions, Field, FormAlert } from '@/components/admin/form';
import { PageHeader } from '@/components/admin/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { adminApi, ApiError, type FieldError } from '@/lib/admin-api';
import { METHOD_LABEL } from '@/lib/order-types';

type Scope = 'GLOBAL' | 'PRODUCT_TYPE' | 'CATEGORY' | 'PRODUCT';
type Mode = 'NONE' | 'FIXED' | 'PERCENT' | 'FULL';
type Rule = {
  id: string;
  name: string;
  scope: Scope;
  mode: Mode;
  value: number;
  productType: 'READY_MADE' | 'PERSONALIZABLE' | null;
  categoryId: string | null;
  productId: string | null;
  minOrderPaisa: number;
  priority: number;
  isActive: boolean;
  category: { name: string } | null;
  product: { title: string } | null;
};
type AdvanceMethod = (typeof ADVANCE_METHODS)[number];
type Account = {
  id: string;
  method: AdvanceMethod;
  label: string;
  accountTitle: string;
  accountNumber: string | null;
  iban: string | null;
  bankName: string | null;
  instructions: string | null;
  isActive: boolean;
  sortOrder: number;
};

const SCOPE_LABEL: Record<Scope, string> = { GLOBAL: 'All products', PRODUCT_TYPE: 'Product type', CATEGORY: 'A collection', PRODUCT: 'One product' };
const MODE_LABEL: Record<Mode, string> = { NONE: 'No advance', FIXED: 'Fixed amount per item', PERCENT: 'Percentage of the item price', FULL: 'Full payment upfront' };
const TYPE_LABEL = { READY_MADE: 'Ready-made items', PERSONALIZABLE: 'Personalized items' } as const;
const errorText = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong, please try again.');
const pathErrors = (fields: FieldError[]) => Object.fromEntries(fields.map((f) => [f.path.split('.')[0] ?? f.path, f.message]));

function describeRule(r: Rule) {
  const target =
    r.scope === 'GLOBAL' ? 'All products' : r.scope === 'PRODUCT_TYPE' ? TYPE_LABEL[r.productType ?? 'PERSONALIZABLE'] : r.scope === 'CATEGORY' ? (r.category?.name ?? 'Collection') : (r.product?.title ?? 'Product');
  const amount = r.mode === 'FIXED' ? `${formatPkr(r.value)} per item` : r.mode === 'PERCENT' ? `${r.value / 100}% advance` : r.mode === 'FULL' ? 'Full payment upfront' : 'No advance';
  return { target, amount };
}

export function PaymentsSettings({ canEdit }: { canEdit: boolean }) {
  const [rules, setRules] = React.useState<Rule[] | null>(null);
  const [accounts, setAccounts] = React.useState<Account[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [editingRule, setEditingRule] = React.useState<Rule | 'new' | null>(null);
  const [editingAccount, setEditingAccount] = React.useState<Account | 'new' | null>(null);
  const [deleting, setDeleting] = React.useState<{ kind: 'rule'; item: Rule } | { kind: 'account'; item: Account } | null>(null);

  const load = React.useCallback(async () => {
    try {
      const [r, a] = await Promise.all([adminApi<{ items: Rule[] }>('/advance-rules'), adminApi<{ items: Account[] }>('/payment-accounts')]);
      setRules(r.items);
      setAccounts(a.items);
      setError(null);
    } catch (e) {
      setError(errorText(e));
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <PageHeader title="Payments & advance" description="How much advance each order needs, and where customers send it." />
      <div className="flex flex-col gap-6 px-4 py-6 md:px-8">
        <FormAlert message={error} />
        {!canEdit && <p className="text-sm text-muted-foreground">Only owners and managers can change these settings.</p>}

        <section aria-label="Advance rules" className="rounded-lg border bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">Advance rules</h2>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                For each item the most specific active rule applies: one product, then a collection, then a product type, then all products. Items with no rule are cash on delivery.
              </p>
            </div>
            {canEdit && (
              <Button size="sm" onClick={() => setEditingRule('new')}>
                <Plus /> Add rule
              </Button>
            )}
          </div>
          {rules === null ? (
            <Loading />
          ) : rules.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">No rules yet, so every order is cash on delivery.</p>
          ) : (
            <ul className="mt-4 divide-y rounded-md border">
              {rules.map((r) => {
                const d = describeRule(r);
                return (
                  <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-3">
                    <div className="min-w-0 flex-1 basis-56">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{r.name}</span>
                        {!r.isActive && <Badge>Off</Badge>}
                      </div>
                      <div className="mt-0.5 text-sm text-muted-foreground">
                        {d.target} · <span className="text-foreground">{d.amount}</span>
                        {r.minOrderPaisa > 0 && ` · orders over ${formatPkr(r.minOrderPaisa)}`}
                      </div>
                    </div>
                    {canEdit && (
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" aria-label={`Edit ${r.name}`} onClick={() => setEditingRule(r)}>
                          <Pencil />
                        </Button>
                        <Button size="icon" variant="ghost" aria-label={`Delete ${r.name}`} onClick={() => setDeleting({ kind: 'rule', item: r })}>
                          <Trash2 />
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section aria-label="Payment accounts" className="rounded-lg border bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">Payment accounts</h2>
              <p className="mt-1 text-sm text-muted-foreground">Shown at checkout when an order needs an advance.</p>
            </div>
            {canEdit && (
              <Button size="sm" onClick={() => setEditingAccount('new')}>
                <Plus /> Add account
              </Button>
            )}
          </div>
          {accounts === null ? (
            <Loading />
          ) : accounts.length === 0 ? (
            <div className="mt-4 flex items-center gap-3 rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              <CreditCard aria-hidden className="size-5 text-primary" /> Add at least one bank or wallet account before turning on an advance rule.
            </div>
          ) : (
            <ul className="mt-4 divide-y rounded-md border">
              {accounts.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-3">
                  <div className="min-w-0 flex-1 basis-56">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{a.label}</span>
                      <Badge>{METHOD_LABEL[a.method]}</Badge>
                      {!a.isActive && <Badge tone="danger">Hidden</Badge>}
                    </div>
                    <div className="mt-0.5 break-all text-sm text-muted-foreground">
                      {a.accountTitle}
                      {a.accountNumber && <> · {a.accountNumber}</>}
                      {a.iban && <> · {a.iban}</>}
                    </div>
                  </div>
                  {canEdit && (
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" aria-label={`Edit ${a.label}`} onClick={() => setEditingAccount(a)}>
                        <Pencil />
                      </Button>
                      <Button size="icon" variant="ghost" aria-label={`Remove ${a.label}`} onClick={() => setDeleting({ kind: 'account', item: a })}>
                        <Trash2 />
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <RuleDialog
        key={`r-${editingRule === 'new' ? 'new' : editingRule?.id}`}
        rule={editingRule}
        onClose={() => setEditingRule(null)}
        onSaved={() => {
          setEditingRule(null);
          void load();
        }}
      />
      <AccountDialog
        key={`a-${editingAccount === 'new' ? 'new' : editingAccount?.id}`}
        account={editingAccount}
        onClose={() => setEditingAccount(null)}
        onSaved={() => {
          setEditingAccount(null);
          void load();
        }}
      />
      <ConfirmDelete
        key={`d-${deleting?.item.id}`}
        target={deleting}
        onClose={() => setDeleting(null)}
        onDone={() => {
          setDeleting(null);
          void load();
        }}
      />
    </>
  );
}

function Loading() {
  return (
    <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground" role="status">
      <Loader2 className="size-4 animate-spin" /> Loading…
    </div>
  );
}

type Option = { id: string; name: string };

function RuleDialog({ rule, onClose, onSaved }: { rule: Rule | 'new' | null; onClose: () => void; onSaved: () => void }) {
  const existing = rule && rule !== 'new' ? rule : null;
  const [name, setName] = React.useState(existing?.name ?? 'Personalized items advance');
  const [scope, setScope] = React.useState<Scope>(existing?.scope ?? 'PRODUCT_TYPE');
  const [productType, setProductType] = React.useState(existing?.productType ?? 'PERSONALIZABLE');
  const [categoryId, setCategoryId] = React.useState(existing?.categoryId ?? '');
  const [productId, setProductId] = React.useState(existing?.productId ?? '');
  const [mode, setMode] = React.useState<Mode>(existing?.mode ?? 'PERCENT');
  const [value, setValue] = React.useState(existing ? String(existing.mode === 'PERCENT' ? existing.value / 100 : existing.mode === 'FIXED' ? existing.value / 100 : '') : '50');
  const [minOrder, setMinOrder] = React.useState(existing?.minOrderPaisa ? String(existing.minOrderPaisa / 100) : '');
  const [priority, setPriority] = React.useState(String(existing?.priority ?? 0));
  const [isActive, setIsActive] = React.useState(existing?.isActive ?? true);
  const [categories, setCategories] = React.useState<Option[]>([]);
  const [products, setProducts] = React.useState<Option[]>(existing?.product && existing.productId ? [{ id: existing.productId, name: existing.product.title }] : []);
  const [productQuery, setProductQuery] = React.useState('');
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    if (rule === null) return;
    adminApi<{ items: { id: string; name: string }[] }>('/categories')
      .then((r) => setCategories(r.items))
      .catch(() => setCategories([]));
  }, [rule]);

  React.useEffect(() => {
    if (scope !== 'PRODUCT' || productQuery.trim().length < 2) return;
    const t = window.setTimeout(() => {
      adminApi<{ items: { id: string; title: string }[] }>(`/products?status=ACTIVE&pageSize=20&q=${encodeURIComponent(productQuery.trim())}`)
        .then((r) => setProducts(r.items.map((p) => ({ id: p.id, name: p.title }))))
        .catch(() => undefined);
    }, 250);
    return () => window.clearTimeout(t);
  }, [scope, productQuery]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    let amount = 0;
    try {
      if (mode === 'PERCENT') amount = Math.round(Number(value) * 100);
      if (mode === 'FIXED') amount = rupeesToPaisa(value || '0');
    } catch {
      setErrors({ value: 'Enter a number' });
      return;
    }
    const body = {
      name,
      scope,
      mode,
      value: amount,
      productType: scope === 'PRODUCT_TYPE' ? productType : null,
      categoryId: scope === 'CATEGORY' ? categoryId || null : null,
      productId: scope === 'PRODUCT' ? productId || null : null,
      minOrderPaisa: minOrder ? rupeesToPaisa(minOrder) : 0,
      priority: Number(priority) || 0,
      isActive,
    };
    const parsed = advanceRuleInput.safeParse(body);
    if (!parsed.success) {
      setErrors(pathErrors(parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))));
      return;
    }
    setErrors({});
    setPending(true);
    try {
      await adminApi(existing ? `/advance-rules/${existing.id}` : '/advance-rules', { method: existing ? 'PUT' : 'POST', body });
      onSaved();
    } catch (err) {
      if (err instanceof ApiError) setErrors(pathErrors(err.fields));
      setFormError(errorText(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={rule !== null} onOpenChange={(o) => !o && onClose()} title={existing ? 'Edit advance rule' : 'Add advance rule'}>
      <form noValidate onSubmit={save} className="flex flex-col gap-4">
        <FormAlert message={formError} />
        <Field id="rule-name" label="Name" error={errors.name}>
          <Input id="rule-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} aria-describedby={describedBy('rule-name', errors.name)} />
        </Field>
        <Field id="rule-scope" label="Applies to">
          <Select id="rule-scope" value={scope} onChange={(e) => setScope(e.target.value as Scope)}>
            {(Object.keys(SCOPE_LABEL) as Scope[]).map((s) => (
              <option key={s} value={s}>
                {SCOPE_LABEL[s]}
              </option>
            ))}
          </Select>
        </Field>
        {scope === 'PRODUCT_TYPE' && (
          <Field id="rule-type" label="Product type" error={errors.productType}>
            <Select id="rule-type" value={productType} onChange={(e) => setProductType(e.target.value as typeof productType)}>
              <option value="PERSONALIZABLE">{TYPE_LABEL.PERSONALIZABLE}</option>
              <option value="READY_MADE">{TYPE_LABEL.READY_MADE}</option>
            </Select>
          </Field>
        )}
        {scope === 'CATEGORY' && (
          <Field id="rule-category" label="Collection" error={errors.categoryId}>
            <Select id="rule-category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-describedby={describedBy('rule-category', errors.categoryId)}>
              <option value="">Choose a collection</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {scope === 'PRODUCT' && (
          <>
            <Field id="rule-product-q" label="Find product">
              <Input id="rule-product-q" type="search" placeholder="Type a product name" value={productQuery} onChange={(e) => setProductQuery(e.target.value)} />
            </Field>
            <Field id="rule-product" label="Product" error={errors.productId}>
              <Select id="rule-product" value={productId} onChange={(e) => setProductId(e.target.value)} aria-describedby={describedBy('rule-product', errors.productId)}>
                <option value="">{products.length ? 'Choose a product' : 'Search above first'}</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
          </>
        )}
        <Field id="rule-mode" label="Advance">
          <Select id="rule-mode" value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
            {(Object.keys(MODE_LABEL) as Mode[]).map((m) => (
              <option key={m} value={m}>
                {MODE_LABEL[m]}
              </option>
            ))}
          </Select>
        </Field>
        {(mode === 'PERCENT' || mode === 'FIXED') && (
          <Field id="rule-value" label={mode === 'PERCENT' ? 'Percentage (%)' : 'Amount per item (Rs.)'} error={errors.value}>
            <Input
              id="rule-value"
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ''))}
              aria-invalid={Boolean(errors.value) || undefined}
              aria-describedby={describedBy('rule-value', errors.value)}
            />
          </Field>
        )}
        <div className="grid grid-cols-2 gap-4">
          <Field id="rule-min" label="Only for orders over (Rs.)" error={errors.minOrderPaisa}>
            <Input id="rule-min" inputMode="numeric" placeholder="Any amount" value={minOrder} onChange={(e) => setMinOrder(e.target.value.replace(/\D/g, ''))} />
          </Field>
          <Field id="rule-priority" label="Priority" help="Higher wins between rules of the same kind.">
            <Input id="rule-priority" inputMode="numeric" value={priority} onChange={(e) => setPriority(e.target.value.replace(/[^\d-]/g, ''))} aria-describedby="rule-priority-help" />
          </Field>
        </div>
        <Checkbox id="rule-active" label="Rule is on" checked={isActive} onChange={setIsActive} />
        <DialogActions pending={pending} onCancel={onClose} />
      </form>
    </Dialog>
  );
}

function AccountDialog({ account, onClose, onSaved }: { account: Account | 'new' | null; onClose: () => void; onSaved: () => void }) {
  const existing = account && account !== 'new' ? account : null;
  const [form, setForm] = React.useState({
    method: existing?.method ?? ('BANK_TRANSFER' as AdvanceMethod),
    label: existing?.label ?? '',
    accountTitle: existing?.accountTitle ?? '',
    accountNumber: existing?.accountNumber ?? '',
    iban: existing?.iban ?? '',
    bankName: existing?.bankName ?? '',
    instructions: existing?.instructions ?? '',
    isActive: existing?.isActive ?? true,
    sortOrder: existing?.sortOrder ?? 0,
  });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const bank = form.method === 'BANK_TRANSFER' || form.method === 'RAAST';

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const parsed = paymentAccountInput.safeParse(form);
    if (!parsed.success) {
      setErrors(pathErrors(parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))));
      return;
    }
    setErrors({});
    setPending(true);
    try {
      await adminApi(existing ? `/payment-accounts/${existing.id}` : '/payment-accounts', { method: existing ? 'PUT' : 'POST', body: form });
      onSaved();
    } catch (err) {
      if (err instanceof ApiError) setErrors(pathErrors(err.fields));
      setFormError(errorText(err));
    } finally {
      setPending(false);
    }
  }

  const text = (key: 'label' | 'accountTitle' | 'accountNumber' | 'iban' | 'bankName', label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <Field id={`acc-${key}`} label={label} error={errors[key]}>
      <Input
        id={`acc-${key}`}
        value={form[key]}
        onChange={(e) => set(key, e.target.value)}
        aria-invalid={Boolean(errors[key]) || undefined}
        aria-describedby={describedBy(`acc-${key}`, errors[key])}
        {...extra}
      />
    </Field>
  );

  return (
    <Dialog open={account !== null} onOpenChange={(o) => !o && onClose()} title={existing ? 'Edit account' : 'Add account'}>
      <form noValidate onSubmit={save} className="flex flex-col gap-4">
        <FormAlert message={formError} />
        <Field id="acc-method" label="Type">
          <Select id="acc-method" value={form.method} onChange={(e) => set('method', e.target.value as AdvanceMethod)}>
            {ADVANCE_METHODS.map((m) => (
              <option key={m} value={m}>
                {METHOD_LABEL[m]}
              </option>
            ))}
          </Select>
        </Field>
        {text('label', 'Name shown to customers', { placeholder: bank ? 'Meezan Bank' : 'JazzCash', maxLength: 80 })}
        {text('accountTitle', 'Account title', { maxLength: 120 })}
        {text('accountNumber', bank ? 'Account number (optional)' : 'Mobile account number', { inputMode: 'numeric', maxLength: 40 })}
        {bank && text('iban', 'IBAN (optional)', { autoCapitalize: 'characters', placeholder: 'PK36SCBL0000001123456702' })}
        {bank && text('bankName', 'Bank name (optional)', { maxLength: 80 })}
        <Field id="acc-instructions" label="Instructions (optional)" help="E.g. send the screenshot on WhatsApp after paying.">
          <Textarea id="acc-instructions" rows={2} maxLength={1000} value={form.instructions} onChange={(e) => set('instructions', e.target.value)} aria-describedby="acc-instructions-help" />
        </Field>
        <Checkbox id="acc-active" label="Show at checkout" checked={form.isActive} onChange={(v) => set('isActive', v)} />
        <DialogActions pending={pending} onCancel={onClose} />
      </form>
    </Dialog>
  );
}

function ConfirmDelete({
  target,
  onClose,
  onDone,
}: {
  target: { kind: 'rule'; item: Rule } | { kind: 'account'; item: Account } | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const name = target ? (target.kind === 'rule' ? target.item.name : target.item.label) : '';

  async function confirm() {
    if (!target) return;
    setPending(true);
    try {
      await adminApi(target.kind === 'rule' ? `/advance-rules/${target.item.id}` : `/payment-accounts/${target.item.id}`, { method: 'DELETE' });
      onDone();
    } catch (err) {
      setError(errorText(err));
      setPending(false);
    }
  }

  return (
    <Dialog open={target !== null} onOpenChange={(o) => !o && onClose()} title={`Remove ${name}?`}>
      <div className="flex flex-col gap-4">
        <FormAlert message={error} />
        <p className="text-sm text-muted-foreground">
          {target?.kind === 'rule'
            ? 'New orders stop using this rule. Orders already placed keep the advance they were given.'
            : 'Customers will no longer see this account. If orders were paid into it, it is hidden instead of deleted.'}
        </p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose}>
            Keep
          </Button>
          <Button type="button" variant="destructive" disabled={pending} onClick={confirm}>
            {pending && <Loader2 className="animate-spin" />} Remove
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
