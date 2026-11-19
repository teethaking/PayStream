import { describe, expect, it } from 'vitest';
import { cancelSplit, streamStatus, vestedAt, vestedAtPrecise, vestingCurve, withdrawableAt } from './vesting.js';

const s = { total: 1000_000000n, withdrawn: 0n, start: 1000, cliff: 1500, end: 2000, canceled: false };

describe('vestedAt (mirrors StreamVault._vested)', () => {
  it('is zero before the cliff', () => expect(vestedAt(s, 1499)).toBe(0n));
  it('jumps to the linear amount at the cliff', () => expect(vestedAt(s, 1500)).toBe(500_000000n));
  it('is linear and floors', () => expect(vestedAt({ ...s, total: 10n, cliff: 1000 }, 1333)).toBe(3n));
  it('is total at and after end', () => {
    expect(vestedAt(s, 2000)).toBe(s.total);
    expect(vestedAt(s, 9999)).toBe(s.total);
  });
  it('freezes at total once canceled', () => expect(vestedAt({ ...s, total: 400n, canceled: true }, 0)).toBe(400n));
  it('withdrawable subtracts withdrawn', () => expect(withdrawableAt({ ...s, withdrawn: 100_000000n }, 2000)).toBe(900_000000n));
});

describe('streamStatus', () => {
  it('walks pending-cliff -> vesting -> completed', () => {
    expect(streamStatus(s, 1200)).toBe('pending-cliff');
    expect(streamStatus(s, 1600)).toBe('vesting');
    expect(streamStatus(s, 2000)).toBe('completed');
    expect(streamStatus({ ...s, canceled: true }, 1600)).toBe('canceled');
  });
});

describe('cancelSplit', () => {
  it('splits vested to recipient and refunds the rest', () => {
    const split = cancelSplit({ ...s, withdrawn: 100_000000n }, 1600);
    expect(split).toEqual({ toRecipient: 500_000000n, refunded: 400_000000n, alreadyPaid: 100_000000n });
    expect(split.toRecipient + split.refunded + split.alreadyPaid).toBe(s.total);
  });
  it('refunds everything before the cliff', () => expect(cancelSplit(s, 1100).refunded).toBe(s.total));
});

describe('vestedAtPrecise', () => {
  it('never exceeds the integer value by a full unit', () => {
    for (let t = 1500; t <= 2000; t += 37) {
      const precise = vestedAtPrecise(s, t);
      const exact = Number(vestedAt(s, t));
      expect(precise).toBeGreaterThanOrEqual(exact);
      expect(precise - exact).toBeLessThan(1);
    }
  });
});

describe('vestingCurve', () => {
  it('includes the cliff step and ends at total', () => {
    const c = vestingCurve(s, 10);
    expect(c.at(-1)?.vested).toBe(s.total);
    expect(c.some((p) => p.t === 1499 && p.vested === 0n)).toBe(true);
    expect(c.map((p) => p.t)).toEqual([...c.map((p) => p.t)].sort((a, b) => a - b));
  });
});
