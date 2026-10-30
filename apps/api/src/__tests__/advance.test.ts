import { describe, expect, it } from 'vitest';
import { resolveAdvance, type AdvanceLine, type AdvanceRule } from '../checkout/advance';

const rule = (r: Partial<AdvanceRule> & Pick<AdvanceRule, 'id' | 'scope' | 'mode'>): AdvanceRule => ({
  name: r.id,
  value: 0,
  productType: null,
  categoryId: null,
  productId: null,
  minOrderPaisa: 0,
  priority: 0,
  isActive: true,
  ...r,
});
const personal: AdvanceLine = { productId: 'p1', productType: 'PERSONALIZABLE', categoryIds: ['necklace'], quantity: 2, lineTotalPaisa: 199_800 };
const ready: AdvanceLine = { productId: 'p2', productType: 'READY_MADE', categoryIds: ['rings'], quantity: 1, lineTotalPaisa: 150_000 };

describe('resolveAdvance', () => {
  it('needs no advance without rules', () => {
    expect(resolveAdvance([personal, ready], [], 349_800).requiredPaisa).toBe(0);
  });

  it('applies a product-type rule only to matching lines', () => {
    const r = resolveAdvance([personal, ready], [rule({ id: 'pt', scope: 'PRODUCT_TYPE', productType: 'PERSONALIZABLE', mode: 'PERCENT', value: 5_000 })], 349_800);
    expect(r.requiredPaisa).toBe(99_900);
    expect(r.lines[1]!.ruleId).toBeNull();
  });

  it('prefers product over category over type over global', () => {
    const rules = [
      rule({ id: 'g', scope: 'GLOBAL', mode: 'FULL' }),
      rule({ id: 't', scope: 'PRODUCT_TYPE', productType: 'PERSONALIZABLE', mode: 'PERCENT', value: 5_000 }),
      rule({ id: 'c', scope: 'CATEGORY', categoryId: 'necklace', mode: 'FIXED', value: 30_000 }),
      rule({ id: 'p', scope: 'PRODUCT', productId: 'p1', mode: 'NONE' }),
    ];
    const r = resolveAdvance([personal, ready], rules, 349_800);
    expect(r.lines.map((l) => l.ruleId)).toEqual(['p', 'g']);
    expect(r.requiredPaisa).toBe(150_000);
  });

  it('charges FIXED per unit and never more than the line total', () => {
    expect(resolveAdvance([personal], [rule({ id: 'c', scope: 'CATEGORY', categoryId: 'necklace', mode: 'FIXED', value: 30_000 })], 199_800).requiredPaisa).toBe(60_000);
    expect(resolveAdvance([personal], [rule({ id: 'c', scope: 'CATEGORY', categoryId: 'necklace', mode: 'FIXED', value: 500_000 })], 199_800).requiredPaisa).toBe(199_800);
  });

  it('breaks ties by priority and skips inactive rules or unmet minimums', () => {
    const rules = [
      rule({ id: 'low', scope: 'GLOBAL', mode: 'PERCENT', value: 1_000, priority: 1 }),
      rule({ id: 'high', scope: 'GLOBAL', mode: 'PERCENT', value: 2_000, priority: 5 }),
      rule({ id: 'off', scope: 'GLOBAL', mode: 'FULL', priority: 9, isActive: false }),
      rule({ id: 'big', scope: 'GLOBAL', mode: 'FULL', priority: 10, minOrderPaisa: 1_000_000 }),
    ];
    expect(resolveAdvance([ready], rules, 150_000).lines[0]!.ruleId).toBe('high');
  });
});
