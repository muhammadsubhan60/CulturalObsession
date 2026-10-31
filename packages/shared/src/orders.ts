import { z } from 'zod';
import { ADVANCE_METHODS, checkoutInput } from './checkout';

export const ORDER_STATUSES = [
  'PENDING',
  'CONFIRMATION_REQUIRED',
  'CONFIRMED',
  'IN_PRODUCTION',
  'READY_TO_DISPATCH',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
  'RETURNED',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_SOURCES = ['WEBSITE', 'WHATSAPP', 'ADMIN'] as const;
export const PAYMENT_METHODS = ['COD', ...ADVANCE_METHODS, 'SAFEPAY'] as const;
export const SHIPMENT_STATUSES = [
  'CREATED',
  'BOOKED',
  'PICKED_UP',
  'IN_TRANSIT',
  'DELIVERED',
  'DELIVERY_FAILED',
  'RETURN_TO_SENDER',
  'RETURNED',
  'CANCELLED',
] as const;

/**
 * The order workflow. Staff may only move an order along these edges; the API enforces it and
 * the admin shows the same choices. Extra conditions (advance paid, personalization approved,
 * a shipment booked) are checked by the API.
 */
export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMATION_REQUIRED: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['IN_PRODUCTION', 'READY_TO_DISPATCH', 'CANCELLED'],
  IN_PRODUCTION: ['READY_TO_DISPATCH', 'CANCELLED'],
  READY_TO_DISPATCH: ['SHIPPED', 'IN_PRODUCTION', 'CANCELLED'],
  SHIPPED: ['DELIVERED', 'RETURNED'],
  DELIVERED: ['RETURNED'],
  CANCELLED: [],
  RETURNED: [],
};

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));
const paisa = z.number().int('Must be a whole number of paisa').min(0, 'Cannot be negative').max(2_000_000_000);
const id = z.string().min(1).max(64);

export const orderListQuery = z.object({
  /** "open" = everything that still needs work (not delivered, cancelled or returned). */
  status: z.enum([...ORDER_STATUSES, 'open']).optional(),
  source: z.enum(ORDER_SOURCES).optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const orderStatusInput = z.object({
  status: z.enum(ORDER_STATUSES),
  note: optionalText(500),
  /** RETURNED only: put tracked stock back on the shelf. */
  restock: z.boolean().default(false),
});

export const orderNoteInput = z.object({ internalNote: z.string().trim().max(2_000) });

export const paymentDecisionInput = z.object({
  decision: z.enum(['approve', 'reject']),
  /** Reference the customer gave on WhatsApp, when they did not enter one at checkout. */
  reference: optionalText(80),
  note: optionalText(500),
});

export const shipmentInput = z.object({
  courierId: id,
  trackingNumber: z
    .string()
    .trim()
    .min(3, 'Enter the tracking number')
    .max(64)
    .regex(/^[A-Za-z0-9-]+$/, 'Letters, numbers and dashes only'),
  shippingCostPaisa: paisa.nullish(),
});

export const shipmentPatch = z.object({
  trackingNumber: shipmentInput.shape.trackingNumber.optional(),
  status: z.enum(SHIPMENT_STATUSES).optional(),
});

/** Orders staff enter for customers who ordered on WhatsApp, Instagram or by phone. */
export const adminOrderInput = checkoutInput.omit({ attribution: true, tracking: true }).extend({
  source: z.enum(['WHATSAPP', 'ADMIN']),
  /** The advance was already received (e.g. screenshot on WhatsApp) — record it as paid. */
  advanceReceived: z.boolean().default(false),
  customer: checkoutInput.shape.customer.extend({ name: z.string().trim().min(2, 'Enter the customer name').max(80) }),
});
export type AdminOrderInput = z.input<typeof adminOrderInput>;

// ─── Settings ───

export const ADVANCE_RULE_SCOPES = ['GLOBAL', 'PRODUCT_TYPE', 'CATEGORY', 'PRODUCT'] as const;
export const ADVANCE_RULE_MODES = ['NONE', 'FIXED', 'PERCENT', 'FULL'] as const;

export const advanceRuleInput = z
  .object({
    name: z.string().trim().min(1, 'Required').max(120),
    scope: z.enum(ADVANCE_RULE_SCOPES),
    mode: z.enum(ADVANCE_RULE_MODES),
    /** FIXED: paisa per unit. PERCENT: basis points (5000 = 50%). */
    value: z.number().int().min(0).max(2_000_000_000).default(0),
    productType: z.enum(['READY_MADE', 'PERSONALIZABLE']).nullish(),
    categoryId: id.nullish(),
    productId: id.nullish(),
    minOrderPaisa: paisa.default(0),
    priority: z.number().int().min(-1000).max(1000).default(0),
    isActive: z.boolean().default(true),
  })
  .superRefine((r, ctx) => {
    const need = { GLOBAL: null, PRODUCT_TYPE: 'productType', CATEGORY: 'categoryId', PRODUCT: 'productId' } as const;
    const field = need[r.scope];
    if (field && !r[field]) ctx.addIssue({ code: 'custom', path: [field], message: 'Required for this scope' });
    if (r.mode === 'PERCENT' && (r.value < 1 || r.value > 10_000)) ctx.addIssue({ code: 'custom', path: ['value'], message: 'Enter a percentage between 0.01 and 100' });
    if (r.mode === 'FIXED' && r.value < 1) ctx.addIssue({ code: 'custom', path: ['value'], message: 'Enter an amount' });
  })
  .transform((r) => ({
    ...r,
    // Only the field that matches the scope is kept, so the database CHECK always passes.
    productType: r.scope === 'PRODUCT_TYPE' ? (r.productType ?? null) : null,
    categoryId: r.scope === 'CATEGORY' ? (r.categoryId ?? null) : null,
    productId: r.scope === 'PRODUCT' ? (r.productId ?? null) : null,
    value: r.mode === 'NONE' || r.mode === 'FULL' ? 0 : r.value,
  }));
export type AdvanceRuleInput = z.input<typeof advanceRuleInput>;

const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullish();

export const paymentAccountInput = z.object({
  method: z.enum(ADVANCE_METHODS),
  label: z.string().trim().min(1, 'Required').max(80),
  accountTitle: z.string().trim().min(1, 'Required').max(120),
  accountNumber: nullableText(40),
  iban: z
    .string()
    .trim()
    .toUpperCase()
    .transform((v) => v.replace(/\s+/g, ''))
    .pipe(z.string().regex(/^(PK\d{2}[A-Z]{4}\d{16})?$/, 'Enter a Pakistani IBAN, e.g. PK36SCBL0000001123456702'))
    .transform((v) => (v === '' ? null : v))
    .nullish(),
  bankName: nullableText(80),
  instructions: nullableText(1_000),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(1000).default(0),
});

export const courierInput = z.object({
  name: z.string().trim().min(1, 'Required').max(80),
  code: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(30)
    .regex(/^[a-z0-9-]+$/, 'Lowercase letters, numbers and dashes'),
  isActive: z.boolean().default(true),
  /** Use {tracking} where the tracking number goes. */
  trackingUrlTemplate: z
    .string()
    .trim()
    .max(300)
    .refine((v) => v === '' || (/^https:\/\/[^\s]+$/.test(v) && v.includes('{tracking}')), 'An https:// link containing {tracking}')
    .transform((v) => (v === '' ? null : v))
    .nullish(),
});

export const storeSettingsInput = z.object({
  shipping: z.object({ flatPaisa: paisa, freeOverPaisa: paisa.nullable() }),
  whatsapp: z.object({
    number: z
      .string()
      .trim()
      .transform((v) => v.replace(/\D/g, ''))
      .pipe(z.string().regex(/^92\d{10}$/, 'Enter the number as 92XXXXXXXXXX')),
    message: z.string().trim().max(300),
  }),
});
export type StoreSettingsInput = z.input<typeof storeSettingsInput>;

export const STAFF_ROLES = ['owner', 'manager', 'staff'] as const;

export const staffInput = z.object({
  name: z.string().trim().min(2, 'Required').max(80),
  email: z.string().trim().toLowerCase().max(254).email('Enter a valid email'),
  password: z.string().min(12, 'Use at least 12 characters').max(128),
  role: z.enum(STAFF_ROLES),
});

export const staffPatch = z.object({ role: z.enum(STAFF_ROLES).optional(), banned: z.boolean().optional() });
