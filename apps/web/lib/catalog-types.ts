export type ProductStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
export type ProductType = 'READY_MADE' | 'PERSONALIZABLE';

export type Category = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
  seoTitle: string | null;
  seoDescription: string | null;
  _count?: { products: number };
};

export type Inventory = { quantityOnHand: number; quantityReserved: number; lowStockThreshold: number } | null;

export type Variant = {
  id: string;
  sku: string;
  title: string;
  pricePaisa: number;
  compareAtPricePaisa: number | null;
  costPaisa: number | null;
  weightGrams: number | null;
  trackInventory: boolean;
  isActive: boolean;
  sortOrder: number;
  inventory: Inventory;
};

export type Product = {
  id: string;
  title: string;
  slug: string;
  description: string;
  vendor: string | null;
  status: ProductStatus;
  productType: ProductType;
  seoTitle: string | null;
  seoDescription: string | null;
  categories: { categoryId: string }[];
  variants: Variant[];
  updatedAt: string;
};

export type ProductRow = Omit<Product, 'categories' | 'variants'> & {
  variantCount: number;
  minPricePaisa: number | null;
  stockOnHand: number | null;
};

export const STATUS_LABEL: Record<ProductStatus, string> = { DRAFT: 'Draft', ACTIVE: 'Active', ARCHIVED: 'Archived' };
export const STATUS_TONE: Record<ProductStatus, 'neutral' | 'success' | 'warning'> = { DRAFT: 'neutral', ACTIVE: 'success', ARCHIVED: 'warning' };
export const TYPE_LABEL: Record<ProductType, string> = { READY_MADE: 'Ready-made', PERSONALIZABLE: 'Personalized' };
