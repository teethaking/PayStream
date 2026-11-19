import { describe, expect, it } from 'vitest';
import { chunkRanges, withRetry } from './logs.js';

describe('chunkRanges', () => {
  it('never spans more than 1,000 blocks and covers the range exactly', () => {
    const r = chunkRanges(100n, 2600n);
    expect(r).toEqual([[100n, 1099n], [1100n, 2099n], [2100n, 2600n]]);
    for (const [a, b] of r) expect(b - a + 1n).toBeLessThanOrEqual(1000n);
  });
  it('handles a single block', () => expect(chunkRanges(5n, 5n)).toEqual([[5n, 5n]]));
});

describe('withRetry', () => {
  it('retries then succeeds', async () => {
    let n = 0;
    const v = await withRetry(async () => { if (++n < 3) throw new Error('429'); return 'ok'; }, 4, 1);
    expect(v).toBe('ok');
    expect(n).toBe(3);
  });
  it('gives up after the retry budget', async () => {
    await expect(withRetry(async () => { throw new Error('down'); }, 2, 1)).rejects.toThrow('down');
  });
});
