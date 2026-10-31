import type { Prisma } from '@co/db';
import type { CartLineInput } from '@co/shared';
import { HttpError } from '../http/errors';
import type { Storage } from '../storage/s3';
import { quoteCart } from './quote';

export class OutOfStock extends Error {}

export const orderView = {
  items: { include: { customization: true } },
  payments: { include: { paymentAccount: true } },
  shipments: { include: { courier: true } },
  statusHistory: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.OrderInclude;

export type OrderRow = Prisma.OrderGetPayload<{ include: typeof orderView }>;

type AdvanceMethod = 'BANK_TRANSFER' | 'RAAST' | 'JAZZCASH' | 'EASYPAISA';

export type PlaceOrderInput = {
  idempotencyKey: string;
  lines: CartLineInput[];
  customer: { name: string; phone: string; email?: string };
  address: { city: string; area?: string; addressLine: string; postalCode?: string };
  note?: string;
  payment: { method: 'COD' | AdvanceMethod; accountId?: string; reference?: string };
  attribution?: Record<string, string | undefined>;
  source: 'WEBSITE' | 'WHATSAPP' | 'ADMIN';
  /** Staff-entered orders only: the advance has already been received. */
  advanceReceived?: boolean;
  actorUserId?: string | null;
};

/**
 * Creates an order inside the caller's transaction: prices the cart from the database, applies
 * the advance-payment rules, reserves tracked stock atomically and numbers the order from the
 * sequence. Used by the website checkout and by staff entering WhatsApp / phone orders.
 */
export async function placeOrder(tx: Prisma.TransactionClient, storage: Storage | null, input: PlaceOrderInput): Promise<OrderRow> {
  const quote = await quoteCart(tx, input.lines, storage);
  if (!quote.ok) {
    throw new HttpError(
      409,
      'Some items in your cart changed',
      quote.lines.filter((l) => l.problem).map((l) => ({ path: `lines.${l.index}`, message: l.problemDetail ?? l.problem! })),
    );
  }

  // Advance payment: required amount comes from the rules, never from the request.
  let paymentAccountId: string | null = null;
  if (quote.advanceRequiredPaisa > 0) {
    if (input.payment.method === 'COD') throw new HttpError(400, 'Invalid input', [{ path: 'payment.method', message: 'This order needs an advance payment' }]);
    const account = input.payment.accountId
      ? await tx.paymentAccount.findFirst({ where: { id: input.payment.accountId, method: input.payment.method, isActive: true } })
      : null;
    if (!account) throw new HttpError(400, 'Invalid input', [{ path: 'payment.accountId', message: 'Choose where you will send the advance' }]);
    paymentAccountId = account.id;
  } else if (input.payment.method !== 'COD') {
    throw new HttpError(400, 'Invalid input', [{ path: 'payment.method', message: 'This order is cash on delivery' }]);
  }

  // Reserve stock atomically; the CHECK constraint also guards reserved <= on hand.
  for (const line of quote.lines.filter((l) => l.trackInventory)) {
    const updated = await tx.$executeRaw`
      UPDATE "Inventory" SET "quantityReserved" = "quantityReserved" + ${line.quantity}, "updatedAt" = now()
      WHERE "variantId" = ${line.variantId} AND "quantityOnHand" - "quantityReserved" >= ${line.quantity}`;
    if (updated !== 1) throw new OutOfStock(line.productTitle);
  }

  const customer = await tx.customer.upsert({
    where: { phone: input.customer.phone },
    create: { name: input.customer.name, phone: input.customer.phone, email: input.customer.email ?? null },
    update: { name: input.customer.name, ...(input.customer.email ? { email: input.customer.email } : {}) },
  });
  await tx.address.create({
    data: { customerId: customer.id, recipientName: input.customer.name, phone: input.customer.phone, ...input.address },
  });

  const staffEntered = input.source !== 'WEBSITE';
  const advancePaid = staffEntered && input.advanceReceived === true;
  // Website orders wait for a phone confirmation; staff orders were confirmed while taking them.
  const status =
    quote.advanceRequiredPaisa > 0 && !advancePaid ? 'CONFIRMATION_REQUIRED' : staffEntered ? 'CONFIRMED' : 'PENDING';
  const now = new Date();

  const [seq] = await tx.$queryRaw<{ n: bigint }[]>`SELECT nextval('order_number_seq') AS n`;
  const created = await tx.order.create({
    data: {
      orderNumber: `CO-${seq!.n}`,
      idempotencyKey: input.idempotencyKey,
      customerId: customer.id,
      source: input.source,
      status,
      paymentMethod: input.payment.method,
      subtotalPaisa: quote.subtotalPaisa,
      shippingPaisa: quote.shippingPaisa,
      totalPaisa: quote.totalPaisa,
      advanceRequiredPaisa: quote.advanceRequiredPaisa,
      advanceRuleSnapshot: quote.advanceRequiredPaisa > 0 ? (quote.advance.lines as object) : undefined,
      codAmountPaisa: quote.codAmountPaisa,
      recipientName: input.customer.name,
      recipientPhone: input.customer.phone,
      shippingAddress: input.address,
      customerNote: input.note ?? null,
      confirmedAt: status === 'CONFIRMED' ? now : null,
      ...(input.attribution ?? {}),
      items: {
        create: quote.lines.map((l) => ({
          variantId: l.variantId,
          productTitleSnapshot: l.productTitle,
          variantTitleSnapshot: l.variantTitle,
          skuSnapshot: l.sku,
          productTypeSnapshot: l.productType,
          unitPricePaisa: l.unitPricePaisa,
          customizationPaisa: l.customizationPaisa,
          quantity: l.quantity,
          lineTotalPaisa: l.lineTotalPaisa,
          inventoryReserved: l.trackInventory,
          customization: {
            create: l.customization.map((c) => ({ fieldKey: c.key, labelSnapshot: c.label, value: c.value, extraPricePaisa: c.extraPricePaisa })),
          },
        })),
      },
      payments: {
        create: [
          ...(quote.advanceRequiredPaisa > 0
            ? [
                {
                  method: input.payment.method,
                  purpose: 'ADVANCE' as const,
                  status: advancePaid ? ('PAID' as const) : input.payment.reference ? ('AWAITING_VERIFICATION' as const) : ('PENDING' as const),
                  amountPaisa: quote.advanceRequiredPaisa,
                  paymentAccountId,
                  providerReference: input.payment.reference ?? null,
                  ...(advancePaid ? { paidAt: now, verifiedAt: now, verifiedById: input.actorUserId ?? null } : {}),
                },
              ]
            : []),
          ...(quote.codAmountPaisa > 0
            ? [{ method: 'COD' as const, purpose: quote.advanceRequiredPaisa > 0 ? ('BALANCE' as const) : ('FULL' as const), status: 'PENDING' as const, amountPaisa: quote.codAmountPaisa }]
            : []),
        ],
      },
      statusHistory: {
        create: {
          toStatus: status,
          note: input.source === 'WEBSITE' ? 'Order placed on the website' : `Order entered by staff (${input.source === 'WHATSAPP' ? 'WhatsApp' : 'phone / in person'})`,
          actorUserId: input.actorUserId ?? null,
        },
      },
    },
    include: orderView,
  });

  for (const l of quote.lines.filter((x) => x.trackInventory)) {
    await tx.inventoryMovement.create({
      data: { variantId: l.variantId, quantityDelta: l.quantity, reason: 'ORDER_RESERVED', referenceType: 'Order', referenceId: created.id, actorUserId: input.actorUserId ?? null },
    });
  }
  return created;
}
