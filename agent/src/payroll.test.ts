import { describe, expect, it } from 'vitest';
import { parsePayroll } from './payroll.js';

const employer = '0x8c0c495669276456dBe1C160f63B0c9896A5b23c';
const now = 1_795_000_000;

describe('parsePayroll', () => {
  it('converts rows to exact StreamParams', () => {
    const p = parsePayroll({ employer, streams: [{ name: 'Ada', recipient: '0x00000000000000000000000000000000000a11ce', amount: '500.25', cliffDays: 30, durationDays: 90 }] }, now);
    expect(p.rows[0]!.params).toMatchObject({ amount: 500_250_000n, start: now + 120, cliff: now + 120 + 30 * 86400, end: now + 120 + 90 * 86400, cancelable: true });
  });
  it('reports the failing row', () => {
    expect(() => parsePayroll({ employer, streams: [{ name: 'Bad', recipient: '0x1', amount: '1', durationDays: 1 }] }, now)).toThrow('streams[0] (Bad)');
  });
  it('rejects a cliff after the end', () => {
    expect(() => parsePayroll({ employer, streams: [{ recipient: '0x00000000000000000000000000000000000a11ce', amount: '1', cliffDays: 5, durationDays: 1 }] }, now)).toThrow('Cliff');
  });
  it('rejects bad employer', () => expect(() => parsePayroll({ employer: 'nope', streams: [] }, now)).toThrow('employer'));
});
