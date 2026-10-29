'use client';

import { categoryInput, slugify } from '@co/shared';
import { FolderTree, Loader2, Pencil, Plus } from 'lucide-react';
import * as React from 'react';
import { describedBy, Field, FormAlert, Checkbox } from '@/components/admin/form';
import { PageHeader } from '@/components/admin/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { adminApi, ApiError, fieldMap } from '@/lib/admin-api';
import type { Category } from '@/lib/catalog-types';

type Draft = { name: string; slug: string; description: string; sortOrder: string; isActive: boolean };
const EMPTY: Draft = { name: '', slug: '', description: '', sortOrder: '0', isActive: true };

export function CategoriesScreen() {
  const [items, setItems] = React.useState<Category[] | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<Category | 'new' | null>(null);

  const load = React.useCallback(async () => {
    try {
      setItems((await adminApi<{ items: Category[] }>('/categories')).items);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof ApiError ? e.message : 'Something went wrong, please try again.');
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <PageHeader
        title="Collections"
        description="Group products the way the storefront menu shows them."
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus /> New collection
          </Button>
        }
      />
      <div className="px-4 py-6 md:px-8">
        <FormAlert message={loadError} />
        {items === null && !loadError ? (
          <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground" role="status">
            <Loader2 className="size-4 animate-spin" /> Loading collections…
          </div>
        ) : items && items.length === 0 ? (
          <div className="mx-auto flex max-w-md flex-col items-center rounded-lg border border-dashed bg-card px-6 py-12 text-center">
            <FolderTree className="size-8 text-primary" aria-hidden />
            <p className="mt-3 font-medium">No collections yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Create Necklace, Rings, Cufflinks… to match the storefront menu.</p>
          </div>
        ) : items ? (
          <ul className="divide-y overflow-hidden rounded-lg border bg-card">
            {items.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{c.name}</span>
                    {!c.isActive && <Badge tone="warning">Hidden</Badge>}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">
                    /collections/{c.slug} · {c._count?.products ?? 0} product{(c._count?.products ?? 0) === 1 ? '' : 's'}
                  </div>
                </div>
                <Button variant="ghost" size="icon" aria-label={`Edit ${c.name}`} onClick={() => setEditing(c)}>
                  <Pencil />
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <CategoryDialog
        key={editing === 'new' ? 'new' : (editing?.id ?? 'closed')}
        category={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          void load();
        }}
      />
    </>
  );
}

function CategoryDialog({ category, onClose, onSaved }: { category: Category | 'new' | null; onClose: () => void; onSaved: () => void }) {
  const isNew = category === 'new';
  const [draft, setDraft] = React.useState<Draft>(
    category && category !== 'new'
      ? { name: category.name, slug: category.slug, description: category.description ?? '', sortOrder: String(category.sortOrder), isActive: category.isActive }
      : EMPTY,
  );
  const [slugTouched, setSlugTouched] = React.useState(!isNew);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const parsed = categoryInput.safeParse({ ...draft, sortOrder: Number(draft.sortOrder) || 0 });
    if (!parsed.success) {
      setErrors(fieldMap(parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))));
      return;
    }
    setErrors({});
    setFormError(null);
    setPending(true);
    try {
      if (isNew) await adminApi('/categories', { method: 'POST', body: parsed.data });
      else if (category) await adminApi(`/categories/${category.id}`, { method: 'PATCH', body: parsed.data });
      onSaved();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.status === 409 ? { slug: 'Another collection already uses this URL.' } : fieldMap(err.fields));
        setFormError(err.message);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={category !== null} onOpenChange={(o) => !o && onClose()} title={isNew ? 'New collection' : 'Edit collection'}>
      <form noValidate onSubmit={save} className="flex flex-col gap-4">
        <FormAlert message={formError} />
        <Field id="cat-name" label="Name" error={errors.name}>
          <Input
            id="cat-name"
            value={draft.name}
            autoFocus
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value, slug: slugTouched ? d.slug : slugify(e.target.value) }))}
            aria-invalid={Boolean(errors.name) || undefined}
            aria-describedby={describedBy('cat-name', errors.name)}
          />
        </Field>
        <Field id="cat-slug" label="URL" error={errors.slug} help={`/collections/${draft.slug || '…'}`}>
          <Input
            id="cat-slug"
            value={draft.slug}
            onChange={(e) => {
              setSlugTouched(true);
              setDraft((d) => ({ ...d, slug: e.target.value }));
            }}
            aria-invalid={Boolean(errors.slug) || undefined}
            aria-describedby={describedBy('cat-slug', errors.slug, 'help')}
          />
        </Field>
        <Field id="cat-desc" label="Description" error={errors.description}>
          <Textarea id="cat-desc" value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} />
        </Field>
        <Field id="cat-sort" label="Menu position" error={errors.sortOrder} help="Lower numbers appear first.">
          <Input
            id="cat-sort"
            inputMode="numeric"
            value={draft.sortOrder}
            onChange={(e) => setDraft((d) => ({ ...d, sortOrder: e.target.value.replace(/\D/g, '') }))}
            aria-describedby={describedBy('cat-sort', errors.sortOrder, 'help')}
          />
        </Field>
        <Checkbox id="cat-active" label="Show on the storefront" checked={draft.isActive} onChange={(v) => setDraft((d) => ({ ...d, isActive: v }))} />
        <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />} {isNew ? 'Create collection' : 'Save changes'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
