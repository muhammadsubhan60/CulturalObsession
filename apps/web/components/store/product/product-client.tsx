'use client';

import { useRouter } from 'next/navigation';
import * as React from 'react';
import { addToCart } from '@/lib/cart';
import type { StoreProduct, StoreVariant } from './types';

type Ctx = {
  product: StoreProduct;
  sectionId: string;
  variant: StoreVariant | null;
  selectOptions: (options: Record<string, string>) => void;
};

const ProductContext = React.createContext<Ctx | null>(null);
const useProduct = () => {
  const ctx = React.useContext(ProductContext);
  if (!ctx) throw new Error('ProductContext missing');
  return ctx;
};

/** Holds the selected variant for the price, picker and form islands of one product section. */
export function ProductProvider({
  product,
  sectionId,
  initialVariantId,
  children,
}: {
  product: StoreProduct;
  sectionId: string;
  initialVariantId?: string;
  children: React.ReactNode;
}) {
  const [variant, setVariant] = React.useState<StoreVariant | null>(
    product.variants.find((v) => v.id === initialVariantId) ?? product.variants.find((v) => v.available) ?? product.variants[0] ?? null,
  );

  const selectOptions = React.useCallback(
    (options: Record<string, string>) => {
      const next = product.variants.find((v) => product.options.every((o) => v.options[o.name] === options[o.name])) ?? null;
      setVariant(next);
      if (!next) return;
      const url = new URL(window.location.href);
      url.searchParams.set('variant', next.id);
      window.history.replaceState({}, '', url);
      // Same behaviour as Dawn's VariantSelects: bring the variant's image to the front.
      const image = product.images.find((i) => i.variantId === next.id);
      const gallery = document.getElementById(`MediaGallery-${sectionId}`) as (HTMLElement & { setActiveMedia?: (id: string, prepend: boolean) => void }) | null;
      if (image && gallery?.setActiveMedia) gallery.setActiveMedia(`${sectionId}-${image.id}`, true);
    },
    [product, sectionId],
  );

  return <ProductContext.Provider value={{ product, sectionId, variant, selectOptions }}>{children}</ProductContext.Provider>;
}

/** Shows the server-rendered price of the selected variant (no client-side HTML parsing). */
export function ProductPrice({ prices, fallback }: { prices: Record<string, React.ReactNode>; fallback: React.ReactNode }) {
  const { variant } = useProduct();
  return <>{(variant && prices[variant.id]) ?? fallback}</>;
}

/** Dawn's variant-radios markup (in a div, so Dawn's Shopify-bound VariantRadios never attaches). */
export function VariantPicker() {
  const { product, sectionId, variant, selectOptions } = useProduct();
  const [selected, setSelected] = React.useState<Record<string, string>>(variant?.options ?? {});
  return (
    <div className="no-js-hidden" data-section={sectionId} data-url={`/products/${product.slug}`}>
      {product.options.map((option, oi) => (
        <fieldset key={option.name} className="js product-form__input">
          <legend className="form__label">{option.name}</legend>
          {option.values.map((value, vi) => {
            const id = `${sectionId}-${oi + 1}-${vi}`;
            return (
              <React.Fragment key={value}>
                <input
                  type="radio"
                  id={id}
                  name={option.name}
                  value={value}
                  form={`product-form-${sectionId}`}
                  checked={selected[option.name] === value}
                  onChange={() => {
                    const next = { ...selected, [option.name]: value };
                    setSelected(next);
                    selectOptions(next);
                  }}
                />
                {/* The theme has whitespace between each radio and its label: it is part of the pill spacing. */}
                {'\n'}
                <label htmlFor={id}>{value}</label>
              </React.Fragment>
            );
          })}
        </fieldset>
      ))}
    </div>
  );
}

const MESSAGES = { required: 'This field is required.', tooLong: (n: number) => `Please use ${n} characters or fewer.` };

type FormCtx = {
  values: Record<string, string>;
  errors: Record<string, string>;
  pending: boolean;
  setValue: (key: string, value: string) => void;
};
const FormContext = React.createContext<FormCtx | null>(null);
const useForm = () => {
  const ctx = React.useContext(FormContext);
  if (!ctx) throw new Error('FormContext missing');
  return ctx;
};

/**
 * Dawn's product-form. Children are the theme's Globo personalization block and "Shop Now"
 * button, rendered on the server with the small client pieces below inside them.
 */
export function ProductForm({ children }: { children: React.ReactNode }) {
  const { product, sectionId, variant } = useProduct();
  const router = useRouter();
  const [values, setValues] = React.useState<Record<string, string>>({});
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const setValue = React.useCallback((key: string, value: string) => setValues((v) => ({ ...v, [key]: value })), []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!variant || !variant.available) {
      setFormError('This item is not available right now.');
      return;
    }
    const next: Record<string, string> = {};
    for (const f of product.personalization) {
      const v = (values[f.key] ?? '').trim();
      if (f.required && !v) next[f.key] = MESSAGES.required;
      else if (f.config?.maxLength && v.length > f.config.maxLength) next[f.key] = MESSAGES.tooLong(f.config.maxLength);
    }
    setErrors(next);
    if (Object.keys(next).length > 0) {
      document.getElementById(Object.keys(next)[0]!)?.focus();
      return;
    }
    const qtyInput = document.getElementById(`Quantity-${sectionId}`) as HTMLInputElement | null;
    const quantity = Math.max(1, Math.min(20, Number.parseInt(qtyInput?.value ?? '1', 10) || 1));
    setPending(true);
    const customization: Record<string, string> = {};
    for (const f of product.personalization) {
      const v = (values[f.key] ?? '').trim();
      if (v) customization[f.key] = v;
    }
    addToCart({ variantId: variant.id, productSlug: product.slug, quantity, customization });
    document.dispatchEvent(new CustomEvent('co:add-to-cart', { detail: { value: (variant.pricePaisa * quantity) / 100, ids: [product.slug], quantity } }));
    router.push('/cart');
  }

  return (
    <FormContext.Provider value={{ values, errors, pending, setValue }}>
      <product-form className="product-form">
        <div className="product-form__error-message-wrapper" role="alert" hidden={!formError}>
          <span className="product-form__error-message">{formError}</span>
        </div>
        <form id={`product-form-${sectionId}`} className="form" noValidate data-type="add-to-cart-form" onSubmit={submit}>
          <div className="product-form__buttons">{children}</div>
        </form>
      </product-form>
    </FormContext.Provider>
  );
}

export function GpoInput({ fieldKey, className, maxLength }: { fieldKey: string; className?: string; maxLength?: number }) {
  const { values, errors, setValue } = useForm();
  return (
    <input
      type="text"
      data-type="text"
      id={fieldKey}
      className={className}
      name={fieldKey}
      data-name={`properties[${fieldKey}]`}
      data-field-name={fieldKey}
      maxLength={maxLength}
      value={values[fieldKey] ?? ''}
      aria-invalid={errors[fieldKey] ? true : undefined}
      aria-describedby={errors[fieldKey] ? `${fieldKey}-message` : undefined}
      onChange={(ev) => setValue(fieldKey, ev.target.value)}
    />
  );
}

export function GpoMessage({ fieldKey }: { fieldKey: string }) {
  const { errors } = useForm();
  return (
    <div className="messages" id={`${fieldKey}-message`} role={errors[fieldKey] ? 'alert' : undefined}>
      {errors[fieldKey] ? <div className="gpo-error-message">{errors[fieldKey]}</div> : null}
    </div>
  );
}

export function ShopNowButton({ className, spinner }: { className?: string; spinner: React.ReactNode }) {
  const { variant } = useProduct();
  const { pending } = useForm();
  const soldOut = !variant?.available;
  return (
    <button type="submit" name="add" className={className} disabled={soldOut || pending} aria-disabled={soldOut || pending}>
      <span>{soldOut ? 'Sold out' : 'Shop Now'}</span>
      <div className={`loading-overlay__spinner${pending ? '' : ' hidden'}`}>{spinner}</div>
    </button>
  );
}

declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'product-form': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
    }
  }
}

