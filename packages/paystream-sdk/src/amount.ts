/** BigInt-only money helpers for 6-decimal tokens. No floating point anywhere. */

export const DECIMALS = 6;
const SCALE = 10n ** BigInt(DECIMALS);
export const MAX_UINT128 = (1n << 128n) - 1n;

export class AmountError extends Error {}

/**
 * Parses a human amount like "1,250.5" into base units (1250500000n).
 * Rejects negatives, exponents, more than 6 fractional digits and anything above uint128.
 */
export function parseAmount(input: string, decimals = DECIMALS): bigint {
  const s = input.trim().replace(/[,_\s]/g, '');
  if (s === '') throw new AmountError('Enter an amount');
  const m = /^(\d*)(?:\.(\d*))?$/.exec(s);
  if (!m || (m[1] === '' && (m[2] ?? '') === '')) throw new AmountError('Not a valid number');
  const whole = m[1] || '0';
  const frac = m[2] ?? '';
  if (frac.length > decimals) throw new AmountError(`At most ${decimals} decimal places`);
  const value = BigInt(whole) * 10n ** BigInt(decimals) + BigInt((frac + '0'.repeat(decimals)).slice(0, decimals) || '0');
  if (value > MAX_UINT128) throw new AmountError('Amount is too large');
  return value;
}

export interface FormatOptions {
  /** Fixed number of fractional digits to show (0-6). Default: trims trailing zeros, keeps at least `minFraction`. */
  fraction?: number;
  minFraction?: number;
  /** Thousands separators. Default true. */
  group?: boolean;
  decimals?: number;
}

/** Formats base units as a decimal string, truncating (never rounding up) money. */
export function formatAmount(value: bigint, opts: FormatOptions = {}): string {
  const decimals = opts.decimals ?? DECIMALS;
  const neg = value < 0n;
  const v = neg ? -value : value;
  const scale = 10n ** BigInt(decimals);
  let whole = (v / scale).toString();
  let frac = (v % scale).toString().padStart(decimals, '0');
  if (opts.fraction !== undefined) {
    frac = frac.slice(0, Math.max(0, Math.min(decimals, opts.fraction)));
  } else {
    frac = frac.replace(/0+$/, '');
    const min = opts.minFraction ?? 2;
    if (frac.length < min) frac = frac.padEnd(Math.min(min, decimals), '0');
  }
  if (opts.group !== false) whole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (neg ? '-' : '') + whole + (frac ? '.' + frac : '');
}

/** Exact 6-decimal string with all digits, e.g. "12.345600". */
export const formatFull = (value: bigint) => formatAmount(value, { fraction: DECIMALS });

/** value * num / den with floor rounding, all BigInt. */
export const mulDiv = (value: bigint, num: bigint, den: bigint) => (value * num) / den;

/** Splits a total into `parts` amounts that sum exactly to the total (remainder goes to the first parts). */
export function splitEvenly(total: bigint, parts: number): bigint[] {
  if (parts <= 0) return [];
  const n = BigInt(parts);
  const base = total / n;
  const rem = total % n;
  return Array.from({ length: parts }, (_, i) => base + (BigInt(i) < rem ? 1n : 0n));
}

export const ONE = SCALE;
