import { describe, expect, it } from 'vitest';
import { DAY, MONTH, YEAR, parseAmount } from '@paystream/sdk';
import { humanSpan, parseMoney, parsePayroll, resolveRows, type AddressBook } from './parser';

const NOW = Date.UTC(2026, 10, 19, 15, 30) / 1000; // 2026-11-19 15:30 UTC
const ADA = '0x1111111111111111111111111111111111111111';
const TOBE = '0x2222222222222222222222222222222222222222';
const CHI = '0x3333333333333333333333333333333333333333';
const book: AddressBook = { Ada: ADA, Tobe: TOBE, chi: CHI };
const p = (text: string, b: AddressBook = book) => parsePayroll(text, { now: NOW, book: b });
const amounts = (r: ReturnType<typeof p>) => r.rows.map((x) => x.amount);

describe('parseMoney', () => {
  it('reads plain, grouped, decimal, dollar and k/m amounts exactly', () => {
    expect(parseMoney('500')).toBe(500_000000n);
    expect(parseMoney('1,250.5')).toBe(1_250_500000n);
    expect(parseMoney('$300')).toBe(300_000000n);
    expect(parseMoney('1.5k')).toBe(1_500_000000n);
    expect(parseMoney('2K')).toBe(2_000_000000n);
    expect(parseMoney('1.2345k')).toBe(1_234_500000n);
    expect(parseMoney('0.75m')).toBe(750_000_000000n);
    expect(parseMoney('0.000001')).toBe(1n);
  });
  it('rejects junk and more than 6 decimals', () => {
    expect(() => parseMoney('abc')).toThrow();
    expect(() => parseMoney('1.0000001')).toThrow();
  });
});

describe('parsePayroll', () => {
  it('parses the headline example', () => {
    const r = p('Pay Ada 500 and Tobe 300 tUSD8 over 3 months, 1 month cliff');
    expect(r.errors).toEqual([]);
    expect(r.mode).toBe('individual');
    expect(r.rows.map((x) => x.label)).toEqual(['Ada', 'Tobe']);
    expect(r.rows.map((x) => x.address)).toEqual([ADA, TOBE]);
    expect(amounts(r)).toEqual([parseAmount('500'), parseAmount('300')]);
    expect(r.durationSeconds).toBe(3 * MONTH);
    expect(r.cliffSeconds).toBe(MONTH);
    expect(r.start).toBe(NOW);
    expect(r.cancelable).toBe(true);
    expect(r.total).toBe(800_000000n);
    expect(r.warnings).toEqual([]);
  });

  it('handles comma lists, decimals, grouped thousands and k', () => {
    const r = p('Pay Ada 1,250.50, Tobe 1.5k and Chi $99.99 over 6 weeks');
    expect(r.errors).toEqual([]);
    expect(amounts(r)).toEqual([1_250_500000n, 1_500_000000n, 99_990000n]);
    expect(r.durationSeconds).toBe(42 * DAY);
  });

  it('splits a total evenly with splitEvenly and keeps the exact sum', () => {
    const r = p('split 900 between Ada, Tobe and Chi over 90 days');
    expect(r.mode).toBe('split');
    expect(amounts(r)).toEqual([300_000000n, 300_000000n, 300_000000n]);
    expect(r.durationSeconds).toBe(90 * DAY);
    const odd = p('Split 100 among Ada, Tobe and Chi over 1 year');
    expect(amounts(odd)).toEqual([33_333334n, 33_333333n, 33_333333n]);
    expect(odd.total).toBe(100_000000n);
    expect(odd.durationSeconds).toBe(YEAR);
    expect(odd.warnings.some((w) => w.includes('does not divide evenly'))).toBe(true);
  });

  it('applies "each" to every recipient', () => {
    const r = p('Pay Ada, Tobe and Chi 250 USD each over 2 months');
    expect(r.mode).toBe('each');
    expect(amounts(r)).toEqual([250_000000n, 250_000000n, 250_000000n]);
    const lead = p('Send 400 each to Ada and Tobe for 3 months');
    expect(amounts(lead)).toEqual([400_000000n, 400_000000n]);
  });

  it('assumes "each" for one trailing amount and says so', () => {
    const r = p('Pay Ada and Tobe 500 over 3 months');
    expect(amounts(r)).toEqual([500_000000n, 500_000000n]);
    expect(r.warnings.join(' ')).toContain('Assumed 500.00 each');
  });

  it('reads "with a 2 week cliff" and "no cliff"', () => {
    expect(p('Pay Ada 100 over 3 months with a 2 week cliff').cliffSeconds).toBe(14 * DAY);
    expect(p('Pay Ada 100 over 3 months, cliff of 10 days').cliffSeconds).toBe(10 * DAY);
    const none = p('Pay Ada 100 over 3 months, no cliff');
    expect(none.cliffSeconds).toBe(0);
    expect(none.errors).toEqual([]);
    expect(none.rows[0]!.label).toBe('Ada');
  });

  it('reads start phrases: tomorrow, in N days, ISO date, now', () => {
    const midnight = Date.UTC(2026, 10, 20) / 1000;
    expect(p('Pay Ada 100 over 1 month starting tomorrow').start).toBe(midnight);
    expect(p('Pay Ada 100 over 1 month starting in 2 days').start).toBe(NOW + 2 * DAY);
    expect(p('Pay Ada 100 over 1 month on 2026-12-01').start).toBe(Date.UTC(2026, 11, 1) / 1000);
    expect(p('Pay Ada 100 over 1 month starting 2026-12-01').start).toBe(Date.UTC(2026, 11, 1) / 1000);
    expect(p('Pay Ada 100 over 1 month starting now').start).toBe(NOW);
  });

  it('rejects impossible dates and warns about past ones', () => {
    expect(p('Pay Ada 100 over 1 month on 2026-02-30').errors.join(' ')).toContain('not a valid date');
    expect(p('Pay Ada 100 over 1 month on 2026-01-01').warnings.join(' ')).toContain('in the past');
  });

  it('marks non-cancelable / locked streams', () => {
    expect(p('Pay Ada 100 over 1 year, non-cancelable').cancelable).toBe(false);
    expect(p('Pay Ada 100 over 1 year locked').cancelable).toBe(false);
    expect(p('Pay Ada 100 over 1 year non cancellable').rows[0]!.cancelable).toBe(false);
    expect(p('Pay Ada 100 over 1 year').cancelable).toBe(true);
  });

  it('accepts 0x addresses inline without the address book', () => {
    const r = p('Pay 0xabcdefabcdefabcdefabcdefabcdefabcdefabcd 250 over 30 days', {});
    expect(r.errors).toEqual([]);
    expect(r.unknown).toEqual([]);
    expect(r.rows[0]!.address).toBe('0xABcdEFABcdEFabcdEfAbCdefabcdeFABcDEFabCD');
    expect(r.rows[0]!.amount).toBe(250_000000n);
  });

  it('flags malformed addresses', () => {
    const r = p('Pay 0x1234 250 over 30 days', {});
    expect(r.errors.join(' ')).toContain('not a valid address');
    expect(r.rows).toEqual([]);
  });

  it('reports unknown names and resolves them later from the book', () => {
    const r = p('Pay Ngozi 700 and Ada 300 over 3 months', { Ada: ADA });
    expect(r.unknown).toEqual(['Ngozi']);
    expect(r.rows[0]!.address).toBeUndefined();
    const resolved = resolveRows(r.rows, { Ada: ADA, ngozi: TOBE });
    expect(resolved.map((x) => x.address)).toEqual([TOBE, ADA]);
  });

  it('matches names case-insensitively and keeps multi-word names', () => {
    const r = p('pay ada 100 and Mary Jane 200 over 1 month', { ada: ADA, 'mary jane': TOBE });
    expect(r.rows.map((x) => x.label)).toEqual(['ada', 'Mary Jane']);
    expect(r.rows.map((x) => x.address)).toEqual([ADA, TOBE]);
  });

  it('defaults the duration to one month with a warning', () => {
    const r = p('Pay Ada 100');
    expect(r.durationSeconds).toBe(MONTH);
    expect(r.warnings.join(' ')).toContain('No duration given');
  });

  it('errors when the cliff outlasts the stream', () => {
    expect(p('Pay Ada 100 over 2 weeks with a 1 month cliff').errors.join(' ')).toContain('longer than the stream');
  });

  it('errors on missing recipients and missing amounts', () => {
    expect(p('over 3 months').errors.join(' ')).toContain('No recipients');
    const r = p('Pay Ada 100 and Tobe 200 and Chi over 1 month');
    expect(r.errors).toContain('No amount for Chi.');
    expect(r.rows).toHaveLength(2);
  });

  it('errors on zero amounts and too many decimals', () => {
    expect(p('Pay Ada 0 over 1 month').errors.join(' ')).toContain('greater than zero');
    expect(p('Pay Ada 1.1234567 over 1 month').errors.join(' ')).toContain('decimal');
  });

  it('supports short demo durations in minutes and hours', () => {
    expect(p('Pay Ada 10 over 10 minutes, no cliff').durationSeconds).toBe(600);
    expect(p('Pay Ada 10 over 2 hours').durationSeconds).toBe(7200);
  });

  it('reads word numbers like "over a year" and "six weeks"', () => {
    expect(p('Pay Ada 10 over a year').durationSeconds).toBe(YEAR);
    expect(p('Pay Ada 10 over six weeks').durationSeconds).toBe(42 * DAY);
  });

  it('is deterministic', () => {
    const t = 'Split 1.5k between Ada, Tobe and Chi over 6 weeks starting tomorrow, 1 week cliff, locked';
    expect(p(t)).toEqual(p(t));
    const r = p(t);
    expect(r.total).toBe(1_500_000000n);
    expect(r.cliffSeconds).toBe(7 * DAY);
    expect(r.cancelable).toBe(false);
  });
});

describe('humanSpan', () => {
  it('formats whole units', () => {
    expect(humanSpan(3 * MONTH)).toBe('3 months');
    expect(humanSpan(DAY)).toBe('1 day');
    expect(humanSpan(14 * DAY)).toBe('2 weeks');
    expect(humanSpan(90)).toBe('90 seconds');
  });
});
