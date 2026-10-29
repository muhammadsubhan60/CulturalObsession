import { describe, expect, it } from 'vitest';
import { normalizePkMobile } from '../phone';

describe('normalizePkMobile', () => {
  it.each([
    ['03001234567', '+923001234567'],
    ['3001234567', '+923001234567'],
    ['923001234567', '+923001234567'],
    ['+92 300 1234567', '+923001234567'],
    ['0092-300-1234567', '+923001234567'],
  ])('%s → %s', (input, expected) => {
    expect(normalizePkMobile(input)).toBe(expected);
  });

  it.each(['0213456789', '0300123456', '+14155550100', 'abc', ''])('rejects %s', (input) => {
    expect(normalizePkMobile(input)).toBeNull();
  });
});
