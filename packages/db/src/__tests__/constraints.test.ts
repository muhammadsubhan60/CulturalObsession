import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { getPrisma } from '../index';

// Runs against the real database in DATABASE_URL (docker-compose.dev.yml locally, a service in CI).
const prisma = getPrisma();
const tag = randomUUID().slice(0, 8);

afterAll(async () => {
  await prisma.order.deleteMany({ where: { orderNumber: { startsWith: `T-${tag}` } } });
  await prisma.customer.deleteMany({ where: { name: `test-${tag}` } });
  await prisma.product.deleteMany({ where: { slug: { startsWith: `t-${tag}` } } });
  await prisma.$disconnect();
});

async function makeVariant(suffix: string) {
  const product = await prisma.product.create({
    data: { title: 'Test', slug: `t-${tag}-${suffix}`, description: '' },
  });
  return prisma.productVariant.create({
    data: { productId: product.id, sku: `T-${tag}-${suffix}`, title: 'Default', pricePaisa: 99_900 },
  });
}

async function makeCustomer() {
  return prisma.customer.create({ data: { name: `test-${tag}`, phone: `+92300${tag.replace(/\D/g, '0').slice(0, 7).padEnd(7, '0')}` } });
}

describe('database constraints', () => {
  it('rejects negative prices', async () => {
    await expect(makeVariant('neg').then((v) => prisma.productVariant.update({ where: { id: v.id }, data: { pricePaisa: -1 } })))
      .rejects.toThrow(/ProductVariant_money_chk/);
  });

  it('never lets reserved stock exceed stock on hand', async () => {
    const v = await makeVariant('inv');
    await expect(
      prisma.inventory.create({ data: { variantId: v.id, quantityOnHand: 2, quantityReserved: 3 } }),
    ).rejects.toThrow(/Inventory_qty_chk/);
  });

  it('requires order totals to add up and advance to fit inside the total', async () => {
    const c = await makeCustomer();
    const base = {
      customerId: c.id, source: 'WEBSITE' as const, recipientName: 'A', recipientPhone: c.phone, shippingAddress: {},
      subtotalPaisa: 99_900, shippingPaisa: 20_000,
    };
    await expect(prisma.order.create({ data: { ...base, orderNumber: `T-${tag}-1`, totalPaisa: 1 } }))
      .rejects.toThrow(/Order_money_chk/);
    await expect(
      prisma.order.create({ data: { ...base, orderNumber: `T-${tag}-2`, totalPaisa: 119_900, advanceRequiredPaisa: 200_000 } }),
    ).rejects.toThrow(/Order_money_chk/);
    const ok = await prisma.order.create({ data: { ...base, orderNumber: `T-${tag}-3`, totalPaisa: 119_900, advanceRequiredPaisa: 50_000 } });
    expect(ok.totalPaisa).toBe(119_900);
  });

  it('requires quantity > 0 and a consistent line total', async () => {
    const c = await makeCustomer().catch(() => prisma.customer.findFirstOrThrow({ where: { name: `test-${tag}` } }));
    const order = await prisma.order.create({
      data: {
        orderNumber: `T-${tag}-4`, customerId: c.id, source: 'ADMIN', recipientName: 'A', recipientPhone: c.phone,
        shippingAddress: {}, subtotalPaisa: 0, totalPaisa: 0,
      },
    });
    const item = { orderId: order.id, productTitleSnapshot: 'X', productTypeSnapshot: 'READY_MADE' as const, unitPricePaisa: 1_000 };
    await expect(prisma.orderItem.create({ data: { ...item, quantity: 0, lineTotalPaisa: 0 } })).rejects.toThrow(/OrderItem_qty_money_chk/);
    await expect(prisma.orderItem.create({ data: { ...item, quantity: 2, lineTotalPaisa: 1_000 } })).rejects.toThrow(/OrderItem_qty_money_chk/);
    await expect(prisma.orderItem.create({ data: { ...item, quantity: 2, customizationPaisa: 500, lineTotalPaisa: 3_000 } })).resolves.toBeTruthy();
  });

  it('keeps advance rule scope and target consistent', async () => {
    await expect(
      prisma.advancePaymentRule.create({ data: { name: 'bad', scope: 'PRODUCT', mode: 'FIXED', value: 30_000 } }),
    ).rejects.toThrow(/AdvancePaymentRule_scope_chk/);
    await expect(
      prisma.advancePaymentRule.create({ data: { name: 'bad', scope: 'GLOBAL', mode: 'PERCENT', value: 12_000 } }),
    ).rejects.toThrow(/AdvancePaymentRule_value_chk/);
    const rule = await prisma.advancePaymentRule.create({
      data: { name: `ok-${tag}`, scope: 'PRODUCT_TYPE', productType: 'PERSONALIZABLE', mode: 'PERCENT', value: 5_000 },
    });
    await prisma.advancePaymentRule.delete({ where: { id: rule.id } });
  });
});
