import { describe, expect, it } from 'vitest';
import { assertPaisa, formatPkr, percentOf, rupeesToPaisa } from '../money';

describe('money', () => {
  it('converts rupees to paisa without float drift', () => {
    expect(rupeesToPaisa(999)).toBe(99_900);
    expect(rupeesToPaisa('1,299.50')).toBe(129_950);
    expect(rupeesToPaisa(0.1 + 0.2)).toBe(30);
  });

  it('rejects negative, fractional and non-finite amounts', () => {
    expect(() => assertPaisa(-1)).toThrow(RangeError);
    expect(() => assertPaisa(1.5)).toThrow(RangeError);
    expect(() => rupeesToPaisa('abc')).toThrow(RangeError);
  });

  it('formats like the current storefront', () => {
    expect(formatPkr(99_900)).toBe('Rs.999.00 PKR');
    expect(formatPkr(1_234_505)).toBe('Rs.12,345.05 PKR');
    expect(formatPkr(0)).toBe('Rs.0.00 PKR');
  });

  it('takes percentages in basis points', () => {
    expect(percentOf(99_900, 5_000)).toBe(49_950);
    expect(percentOf(99_900, 3_333)).toBe(33_297);
    expect(() => percentOf(100, 10_001)).toThrow(RangeError);
  });
});

import { slugify } from '../catalog';

describe('slugify', () => {
  it('matches Shopify-style handles', () => {
    expect(slugify('Customize Name Cufflinks')).toBe('customize-name-cufflinks');
    expect(slugify('  24K Stud — Cufflinks!! ')).toBe('24k-stud-cufflinks');
    expect(slugify('Café Ring')).toBe('cafe-ring');
  });
});
