export type StoreVariant = {
  id: string;
  title: string;
  options: Record<string, string>;
  pricePaisa: number;
  compareAtPricePaisa: number | null;
  available: boolean;
};

export type PersonalizationField = {
  key: string;
  label: string;
  fieldType: string;
  required: boolean;
  config: { maxLength?: number } | null;
};

export type StoreProduct = {
  slug: string;
  title: string;
  vendor: string | null;
  descriptionHtml: string;
  productType: 'READY_MADE' | 'PERSONALIZABLE';
  seoTitle: string | null;
  seoDescription: string | null;
  images: { id: string; variantId: string | null; url: string | null; width: number | null; height: number | null; alt: string | null }[];
  options: { name: string; values: string[] }[];
  variants: StoreVariant[];
  personalization: PersonalizationField[];
  collection: { slug: string; title: string } | null;
};
