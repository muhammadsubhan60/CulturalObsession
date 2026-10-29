import { z } from 'zod';

/** URL slugs match the existing Shopify handles: lowercase letters, digits and single dashes. */
export const slugSchema = z
  .string()
  .trim()
  .min(1, 'Required')
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and dashes');

const paisa = z
  .number()
  .int('Must be a whole number of paisa')
  .min(0, 'Cannot be negative')
  .max(2_000_000_000);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullish();

export const PRODUCT_STATUSES = ['DRAFT', 'ACTIVE', 'ARCHIVED'] as const;
export const PRODUCT_TYPES = ['READY_MADE', 'PERSONALIZABLE'] as const;
export const INVENTORY_ADJUST_REASONS = [
  'OPENING_STOCK',
  'RETURN_RESTOCKED',
  'DAMAGED',
  'MANUAL_ADJUSTMENT',
] as const;

export const categoryInput = z.object({
  name: z.string().trim().min(1, 'Required').max(120),
  slug: slugSchema,
  description: optionalText(5_000),
  parentId: z.string().min(1).nullish(),
  sortOrder: z.number().int().min(0).max(100_000).default(0),
  isActive: z.boolean().default(true),
  seoTitle: optionalText(120),
  seoDescription: optionalText(320),
});
export type CategoryInput = z.infer<typeof categoryInput>;

export const productInput = z.object({
  title: z.string().trim().min(1, 'Required').max(200),
  slug: slugSchema,
  description: z.string().max(20_000).default(''),
  vendor: optionalText(120),
  status: z.enum(PRODUCT_STATUSES).default('DRAFT'),
  productType: z.enum(PRODUCT_TYPES).default('READY_MADE'),
  seoTitle: optionalText(120),
  seoDescription: optionalText(320),
  categoryIds: z.array(z.string().min(1)).max(50).default([]),
});
export type ProductInput = z.infer<typeof productInput>;

/** Field rules without cross-field checks — use for partial updates. */
export const variantFields = z.object({
  sku: z
    .string()
    .trim()
    .min(1, 'Required')
    .max(64)
    .regex(/^[A-Za-z0-9._-]+$/, 'Letters, numbers, dot, dash and underscore only'),
  title: z.string().trim().min(1, 'Required').max(120),
  optionValues: z.record(z.string().max(60), z.string().max(120)).default({}),
  pricePaisa: paisa,
  compareAtPricePaisa: paisa.nullish(),
  costPaisa: paisa.nullish(),
  weightGrams: z.number().int().min(0).max(100_000).nullish(),
  trackInventory: z.boolean().default(true),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(100_000).default(0),
});

export const variantInput = variantFields.refine(
  (v) => v.compareAtPricePaisa == null || v.compareAtPricePaisa > v.pricePaisa,
  {
    message: 'Compare-at price must be higher than the price',
    path: ['compareAtPricePaisa'],
  },
);
export type VariantInput = z.infer<typeof variantInput>;

export const inventoryAdjustInput = z.object({
  /** Signed change to stock on hand. */
  delta: z
    .number()
    .int()
    .min(-100_000)
    .max(100_000)
    .refine((n) => n !== 0, 'Change cannot be zero'),
  reason: z.enum(INVENTORY_ADJUST_REASONS),
  note: optionalText(500),
  lowStockThreshold: z.number().int().min(0).max(100_000).optional(),
});
export type InventoryAdjustInput = z.infer<typeof inventoryAdjustInput>;

export const productListQuery = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(PRODUCT_STATUSES).optional(),
  categoryId: z.string().min(1).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type ProductListQuery = z.infer<typeof productListQuery>;
