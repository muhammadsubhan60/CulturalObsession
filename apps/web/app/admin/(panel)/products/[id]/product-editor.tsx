'use client';

import { formatPkr, productInput, rupeesToPaisa, slugify, variantInput } from '@co/shared';
import { Archive, ArrowLeft, Loader2, Pencil, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { Checkbox, describedBy, Field, FormAlert } from '@/components/admin/form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { adminApi, ApiError, fieldMap } from '@/lib/admin-api';
import {
  type Category,
  type Product,
  type ProductStatus,
  type ProductType,
  STATUS_LABEL,
  STATUS_TONE,
  type Variant,
} from '@/lib/catalog-types';

type ProductDraft = {
  title: string;
  slug: string;
  description: string;
  vendor: string;
  status: ProductStatus;
  productType: ProductType;
  seoTitle: string;
  seoDescription: string;
  categoryIds: string[];
};

const EMPTY_PRODUCT: ProductDraft = {
  title: '',
  slug: '',
  description: '',
  vendor: '',
  status: 'DRAFT',
  productType: 'READY_MADE',
  seoTitle: '',
  seoDescription: '',
  categoryIds: [],
};

function toDraft(p: Product): ProductDraft {
  return {
    title: p.title,
    slug: p.slug,
    description: p.description,
    vendor: p.vendor ?? '',
    status: p.status,
    productType: p.productType,
    seoTitle: p.seoTitle ?? '',
    seoDescription: p.seoDescription ?? '',
    categoryIds: p.categories.map((c) => c.categoryId),
  };
}

const zodFields = (issues: { path: PropertyKey[]; message: string }[]) =>
  fieldMap(issues.map((i) => ({ path: i.path.map(String).join('.'), message: i.message })));

export function ProductEditor({ productId }: { productId: string | null }) {
  const router = useRouter();
  const [product, setProduct] = React.useState<Product | null>(null);
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [draft, setDraft] = React.useState<ProductDraft>(EMPTY_PRODUCT);
  const [slugTouched, setSlugTouched] = React.useState(Boolean(productId));
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [variantDialog, setVariantDialog] = React.useState<Variant | 'new' | null>(null);
  const [confirmArchive, setConfirmArchive] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const [cats, prod] = await Promise.all([
        adminApi<{ items: Category[] }>('/categories'),
        productId ? adminApi<{ product: Product }>(`/products/${productId}`) : Promise.resolve(null),
      ]);
      setCategories(cats.items);
      if (prod) {
        setProduct(prod.product);
        setDraft(toDraft(prod.product));
      }
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : 'Something went wrong, please try again.');
    } finally {
      setLoading(false);
    }
  }, [productId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const set = <K extends keyof ProductDraft>(key: K, value: ProductDraft[K]) => {
    setSaved(false);
    setDraft((d) => ({ ...d, [key]: value }));
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const parsed = productInput.safeParse(draft);
    if (!parsed.success) {
      setErrors(zodFields(parsed.error.issues));
      setFormError('Please fix the highlighted fields.');
      return;
    }
    setErrors({});
    setFormError(null);
    setPending(true);
    try {
      if (productId) {
        const res = await adminApi<{ product: Product }>(`/products/${productId}`, { method: 'PATCH', body: parsed.data });
        setProduct(res.product);
        setDraft(toDraft(res.product));
        setSaved(true);
      } else {
        const res = await adminApi<{ product: Product }>('/products', { method: 'POST', body: parsed.data });
        router.replace(`/admin/products/${res.product.id}`);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.status === 409 ? { slug: 'Another product already uses this URL.' } : fieldMap(err.fields));
        setFormError(err.message);
      }
    } finally {
      setPending(false);
    }
  }

  async function archive() {
    if (!productId) return;
    setPending(true);
    try {
      await adminApi(`/products/${productId}`, { method: 'DELETE' });
      router.replace('/admin/products');
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Something went wrong, please try again.');
      setPending(false);
      setConfirmArchive(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-4 py-10 text-sm text-muted-foreground md:px-8" role="status">
        <Loader2 className="size-4 animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-3 border-b bg-card px-4 py-5 md:px-8">
        <Link href="/admin/products" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Products
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-serif text-2xl font-bold text-primary">{productId ? product?.title || 'Product' : 'New product'}</h1>
          {product && <Badge tone={STATUS_TONE[product.status]}>{STATUS_LABEL[product.status]}</Badge>}
        </div>
      </div>

      <div className="grid gap-6 px-4 py-6 md:px-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <form id="product-form" noValidate onSubmit={save} className="flex flex-col gap-6">
          <FormAlert message={formError} />
          <section className="flex flex-col gap-4 rounded-lg border bg-card p-4 sm:p-6">
            <h2 className="font-semibold">Details</h2>
            <Field id="p-title" label="Title" error={errors.title}>
              <Input
                id="p-title"
                value={draft.title}
                onChange={(e) => {
                  const title = e.target.value;
                  setSaved(false);
                  setDraft((d) => ({ ...d, title, slug: slugTouched ? d.slug : slugify(title) }));
                }}
                aria-invalid={Boolean(errors.title) || undefined}
                aria-describedby={describedBy('p-title', errors.title)}
              />
            </Field>
            <Field id="p-slug" label="URL" error={errors.slug} help={`/products/${draft.slug || '…'}`}>
              <Input
                id="p-slug"
                value={draft.slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  set('slug', e.target.value);
                }}
                aria-invalid={Boolean(errors.slug) || undefined}
                aria-describedby={describedBy('p-slug', errors.slug, 'help')}
              />
            </Field>
            <Field id="p-desc" label="Description" error={errors.description} help="Shown on the product page.">
              <Textarea id="p-desc" rows={6} value={draft.description} onChange={(e) => set('description', e.target.value)} />
            </Field>
          </section>

          <section className="flex flex-col gap-4 rounded-lg border bg-card p-4 sm:p-6">
            <h2 className="font-semibold">Search engines</h2>
            <Field id="p-seo-title" label="Page title" error={errors.seoTitle} help="Leave empty to use the product title.">
              <Input id="p-seo-title" value={draft.seoTitle} onChange={(e) => set('seoTitle', e.target.value)} />
            </Field>
            <Field id="p-seo-desc" label="Meta description" error={errors.seoDescription}>
              <Textarea id="p-seo-desc" rows={3} value={draft.seoDescription} onChange={(e) => set('seoDescription', e.target.value)} />
            </Field>
          </section>

          {productId && product && (
            <VariantsSection product={product} onEdit={(v) => setVariantDialog(v)} onAdd={() => setVariantDialog('new')} />
          )}
        </form>

        <aside className="flex flex-col gap-4">
          <section className="flex flex-col gap-4 rounded-lg border bg-card p-4 sm:p-6">
            <Field id="p-status" label="Status" help="Only active products appear on the storefront.">
              <Select id="p-status" value={draft.status} onChange={(e) => set('status', e.target.value as ProductStatus)}>
                <option value="DRAFT">Draft</option>
                <option value="ACTIVE">Active</option>
                {product?.status === 'ARCHIVED' && <option value="ARCHIVED">Archived</option>}
              </Select>
            </Field>
            <Field id="p-type" label="Type" help="Personalized items are made to order and can require an advance payment.">
              <Select id="p-type" value={draft.productType} onChange={(e) => set('productType', e.target.value as ProductType)}>
                <option value="READY_MADE">Ready-made</option>
                <option value="PERSONALIZABLE">Personalized</option>
              </Select>
            </Field>
            <Field id="p-vendor" label="Brand / vendor" error={errors.vendor}>
              <Input id="p-vendor" value={draft.vendor} onChange={(e) => set('vendor', e.target.value)} />
            </Field>
          </section>

          <fieldset className="rounded-lg border bg-card p-4 sm:p-6">
            <legend className="px-1 text-sm font-semibold">Collections</legend>
            {categories.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No collections yet. <Link href="/admin/categories" className="underline">Create one</Link>.
              </p>
            ) : (
              categories.map((c) => (
                <Checkbox
                  key={c.id}
                  id={`p-cat-${c.id}`}
                  label={c.name}
                  checked={draft.categoryIds.includes(c.id)}
                  onChange={(on) =>
                    set('categoryIds', on ? [...draft.categoryIds, c.id] : draft.categoryIds.filter((id) => id !== c.id))
                  }
                />
              ))
            )}
          </fieldset>

          <div className="flex flex-col gap-2">
            <Button type="submit" form="product-form" size="lg" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />} {productId ? 'Save product' : 'Create product'}
            </Button>
            <p role="status" aria-live="polite" className="text-center text-sm text-success">
              {saved ? 'Saved.' : ''}
            </p>
            {productId && product?.status !== 'ARCHIVED' && (
              <Button type="button" variant="ghost" className="text-destructive hover:bg-destructive/5 hover:text-destructive" onClick={() => setConfirmArchive(true)}>
                <Archive /> Archive product
              </Button>
            )}
          </div>
        </aside>
      </div>

      {product && (
        <VariantDialog
          key={variantDialog === 'new' ? 'new' : (variantDialog?.id ?? 'closed')}
          productId={product.id}
          variant={variantDialog}
          defaultTrackInventory={product.productType === 'READY_MADE'}
          onClose={() => setVariantDialog(null)}
          onSaved={() => {
            setVariantDialog(null);
            void load();
          }}
        />
      )}

      <Dialog
        open={confirmArchive}
        onOpenChange={setConfirmArchive}
        title="Archive this product?"
        description="It disappears from the storefront and product lists. Past orders keep their details, and you can restore it by filtering for archived products."
      >
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => setConfirmArchive(false)}>
            Keep product
          </Button>
          <Button variant="destructive" onClick={archive} disabled={pending}>
            {pending && <Loader2 className="animate-spin" />} Archive
          </Button>
        </div>
      </Dialog>
    </>
  );
}

function VariantsSection({ product, onEdit, onAdd }: { product: Product; onEdit: (v: Variant) => void; onAdd: () => void }) {
  return (
    <section className="rounded-lg border bg-card">
      <div className="flex items-center justify-between gap-3 border-b p-4 sm:px-6">
        <div>
          <h2 className="font-semibold">Variants</h2>
          <p className="text-sm text-muted-foreground">Each size, colour or material with its own SKU and price.</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onAdd}>
          <Plus /> Add
        </Button>
      </div>
      {product.variants.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground sm:px-6">Add at least one variant so the product can be sold.</p>
      ) : (
        <ul className="divide-y">
          {product.variants.map((v) => (
            <li key={v.id} className="flex items-center gap-3 p-4 sm:px-6">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{v.title}</span>
                  {!v.isActive && <Badge tone="warning">Inactive</Badge>}
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 text-sm text-muted-foreground">
                  <span className="font-mono text-xs">{v.sku}</span>
                  <span className="tabular-nums">{formatPkr(v.pricePaisa)}</span>
                  <span>{v.trackInventory ? `${v.inventory?.quantityOnHand ?? 0} in stock` : 'Made to order'}</span>
                </div>
              </div>
              <Button type="button" variant="ghost" size="icon" aria-label={`Edit ${v.title}`} onClick={() => onEdit(v)}>
                <Pencil />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type VariantDraft = {
  sku: string;
  title: string;
  price: string;
  compareAt: string;
  cost: string;
  weight: string;
  trackInventory: boolean;
  isActive: boolean;
};

const rupees = (paisa: number | null) => (paisa == null ? '' : String(paisa / 100));

function VariantDialog({
  productId,
  variant,
  defaultTrackInventory,
  onClose,
  onSaved,
}: {
  productId: string;
  variant: Variant | 'new' | null;
  defaultTrackInventory: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = variant === 'new';
  const [draft, setDraft] = React.useState<VariantDraft>(
    variant && variant !== 'new'
      ? {
          sku: variant.sku,
          title: variant.title,
          price: rupees(variant.pricePaisa),
          compareAt: rupees(variant.compareAtPricePaisa),
          cost: rupees(variant.costPaisa),
          weight: variant.weightGrams == null ? '' : String(variant.weightGrams),
          trackInventory: variant.trackInventory,
          isActive: variant.isActive,
        }
      : { sku: '', title: 'Default', price: '', compareAt: '', cost: '', weight: '', trackInventory: defaultTrackInventory, isActive: true },
  );
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  function money(value: string, field: string, next: Record<string, string>): number | null | undefined {
    if (value.trim() === '') return null;
    try {
      return rupeesToPaisa(value);
    } catch {
      next[field] = 'Enter an amount in rupees, e.g. 999';
      return undefined;
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    const pricePaisa = money(draft.price, 'pricePaisa', next);
    if (pricePaisa === null) next.pricePaisa = 'Required';
    const body = {
      sku: draft.sku,
      title: draft.title,
      pricePaisa: pricePaisa ?? -1,
      compareAtPricePaisa: money(draft.compareAt, 'compareAtPricePaisa', next),
      costPaisa: money(draft.cost, 'costPaisa', next),
      weightGrams: draft.weight.trim() === '' ? null : Number(draft.weight),
      trackInventory: draft.trackInventory,
      isActive: draft.isActive,
    };
    const parsed = variantInput.safeParse(body);
    const all = { ...(parsed.success ? {} : zodFields(parsed.error.issues)), ...next };
    if (Object.keys(all).length > 0) {
      setErrors(all);
      return;
    }
    setErrors({});
    setFormError(null);
    setPending(true);
    try {
      if (isNew) await adminApi(`/products/${productId}/variants`, { method: 'POST', body: parsed.data });
      else if (variant) await adminApi(`/variants/${variant.id}`, { method: 'PATCH', body: parsed.data });
      onSaved();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.status === 409 ? { sku: 'This SKU is already used by another variant.' } : fieldMap(err.fields));
        setFormError(err.message);
      }
    } finally {
      setPending(false);
    }
  }

  const input = (id: string, field: keyof VariantDraft, errKey: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <Input
      id={id}
      value={draft[field] as string}
      onChange={(e) => setDraft((d) => ({ ...d, [field]: e.target.value }))}
      aria-invalid={Boolean(errors[errKey]) || undefined}
      aria-describedby={describedBy(id, errors[errKey])}
      {...props}
    />
  );

  return (
    <Dialog open={variant !== null} onOpenChange={(o) => !o && onClose()} title={isNew ? 'Add variant' : 'Edit variant'}>
      <form noValidate onSubmit={save} className="flex flex-col gap-4">
        <FormAlert message={formError} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="v-title" label="Name" error={errors.title}>
            {input('v-title', 'title', 'title', { autoFocus: true })}
          </Field>
          <Field id="v-sku" label="SKU" error={errors.sku}>
            {input('v-sku', 'sku', 'sku', { autoCapitalize: 'characters', className: 'font-mono' })}
          </Field>
          <Field id="v-price" label="Price (Rs)" error={errors.pricePaisa}>
            {input('v-price', 'price', 'pricePaisa', { inputMode: 'decimal' })}
          </Field>
          <Field id="v-compare" label="Compare-at price (Rs)" error={errors.compareAtPricePaisa}>
            {input('v-compare', 'compareAt', 'compareAtPricePaisa', { inputMode: 'decimal' })}
          </Field>
          <Field id="v-cost" label="Cost (Rs)" error={errors.costPaisa}>
            {input('v-cost', 'cost', 'costPaisa', { inputMode: 'decimal' })}
          </Field>
          <Field id="v-weight" label="Weight (g)" error={errors.weightGrams}>
            {input('v-weight', 'weight', 'weightGrams', { inputMode: 'numeric' })}
          </Field>
        </div>
        <Checkbox
          id="v-track"
          label="Track stock (turn off for made-to-order items)"
          checked={draft.trackInventory}
          onChange={(v) => setDraft((d) => ({ ...d, trackInventory: v }))}
        />
        <Checkbox id="v-active" label="Available for sale" checked={draft.isActive} onChange={(v) => setDraft((d) => ({ ...d, isActive: v }))} />
        <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />} {isNew ? 'Add variant' : 'Save variant'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
