import type { Prisma, PrismaClient } from '@co/db';
import type { CartLineInput } from '@co/shared';
import { z } from 'zod';
import type { Storage } from '../storage/s3';
import { resolveAdvance, type AdvanceRule } from './advance';

type Db = Pick<PrismaClient, 'productVariant' | 'storeSetting' | 'advancePaymentRule' | 'paymentAccount'>;

export type LineProblem = 'unavailable' | 'out_of_stock' | 'customization';

export type QuotedLine = {
  index: number;
  variantId: string;
  productId: string;
  productSlug: string;
  productTitle: string;
  variantTitle: string | null;
  sku: string;
  productType: 'READY_MADE' | 'PERSONALIZABLE';
  image: string | null;
  quantity: number;
  unitPricePaisa: number;
  compareAtPricePaisa: number | null;
  customizationPaisa: number;
  lineTotalPaisa: number;
  trackInventory: boolean;
  customization: { key: string; label: string; value: string; extraPricePaisa: number }[];
  problem: LineProblem | null;
  problemDetail: string | null;
};

export type Quote = {
  lines: QuotedLine[];
  subtotalPaisa: number;
  shippingPaisa: number;
  totalPaisa: number;
  advanceRequiredPaisa: number;
  codAmountPaisa: number;
  advance: ReturnType<typeof resolveAdvance>;
  ok: boolean;
};

const shippingSetting = z
  .object({ flatPaisa: z.number().int().min(0).default(0), freeOverPaisa: z.number().int().min(0).nullable().default(null) })
  .catch({ flatPaisa: 0, freeOverPaisa: null });

const include = {
  inventory: true,
  product: {
    include: {
      categories: { select: { categoryId: true } },
      images: { orderBy: { sortOrder: 'asc' }, take: 1 },
      templates: { where: { isActive: true }, include: { fields: true } },
    },
  },
} satisfies Prisma.ProductVariantInclude;

/**
 * Prices a cart from the database only: catalogue prices, personalization surcharges, shipping
 * and advance-payment rules. Anything the browser sends besides variant ids, quantities and
 * personalization text is ignored. Lines that cannot be bought are flagged, not dropped.
 */
export async function quoteCart(db: Db, input: CartLineInput[], storage: Storage | null): Promise<Quote> {
  const variants = await db.productVariant.findMany({ where: { id: { in: input.map((l) => l.variantId) } }, include });
  const byId = new Map(variants.map((v) => [v.id, v]));

  const lines: QuotedLine[] = input.map((line, index) => {
    const v = byId.get(line.variantId);
    if (!v) {
      return {
        index, variantId: line.variantId, productId: '', productSlug: '', productTitle: 'Item no longer available', variantTitle: null, sku: '',
        productType: 'READY_MADE', image: null, quantity: line.quantity, unitPricePaisa: 0, compareAtPricePaisa: null, customizationPaisa: 0,
        lineTotalPaisa: 0, trackInventory: false, customization: [], problem: 'unavailable', problemDetail: null,
      };
    }
    const fields = v.product.templates.flatMap((t) => t.fields);
    let problem: LineProblem | null = null;
    let problemDetail: string | null = null;
    const customization: QuotedLine['customization'] = [];
    for (const f of fields) {
      const value = (line.customization[f.key] ?? '').trim();
      const maxLength = z.object({ maxLength: z.number().int().positive().optional() }).catch({}).parse(f.config).maxLength;
      if (f.required && !value) {
        problem = 'customization';
        problemDetail = `${f.label} is required`;
      } else if (maxLength && value.length > maxLength) {
        problem = 'customization';
        problemDetail = `${f.label} is too long`;
      }
      if (value) customization.push({ key: f.key, label: f.label, value, extraPricePaisa: f.extraPricePaisa });
    }
    const available = v.isActive && v.product.status === 'ACTIVE';
    const inStock = !v.trackInventory || (v.inventory?.quantityOnHand ?? 0) - (v.inventory?.quantityReserved ?? 0) >= line.quantity;
    if (!available) problem = 'unavailable';
    else if (!inStock) problem = 'out_of_stock';
    const customizationPaisa = customization.reduce((s, c) => s + c.extraPricePaisa, 0);
    return {
      index,
      variantId: v.id,
      productId: v.productId,
      productSlug: v.product.slug,
      productTitle: v.product.title,
      variantTitle: v.title === 'Default' ? null : v.title,
      sku: v.sku,
      productType: v.product.productType,
      image: v.product.images[0] ? (storage?.publicUrl(v.product.images[0].s3Key) ?? null) : null,
      quantity: line.quantity,
      unitPricePaisa: v.pricePaisa,
      compareAtPricePaisa: v.compareAtPricePaisa,
      customizationPaisa,
      lineTotalPaisa: (v.pricePaisa + customizationPaisa) * line.quantity,
      trackInventory: v.trackInventory,
      customization,
      problem,
      problemDetail,
    };
  });

  const subtotalPaisa = lines.reduce((s, l) => s + l.lineTotalPaisa, 0);
  const shipping = shippingSetting.parse((await db.storeSetting.findUnique({ where: { key: 'shipping' } }))?.value ?? {});
  const shippingPaisa = subtotalPaisa === 0 || (shipping.freeOverPaisa !== null && subtotalPaisa >= shipping.freeOverPaisa) ? 0 : shipping.flatPaisa;
  const totalPaisa = subtotalPaisa + shippingPaisa;

  const rules = (await db.advancePaymentRule.findMany({ where: { isActive: true } })) as AdvanceRule[];
  const advance = resolveAdvance(
    lines.map((l) => ({
      productId: l.productId,
      productType: l.productType,
      categoryIds: byId.get(l.variantId)?.product.categories.map((c) => c.categoryId) ?? [],
      quantity: l.quantity,
      lineTotalPaisa: l.lineTotalPaisa,
    })),
    rules,
    subtotalPaisa,
  );
  const advanceRequiredPaisa = Math.min(advance.requiredPaisa, totalPaisa);

  return {
    lines,
    subtotalPaisa,
    shippingPaisa,
    totalPaisa,
    advanceRequiredPaisa,
    codAmountPaisa: totalPaisa - advanceRequiredPaisa,
    advance,
    ok: lines.length > 0 && lines.every((l) => l.problem === null),
  };
}
