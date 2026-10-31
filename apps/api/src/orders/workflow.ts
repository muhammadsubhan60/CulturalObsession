import type { Prisma } from '@co/db';
import { ORDER_TRANSITIONS, type OrderStatus } from '@co/shared';
import { HttpError } from '../http/errors';

type Tx = Prisma.TransactionClient;

const workflowInclude = {
  items: { include: { customization: true, variant: { select: { trackInventory: true } } } },
  payments: true,
  shipments: true,
} satisfies Prisma.OrderInclude;

export type WorkflowOrder = Prisma.OrderGetPayload<{ include: typeof workflowInclude }>;

/** Why an order cannot move to a status right now, or null when it can. */
export function blockerFor(order: WorkflowOrder, to: OrderStatus): string | null {
  if (!ORDER_TRANSITIONS[order.status].includes(to)) return `An order that is ${label(order.status)} cannot be marked ${label(to)}`;
  if (to === 'CONFIRMED' && order.advanceRequiredPaisa > 0) {
    const advance = order.payments.find((p) => p.purpose === 'ADVANCE');
    if (advance?.status !== 'PAID') return 'Verify the advance payment first';
  }
  if ((to === 'IN_PRODUCTION' || to === 'READY_TO_DISPATCH') && unapprovedItems(order) > 0) {
    return 'Approve the personalization on every item first';
  }
  if (to === 'SHIPPED' && !order.shipments.some((s) => s.status !== 'CANCELLED' && s.trackingNumber)) {
    return 'Add the courier and tracking number first';
  }
  return null;
}

export function unapprovedItems(order: { items: { customization: { approvedAt: Date | null }[] }[] }) {
  return order.items.filter((i) => i.customization.length > 0 && i.customization.some((c) => !c.approvedAt)).length;
}

const label = (s: OrderStatus) => s.toLowerCase().replace(/_/g, ' ');

export function loadForWorkflow(tx: Tx, orderId: string) {
  return tx.order.findUnique({ where: { id: orderId }, include: workflowInclude });
}

/**
 * Moves an order to a new status with its side effects, inside the caller's transaction:
 * stock is released on cancel and taken off the shelf on dispatch, COD is marked collected on
 * delivery, and every change is written to the status history.
 */
export async function changeStatus(
  tx: Tx,
  order: WorkflowOrder,
  to: OrderStatus,
  opts: { note?: string; restock?: boolean; actorUserId: string | null },
) {
  const blocker = blockerFor(order, to);
  if (blocker) throw new HttpError(409, blocker);
  const now = new Date();

  // Guard against two staff changing the same order at once.
  const moved = await tx.order.updateMany({
    where: { id: order.id, status: order.status },
    data: {
      status: to,
      ...(to === 'CONFIRMED' ? { confirmedAt: now } : {}),
      ...(to === 'CANCELLED' ? { cancelledAt: now } : {}),
    },
  });
  if (moved.count !== 1) throw new HttpError(409, 'Someone else just updated this order. Reload and try again.');

  const reserved = order.items.filter((i) => i.inventoryReserved && i.variantId);
  if (to === 'CANCELLED' || to === 'SHIPPED') {
    for (const item of reserved) {
      const shipped = to === 'SHIPPED';
      await tx.$executeRaw`
        UPDATE "Inventory"
        SET "quantityReserved" = "quantityReserved" - ${item.quantity},
            "quantityOnHand" = "quantityOnHand" - ${shipped ? item.quantity : 0},
            "updatedAt" = now()
        WHERE "variantId" = ${item.variantId}`;
      await tx.orderItem.update({ where: { id: item.id }, data: { inventoryReserved: false } });
      await tx.inventoryMovement.create({
        data: {
          variantId: item.variantId!,
          quantityDelta: -item.quantity,
          reason: shipped ? 'ORDER_FULFILLED' : 'ORDER_RELEASED',
          referenceType: 'Order',
          referenceId: order.id,
          actorUserId: opts.actorUserId,
        },
      });
    }
  }

  if (to === 'CANCELLED') {
    await tx.payment.updateMany({ where: { orderId: order.id, status: { in: ['PENDING', 'AWAITING_VERIFICATION'] } }, data: { status: 'FAILED' } });
    await tx.shipment.updateMany({ where: { orderId: order.id, status: { notIn: ['DELIVERED', 'RETURNED', 'CANCELLED'] } }, data: { status: 'CANCELLED' } });
  }
  if (to === 'SHIPPED') {
    await tx.shipment.updateMany({ where: { orderId: order.id, status: { in: ['CREATED', 'BOOKED'] } }, data: { status: 'PICKED_UP' } });
  }
  if (to === 'DELIVERED') {
    await tx.payment.updateMany({
      where: { orderId: order.id, method: 'COD', status: 'PENDING' },
      data: { status: 'PAID', paidAt: now },
    });
    await tx.shipment.updateMany({ where: { orderId: order.id, status: { notIn: ['CANCELLED', 'RETURNED'] } }, data: { status: 'DELIVERED', deliveredAt: now } });
  }
  if (to === 'RETURNED') {
    // Parcel came back: COD that was never collected will not be.
    await tx.payment.updateMany({ where: { orderId: order.id, method: 'COD', status: 'PENDING' }, data: { status: 'FAILED' } });
    await tx.shipment.updateMany({ where: { orderId: order.id, status: { notIn: ['CANCELLED'] } }, data: { status: 'RETURNED', returnedAt: now } });
    if (opts.restock) {
      for (const item of order.items.filter((i) => i.variantId && i.variant?.trackInventory)) {
        await tx.inventory.upsert({
          where: { variantId: item.variantId! },
          create: { variantId: item.variantId!, quantityOnHand: item.quantity },
          update: { quantityOnHand: { increment: item.quantity } },
        });
        await tx.inventoryMovement.create({
          data: { variantId: item.variantId!, quantityDelta: item.quantity, reason: 'RETURN_RESTOCKED', referenceType: 'Order', referenceId: order.id, actorUserId: opts.actorUserId },
        });
      }
    }
  }

  await tx.orderStatusHistory.create({
    data: { orderId: order.id, fromStatus: order.status, toStatus: to, note: opts.note ?? null, actorUserId: opts.actorUserId },
  });
}
