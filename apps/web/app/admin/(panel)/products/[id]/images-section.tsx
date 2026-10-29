'use client';

import { ArrowLeft, ArrowRight, ImagePlus, Loader2, Trash2 } from 'lucide-react';
import * as React from 'react';
import { FormAlert } from '@/components/admin/form';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { adminApi, ApiError } from '@/lib/admin-api';
import type { ProductImage } from '@/lib/catalog-types';

const ACCEPT = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
const MAX_BYTES = 5 * 1024 * 1024;

type Upload = { name: string; state: 'uploading' | 'failed'; message?: string };

/** Client checks are hints for quick feedback; the API re-checks the stored bytes before attaching. */
async function uploadOne(productId: string, file: File) {
  const presign = await adminApi<{ key: string; uploadUrl: string; headers: Record<string, string> }>('/uploads/product-images', {
    method: 'POST',
    body: { contentType: file.type, size: file.size },
  });
  const put = await fetch(presign.uploadUrl, { method: 'PUT', headers: presign.headers, body: file });
  if (!put.ok) throw new ApiError(put.status, 'The upload did not finish. Please try again.');
  await adminApi(`/products/${productId}/images`, { method: 'POST', body: { key: presign.key, altText: file.name.replace(/\.[^.]+$/, '') } });
}

export function ImagesSection({ productId, images, onChanged }: { productId: string; images: ProductImage[]; onChanged: () => void }) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = React.useState<Upload[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [removing, setRemoving] = React.useState<ProductImage | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    const list = Array.from(files);
    setUploads(list.map((f) => ({ name: f.name, state: 'uploading' })));
    const results = await Promise.all(
      list.map(async (file): Promise<Upload | null> => {
        if (!ACCEPT.includes(file.type)) return { name: file.name, state: 'failed', message: 'Use JPEG, PNG, WebP or AVIF.' };
        if (file.size > MAX_BYTES) return { name: file.name, state: 'failed', message: 'Larger than 5 MB.' };
        try {
          await uploadOne(productId, file);
          return null;
        } catch (e) {
          return { name: file.name, state: 'failed', message: e instanceof ApiError ? e.message : 'Upload failed.' };
        }
      }),
    );
    setUploads(results.filter((r): r is Upload => r !== null));
    if (inputRef.current) inputRef.current.value = '';
    onChanged();
  }

  async function move(index: number, by: -1 | 1) {
    const ids = images.map((i) => i.id);
    const target = index + by;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    setBusy(true);
    try {
      await adminApi(`/products/${productId}/images/order`, { method: 'PUT', body: { imageIds: ids } });
      onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong, please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function saveAlt(image: ProductImage, altText: string) {
    if ((image.altText ?? '') === altText.trim()) return;
    try {
      await adminApi(`/images/${image.id}`, { method: 'PATCH', body: { altText } });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save the description.');
    }
  }

  async function remove() {
    if (!removing) return;
    setBusy(true);
    try {
      await adminApi(`/images/${removing.id}`, { method: 'DELETE' });
      setRemoving(null);
      onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong, please try again.');
    } finally {
      setBusy(false);
    }
  }

  const uploading = uploads.some((u) => u.state === 'uploading');

  return (
    <section className="rounded-lg border bg-card">
      <div className="flex items-center justify-between gap-3 border-b p-4 sm:px-6">
        <div>
          <h2 className="font-semibold">Photos</h2>
          <p className="text-sm text-muted-foreground">JPEG, PNG, WebP or AVIF up to 5 MB. The first photo is the main one.</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT.join(',')}
          multiple
          className="sr-only"
          id="product-photos"
          onChange={(e) => void onFiles(e.target.files)}
        />
        <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => inputRef.current?.click()}>
          {uploading ? <Loader2 className="animate-spin" /> : <ImagePlus />} Upload
        </Button>
      </div>

      <div className="flex flex-col gap-4 p-4 sm:px-6">
        <FormAlert message={error} />
        {uploads.length > 0 && (
          <ul className="flex flex-col gap-1 text-sm" aria-live="polite">
            {uploads.map((u) => (
              <li key={u.name} className={u.state === 'failed' ? 'text-destructive' : 'text-muted-foreground'}>
                {u.state === 'uploading' ? `Uploading ${u.name}…` : `${u.name}: ${u.message}`}
              </li>
            ))}
          </ul>
        )}
        {images.length === 0 ? (
          <p className="text-sm text-muted-foreground">No photos yet.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {images.map((img, i) => (
              <li key={img.id} className="flex flex-col gap-2 rounded-md border p-2">
                <div className="relative aspect-square overflow-hidden rounded bg-muted">
                  {img.url && (
                    <img src={img.url} alt={img.altText ?? ''} className="size-full object-cover" loading="lazy" />
                  )}
                  {i === 0 && <span className="absolute left-1.5 top-1.5 rounded bg-primary px-1.5 py-0.5 text-[11px] font-medium text-primary-foreground">Main</span>}
                </div>
                <Input
                  aria-label={`Description of photo ${i + 1}`}
                  placeholder="Describe the photo"
                  defaultValue={img.altText ?? ''}
                  onBlur={(e) => void saveAlt(img, e.target.value)}
                  className="h-9 text-sm"
                />
                <div className="flex justify-between">
                  <div className="flex">
                    <Button type="button" variant="ghost" size="icon" className="size-9" aria-label="Move photo earlier" disabled={busy || i === 0} onClick={() => void move(i, -1)}>
                      <ArrowLeft />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" className="size-9" aria-label="Move photo later" disabled={busy || i === images.length - 1} onClick={() => void move(i, 1)}>
                      <ArrowRight />
                    </Button>
                  </div>
                  <Button type="button" variant="ghost" size="icon" className="size-9 text-destructive hover:text-destructive" aria-label="Remove photo" onClick={() => setRemoving(img)}>
                    <Trash2 />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={removing !== null} onOpenChange={(o) => !o && setRemoving(null)} title="Remove this photo?" description="The file is deleted from storage. This cannot be undone.">
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => setRemoving(null)}>
            Keep photo
          </Button>
          <Button variant="destructive" onClick={() => void remove()} disabled={busy}>
            {busy && <Loader2 className="animate-spin" />} Remove
          </Button>
        </div>
      </Dialog>
    </section>
  );
}
