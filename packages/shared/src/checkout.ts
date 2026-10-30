import { z } from 'zod';
import { normalizePkMobile } from './phone';

export const MAX_CART_LINES = 30;
export const MAX_LINE_QUANTITY = 20;

export const cartLineInput = z.object({
  variantId: z.string().min(1).max(64),
  quantity: z.number().int().min(1).max(MAX_LINE_QUANTITY),
  customization: z.record(z.string().max(60), z.string().trim().max(200)).default({}),
});
export type CartLineInput = z.infer<typeof cartLineInput>;

export const quoteInput = z.object({ lines: z.array(cartLineInput).min(1).max(MAX_CART_LINES) });

export const pkMobile = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const n = normalizePkMobile(v);
    if (!n) {
      ctx.addIssue({ code: 'custom', message: 'Enter a Pakistani mobile number, e.g. 0300 1234567' });
      return z.NEVER;
    }
    return n;
  });

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

export const ADVANCE_METHODS = ['BANK_TRANSFER', 'RAAST', 'JAZZCASH', 'EASYPAISA'] as const;

export const checkoutInput = z.object({
  /** Generated once per checkout page; a retry with the same key returns the same order. */
  idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{16,100}$/),
  lines: z.array(cartLineInput).min(1).max(MAX_CART_LINES),
  customer: z.object({
    name: z.string().trim().min(2, 'Enter your full name').max(80),
    phone: pkMobile,
    email: z.string().trim().toLowerCase().max(254).email('Enter a valid email').optional().or(z.literal('').transform(() => undefined)),
  }),
  address: z.object({
    city: z.string().trim().min(2, 'Enter your city').max(60),
    area: optional(80),
    addressLine: z.string().trim().min(5, 'Enter your full address').max(300),
    postalCode: optional(10),
  }),
  note: optional(500),
  payment: z.object({
    method: z.enum(['COD', ...ADVANCE_METHODS]),
    accountId: z.string().min(1).max(64).optional(),
    /** Transaction ID the customer got from their bank or wallet. */
    reference: optional(80),
  }),
  attribution: z
    .object({
      utmSource: optional(100),
      utmMedium: optional(100),
      utmCampaign: optional(150),
      utmContent: optional(150),
      utmTerm: optional(150),
      landingPage: optional(500),
    })
    .optional()
    .transform((v) => v ?? {}),
});
export type CheckoutInput = z.input<typeof checkoutInput>;

export const trackInput = z.object({
  orderNumber: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^(CO-)?\d{6,9}$/, 'Enter the order number from your confirmation, e.g. CO-100001')
    .transform((v) => (v.startsWith('CO-') ? v : `CO-${v}`)),
  phone: pkMobile,
});
