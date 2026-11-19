import { describe, expect, it } from 'vitest';
import { AmountError, formatAmount, formatFull, parseAmount, splitEvenly, MAX_UINT128 } from './amount.js';

describe('parseAmount', () => {
  it.each([
    ['1', 1_000_000n],
    ['0.000001', 1n],
    ['1,250.5', 1_250_500_000n],
    ['  42 ', 42_000_000n],
    ['.5', 500_000n],
    ['7.', 7_000_000n],
    ['1_000', 1_000_000_000n],
    ['0', 0n],
  ])('%s -> %s', (input, expected) => expect(parseAmount(input)).toBe(expected));

  it.each(['', '-1', '1e6', 'abc', '1.0000001', '1.2.3', '.', '0x10'])('rejects %j', (input) => {
    expect(() => parseAmount(input)).toThrow(AmountError);
  });

  it('rejects values above uint128', () => {
    expect(() => parseAmount((MAX_UINT128 / 1_000_000n + 1n).toString())).toThrow('too large');
  });

  it('avoids float error that 0.1 + 0.2 would hit', () => {
    expect(parseAmount('0.1') + parseAmount('0.2')).toBe(parseAmount('0.3'));
  });
});

describe('formatAmount', () => {
  it('trims zeros but keeps 2 fraction digits by default', () => {
    expect(formatAmount(1_000_000n)).toBe('1.00');
    expect(formatAmount(1_234_567_891n)).toBe('1,234.567891');
    expect(formatAmount(500_000n)).toBe('0.50');
  });
  it('truncates instead of rounding up', () => {
    expect(formatAmount(1_999_999n, { fraction: 2 })).toBe('1.99');
  });
  it('supports full precision and no grouping', () => {
    expect(formatFull(12_345_600n)).toBe('12.345600');
    expect(formatAmount(1_000_000_000_000n, { group: false, fraction: 0 })).toBe('1000000');
  });
  it('round-trips with parseAmount', () => {
    for (const v of [0n, 1n, 999_999n, 123_456_789_012n, MAX_UINT128]) {
      expect(parseAmount(formatAmount(v, { fraction: 6 }))).toBe(v);
    }
  });
  it('formats negatives', () => expect(formatAmount(-1_500_000n)).toBe('-1.50'));
});

describe('splitEvenly', () => {
  it('sums exactly to the total', () => {
    const parts = splitEvenly(1_000_000n, 3);
    expect(parts).toEqual([333_334n, 333_333n, 333_333n]);
    expect(parts.reduce((a, b) => a + b, 0n)).toBe(1_000_000n);
  });
  it('handles zero parts', () => expect(splitEvenly(5n, 0)).toEqual([]));
});
