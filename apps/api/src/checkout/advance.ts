import { percentOf } from '@co/shared';

export type AdvanceRule = {
  id: string;
  name: string;
  scope: 'GLOBAL' | 'PRODUCT_TYPE' | 'CATEGORY' | 'PRODUCT';
  mode: 'NONE' | 'FIXED' | 'PERCENT' | 'FULL';
  /** FIXED: paisa per unit. PERCENT: basis points. */
  value: number;
  productType: 'READY_MADE' | 'PERSONALIZABLE' | null;
  categoryId: string | null;
  productId: string | null;
  minOrderPaisa: number;
  priority: number;
  isActive: boolean;
};

export type AdvanceLine = {
  productId: string;
  productType: 'READY_MADE' | 'PERSONALIZABLE';
  categoryIds: string[];
  quantity: number;
  lineTotalPaisa: number;
};

export type AdvanceResult = {
  requiredPaisa: number;
  /** Which rule decided each line (index-aligned with the input), for the order snapshot. */
  lines: { ruleId: string | null; ruleName: string | null; mode: AdvanceRule['mode'] | null; value: number; advancePaisa: number }[];
};

const SPECIFICITY: Record<AdvanceRule['scope'], number> = { PRODUCT: 3, CATEGORY: 2, PRODUCT_TYPE: 1, GLOBAL: 0 };

function matches(rule: AdvanceRule, line: AdvanceLine): boolean {
  switch (rule.scope) {
    case 'PRODUCT':
      return rule.productId === line.productId;
    case 'CATEGORY':
      return rule.categoryId !== null && line.categoryIds.includes(rule.categoryId);
    case 'PRODUCT_TYPE':
      return rule.productType === line.productType;
    case 'GLOBAL':
      return true;
  }
}

/**
 * Advance payment due before an order goes into production. Each line takes the most specific
 * active rule (product > collection > product type > store-wide; higher priority breaks ties)
 * whose minimum order total is met. Lines with no rule, or a NONE rule, need no advance.
 */
export function resolveAdvance(lines: AdvanceLine[], rules: AdvanceRule[], orderSubtotalPaisa: number): AdvanceResult {
  const usable = rules
    .filter((r) => r.isActive && orderSubtotalPaisa >= r.minOrderPaisa)
    .sort((a, b) => SPECIFICITY[b.scope] - SPECIFICITY[a.scope] || b.priority - a.priority || a.id.localeCompare(b.id));

  const out = lines.map((line) => {
    const rule = usable.find((r) => matches(r, line));
    if (!rule) return { ruleId: null, ruleName: null, mode: null, value: 0, advancePaisa: 0 };
    const amount =
      rule.mode === 'FULL'
        ? line.lineTotalPaisa
        : rule.mode === 'PERCENT'
          ? percentOf(line.lineTotalPaisa, rule.value)
          : rule.mode === 'FIXED'
            ? rule.value * line.quantity
            : 0;
    return { ruleId: rule.id, ruleName: rule.name, mode: rule.mode, value: rule.value, advancePaisa: Math.min(amount, line.lineTotalPaisa) };
  });
  return { requiredPaisa: out.reduce((sum, l) => sum + l.advancePaisa, 0), lines: out };
}
