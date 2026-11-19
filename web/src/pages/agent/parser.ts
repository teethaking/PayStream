import { getAddress, isAddress, type Address } from 'viem';
import { DAY, MONTH, YEAR, AmountError, formatAmount, parseAmount, splitEvenly } from '@paystream/sdk';

/**
 * Deterministic payroll-instruction parser. No network and no LLM: the same text and clock always give the same rows.
 *
 *   "Pay Ada 500 and Tobe 300 tUSD8 over 3 months, 1 month cliff"
 *   "Split 1.5k between Ada, Tobe and Chi over 6 weeks starting tomorrow"
 */

export type AddressBook = Record<string, string>;

export interface ParsedRow {
  /** Name as typed, or the checksummed address when one was given directly. */
  label: string;
  /** From the text (0x...) or the address book; undefined while the name is unknown. */
  address?: Address;
  amount: bigint;
  start: number;
  cliffSeconds: number;
  durationSeconds: number;
  cancelable: boolean;
}

export type SplitMode = 'individual' | 'each' | 'split';

export interface ParseResult {
  rows: ParsedRow[];
  mode: SplitMode;
  start: number;
  cliffSeconds: number;
  durationSeconds: number;
  cancelable: boolean;
  total: bigint;
  /** Names that need an address before anything can be sent. */
  unknown: string[];
  /** Assumptions the parser made: safe to proceed, but worth reading. */
  warnings: string[];
  /** Problems that make the instruction unusable as written. */
  errors: string[];
}

export interface ParseOptions {
  /** Unix seconds used for "now", "tomorrow" and "in 2 days". */
  now: number;
  book?: AddressBook;
}

const MINUTE = 60;
const HOUR = 3600;
const WEEK = 7 * DAY;

const UNIT_SECONDS: Record<string, number> = {
  minute: MINUTE,
  min: MINUTE,
  hour: HOUR,
  hr: HOUR,
  day: DAY,
  week: WEEK,
  wk: WEEK,
  month: MONTH,
  mo: MONTH,
  year: YEAR,
  yr: YEAR,
};

const WORD_NUMBERS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
};

const NUM = '(\\d+(?:\\.\\d+)?|an?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)';
const UNIT = '(minutes?|mins?|hours?|hrs?|days?|weeks?|wks?|months?|mos?|years?|yrs?)';

const STOP_WORDS = new Set(
  (
    'pay paying send stream streaming streams give please to each apiece per person salary salaries of the with and ' +
    'split evenly equally between among amongst across total in a an for payroll tokens over starting start beginning ' +
    'from on cliff vesting vest monthly them'
  ).split(' '),
);

const toNumber = (s: string) => WORD_NUMBERS[s.toLowerCase()] ?? Number(s);
const unitSeconds = (u: string) => UNIT_SECONDS[u.toLowerCase().replace(/s$/, '')] ?? DAY;
const span = (n: string, u: string) => Math.round(toNumber(n) * unitSeconds(u));

/** "7776000" -> "3 months". */
export function humanSpan(seconds: number) {
  for (const [name, s] of [
    ['year', YEAR],
    ['month', MONTH],
    ['week', WEEK],
    ['day', DAY],
    ['hour', HOUR],
    ['minute', MINUTE],
  ] as const) {
    if (seconds >= s && seconds % s === 0) {
      const n = seconds / s;
      return n + ' ' + name + (n === 1 ? '' : 's');
    }
  }
  return seconds + ' seconds';
}

/** Parses "1,500", "1.5k", "$300" or "2m" into 6-decimal base units without floating point. */
export function parseMoney(raw: string): bigint {
  const m = /^\$?\s*(\d+(?:\.\d+)?)\s*([km])?$/i.exec(raw.trim().replace(/,/g, ''));
  if (!m) throw new AmountError('"' + raw.trim() + '" is not an amount');
  const base = m[1]!;
  const mult = m[2]?.toLowerCase();
  if (!mult) return parseAmount(base);
  const shift = mult === 'k' ? 3 : 6;
  const [whole, frac = ''] = base.split('.') as [string, string?];
  const shifted =
    whole + frac.padEnd(shift, '0').slice(0, shift) + (frac.length > shift ? '.' + frac.slice(shift) : '');
  return parseAmount(shifted);
}

const AMOUNT_RE =
  /\$?\s*\b\d+(?:\.\d+)?\s*[km]?\b(?!\s*(?:minutes?|mins?|hours?|hrs?|days?|weeks?|wks?|months?|mos?|years?|yrs?)\b)/i;

const lookup = (book: AddressBook, label: string) => {
  const hit = Object.entries(book).find(([name]) => name.trim().toLowerCase() === label.trim().toLowerCase());
  return hit && isAddress(hit[1], { strict: false }) ? getAddress(hit[1]) : undefined;
};

/** Turns one natural-language payroll instruction into typed stream rows. */
export function parsePayroll(input: string, { now, book = {} }: ParseOptions): ParseResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  now = Math.floor(now);

  // 0x addresses are lifted out first so nothing below can mangle them.
  const addresses: string[] = [];
  let text = (' ' + input + ' ').replace(/0x[0-9a-fA-F]*/g, (a) => {
    addresses.push(a);
    return ' @addr' + (addresses.length - 1) + ' ';
  });
  // Thousands separators, then currency words (tUSD8 contains a digit).
  text = text.replace(/(\d),(?=\d{3}\b)/g, '$1').replace(/\b(?:t?usd8?|usdc|dollars?)\b/gi, ' ');

  const take = (re: RegExp, fn: (m: RegExpExecArray) => void) => {
    const m = re.exec(text);
    if (!m) return false;
    fn(m);
    text = text.slice(0, m.index) + ' , ' + text.slice(m.index + m[0].length);
    return true;
  };

  let cancelable = true;
  take(/\b(?:non[-\s]?cancell?able|uncancell?able|irrevocable|locked(?:\s+in)?)\b/i, () => (cancelable = false));
  take(/\bcancell?able\b/i, () => undefined);

  let start = now;
  const startMatched =
    take(/\b(?:(?:starting|start|beginning|from|on)\s+(?:on\s+)?)?(\d{4})-(\d{2})-(\d{2})\b/i, (m) => {
      const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
      const date = new Date(Date.UTC(y, mo - 1, d));
      if (date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d)
        errors.push('"' + m[0].trim() + '" is not a valid date.');
      else start = date.getTime() / 1000;
    }) ||
    take(/\b(?:(?:starting|start|beginning|from)\s+)?tomorrow\b/i, () => {
      start = Math.floor(now / DAY) * DAY + DAY;
    }) ||
    take(new RegExp('\\b(?:(?:starting|start|beginning)\\s+)?in\\s+' + NUM + '\\s*' + UNIT + '\\b', 'i'), (m) => {
      start = now + span(m[1]!, m[2]!);
    }) ||
    take(/\b(?:(?:starting|start|beginning)\s+)?(?:right\s+)?(?:now|today|immediately)\b/i, () => {
      start = now;
    });
  if (startMatched && start < now)
    warnings.push('The start date is in the past, so part of each stream vests immediately.');
  if (!startMatched && /\b(?:starting|beginning|start)\b/i.test(text))
    warnings.push(
      'Could not read the start date, so the streams start now. Try "starting tomorrow" or "on 2026-12-01".',
    );

  let cliffSeconds = 0;
  const cliffMatched =
    take(/\b(?:with\s+)?(?:no|without(?:\s+an?)?|zero)\s+cliff\b/i, () => undefined) ||
    take(new RegExp('\\b(?:(?:with|and)\\s+(?:an?\\s+)?)?' + NUM + '[\\s-]*' + UNIT + '[\\s-]+cliff\\b', 'i'), (m) => {
      cliffSeconds = span(m[1]!, m[2]!);
    }) ||
    take(new RegExp('\\bcliff\\s+(?:of\\s+|is\\s+|at\\s+)?' + NUM + '\\s*' + UNIT + '\\b', 'i'), (m) => {
      cliffSeconds = span(m[1]!, m[2]!);
    });
  if (!cliffMatched && /\bcliff\b/i.test(text))
    warnings.push('A cliff was mentioned without a length, so no cliff was applied.');

  let durationSeconds = 0;
  const durationMatched =
    take(
      new RegExp('\\b(?:over|for|across|during|lasting)\\s+(?:the\\s+next\\s+)?' + NUM + '\\s*' + UNIT + '\\b', 'i'),
      (m) => {
        durationSeconds = span(m[1]!, m[2]!);
      },
    ) ||
    take(new RegExp('\\b(\\d+(?:\\.\\d+)?)\\s*' + UNIT + '\\b', 'i'), (m) => {
      durationSeconds = span(m[1]!, m[2]!);
      warnings.push('Read "' + m[0].trim() + '" as the vesting duration.');
    });
  if (!durationMatched || durationSeconds <= 0) {
    durationSeconds = MONTH;
    warnings.push('No duration given, so each stream vests over 1 month (30 days).');
  }
  if (cliffSeconds > durationSeconds)
    errors.push(
      'The cliff (' + humanSpan(cliffSeconds) + ') is longer than the stream (' + humanSpan(durationSeconds) + ').',
    );

  const splitWord = /\b(?:split|divide|share)\b/i.test(text);
  const eachWord = /\b(?:each|apiece|per\s+person|everyone)\b/i.test(text);
  text = text.replace(/\b(?:per\s+person|everyone|divide|share)\b/gi, ' ');

  interface Entry {
    label: string;
    address?: Address;
    amount?: bigint;
  }
  const entries: Entry[] = [];
  let pooled: bigint | undefined;

  const readAmount = (raw: string): bigint | undefined => {
    try {
      const v = parseMoney(raw);
      if (v > 0n) return v;
      errors.push('Amounts must be greater than zero.');
    } catch (e) {
      errors.push(raw.trim() + ': ' + (e instanceof Error ? e.message : 'not an amount'));
    }
    return undefined;
  };

  for (const seg of text.split(/,|;|&|\+|\band\b|\bplus\b|\n/i)) {
    let s = seg;
    let amount: bigint | undefined;
    const am = AMOUNT_RE.exec(s);
    if (am) {
      amount = readAmount(am[0]);
      s = s.slice(0, am.index) + ' ' + s.slice(am.index + am[0].length);
      if (AMOUNT_RE.test(s)) {
        warnings.push('Ignored an extra number in "' + seg.trim() + '".');
        s = s.replace(new RegExp(AMOUNT_RE.source, 'gi'), ' ');
      }
    }
    let label = '';
    let address: Address | undefined;
    const token = /@addr(\d+)/.exec(s);
    if (token) {
      const raw = addresses[Number(token[1])]!;
      if (isAddress(raw, { strict: false })) {
        address = getAddress(raw);
        label = address;
      } else errors.push(raw + ' is not a valid address (expected 0x followed by 40 hex characters).');
      s = s.replace(/@addr\d+/g, ' ');
    }
    if (!label && !token) {
      const words = (s.match(/[A-Za-z][A-Za-z.'-]*/g) ?? []).filter((w) => !STOP_WORDS.has(w.toLowerCase()));
      label = words.join(' ').replace(/\.+$/, '');
    }
    if (!label) {
      if (amount !== undefined && !token) {
        if (pooled !== undefined) warnings.push('Ignored an extra amount (' + formatAmount(amount) + ').');
        else pooled = amount;
      }
      continue;
    }
    entries.push({ label, address: address ?? lookup(book, label), amount });
  }

  let mode: SplitMode = 'individual';
  const withAmount = entries.filter((e) => e.amount !== undefined);
  if (splitWord) {
    mode = 'split';
    const total = pooled ?? (withAmount.length === 1 ? withAmount[0]!.amount : undefined);
    if (withAmount.length > 1) errors.push('A split needs one total amount, but several amounts were given.');
    else if (total === undefined) errors.push('Say how much to split, for example "split 900 between Ada and Tobe".');
    else if (entries.length) {
      const parts = splitEvenly(total, entries.length);
      entries.forEach((e, i) => (e.amount = parts[i]));
      if (total % BigInt(entries.length) !== 0n)
        warnings.push(
          formatAmount(total) + ' does not divide evenly, so the leftover base units go to the first recipients.',
        );
    }
  } else if (eachWord || (pooled !== undefined && withAmount.length === 0)) {
    mode = 'each';
    const each = pooled ?? (withAmount.length === 1 ? withAmount[0]!.amount : undefined);
    if (withAmount.length > 1) {
      mode = 'individual';
      warnings.push('Found "each" but also a different amount per person, so the individual amounts were used.');
    } else if (each === undefined) errors.push('Say how much each person gets.');
    else entries.forEach((e) => (e.amount = each));
  } else if (withAmount.length === 1 && entries.length > 1 && entries[entries.length - 1]!.amount !== undefined) {
    mode = 'each';
    const each = withAmount[0]!.amount!;
    entries.forEach((e) => (e.amount = each));
    warnings.push('Assumed ' + formatAmount(each) + ' each. Say "split" to divide it instead.');
  }

  if (!entries.length && !errors.length) errors.push('No recipients found. Try "Pay Ada 500 over 3 months".');
  for (const e of entries) if (e.amount === undefined) errors.push('No amount for ' + e.label + '.');

  const seen = new Set<string>();
  for (const e of entries) {
    const k = (e.address ?? e.label).toLowerCase();
    if (seen.has(k)) warnings.push(e.label + ' appears more than once; each mention becomes its own stream.');
    seen.add(k);
  }

  const rows: ParsedRow[] = entries
    .filter((e): e is Entry & { amount: bigint } => e.amount !== undefined)
    .map((e) => ({
      label: e.label,
      address: e.address,
      amount: e.amount,
      start,
      cliffSeconds,
      durationSeconds,
      cancelable,
    }));

  return {
    rows,
    mode,
    start,
    cliffSeconds,
    durationSeconds,
    cancelable,
    total: rows.reduce((sum, r) => sum + r.amount, 0n),
    unknown: [...new Set(entries.filter((e) => !e.address).map((e) => e.label))],
    warnings: [...new Set(warnings)],
    errors: [...new Set(errors)],
  };
}

/** Re-resolves names against an updated address book without reparsing. */
export function resolveRows(rows: readonly ParsedRow[], book: AddressBook): ParsedRow[] {
  return rows.map((r) => (r.address ? r : { ...r, address: lookup(book, r.label) }));
}
