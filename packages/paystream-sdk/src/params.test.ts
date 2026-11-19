import { describe, expect, it } from 'vitest';
import { DAY, ParamsError, buildStreamParams, checkOperatorCaps, spentToday, totalOf, validateParams } from './params.js';

const alice = '0x00000000000000000000000000000000000a11ce';
const now = 1_763_500_000;

describe('buildStreamParams', () => {
  it('builds a cliff + linear schedule and checksums the address', () => {
    const p = buildStreamParams({ recipient: alice, amount: 5n, start: now, cliffSeconds: DAY, durationSeconds: 30 * DAY });
    expect(p).toMatchObject({ amount: 5n, start: now, cliff: now + DAY, end: now + 30 * DAY, cancelable: true });
    expect(p.recipient).toBe('0x00000000000000000000000000000000000A11cE');
  });
  it('mirrors on-chain validation', () => {
    const ok = { recipient: alice as `0x${string}`, amount: 1n, start: 10, cliff: 10, end: 20, cancelable: true };
    expect(() => validateParams(ok)).not.toThrow();
    expect(() => validateParams({ ...ok, end: 10 })).toThrow(ParamsError);
    expect(() => validateParams({ ...ok, cliff: 9 })).toThrow('before start');
    expect(() => validateParams({ ...ok, cliff: 21 })).toThrow('after end');
    expect(() => validateParams({ ...ok, amount: 0n })).toThrow('greater than zero');
    expect(() => validateParams({ ...ok, recipient: '0x0000000000000000000000000000000000000000' })).toThrow('recipient');
    expect(() => validateParams({ ...ok, recipient: '0x123' as `0x${string}` })).toThrow('recipient');
  });
  it('sums a batch', () => {
    const p = buildStreamParams({ recipient: alice, amount: 7n, start: now, durationSeconds: 10 });
    expect(totalOf([p, p, p])).toBe(21n);
  });
});

describe('checkOperatorCaps (mirrors StreamVault._authorize)', () => {
  const p = (amount: bigint) => buildStreamParams({ recipient: alice, amount, start: now, durationSeconds: 100 });
  const op = { perStreamCap: 1000n, dailyCap: 1500n, expiry: now + DAY, dayIndex: 0, spentToday: 0n };

  it('passes within caps', () => expect(checkOperatorCaps(op, [p(1000n), p(500n)], now)).toEqual({ ok: true, spentAfter: 1500n }));
  it('blocks per-stream', () => expect(checkOperatorCaps(op, [p(1001n)], now)).toMatchObject({ ok: false, reason: 'PerStreamCapExceeded' }));
  it('blocks daily across a batch and reports the row', () =>
    expect(checkOperatorCaps(op, [p(1000n), p(600n)], now)).toEqual({ ok: false, reason: 'DailyCapExceeded', index: 1 }));
  it('counts what was already spent today', () => {
    const today = Math.floor(now / DAY);
    expect(checkOperatorCaps({ ...op, dayIndex: today, spentToday: 1200n }, [p(400n)], now)).toMatchObject({ reason: 'DailyCapExceeded' });
    expect(spentToday({ dayIndex: today - 1, spentToday: 1200n }, now)).toBe(0n);
  });
  it('blocks expired and missing operators', () => {
    expect(checkOperatorCaps({ ...op, expiry: now }, [p(1n)], now)).toMatchObject({ reason: 'OperatorExpired' });
    expect(checkOperatorCaps({ ...op, expiry: 0 }, [p(1n)], now)).toMatchObject({ reason: 'NotAuthorized' });
  });
});
