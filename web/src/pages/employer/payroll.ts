import { isAddress, type Address } from 'viem';
import {
  AmountError,
  DAY,
  MONTH,
  ParamsError,
  YEAR,
  parseAmount,
  validateParams,
  vestedAt,
  vestingCurve,
  type StreamParams,
} from '@paystream/sdk';
import { useEvents } from '@/lib/events';

export type Unit = 'minute' | 'hour' | 'day' | 'month' | 'year';
export const UNITS: { value: Unit; label: string; seconds: number }[] = [
  { value: 'minute', label: 'min', seconds: 60 },
  { value: 'hour', label: 'hours', seconds: 3600 },
  { value: 'day', label: 'days', seconds: DAY },
  { value: 'month', label: 'months', seconds: MONTH },
  { value: 'year', label: 'years', seconds: YEAR },
];
const unitSeconds = (u: Unit) => UNITS.find((x) => x.value === u)!.seconds;

/** Largest batch the form submits in one createStreams transaction. */
export const MAX_BATCH = 50;

/** Chain-aligned seconds, read once (no re-render). */
export const chainNow = () => Date.now() / 1000 + useEvents.getState().chainOffset;

export interface Schedule {
  cliff: string;
  cliffUnit: Unit;
  duration: string;
  durationUnit: Unit;
  cancelable: boolean;
}

export interface Row extends Schedule {
  key: string;
  recipient: string;
  amount: string;
  /** datetime-local value (local time). */
  start: string;
}

export type RowField = 'recipient' | 'amount' | 'start' | 'cliff' | 'duration';
export type RowErrors = Partial<Record<RowField, string>>;
export interface RowResult {
  params?: StreamParams;
  errors: RowErrors;
}

let seq = 0;
export const newKey = () => `row-${Date.now().toString(36)}-${++seq}`;

const pad = (n: number) => String(n).padStart(2, '0');
export function toLocalInput(seconds: number) {
  const d = new Date(seconds * 1000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export const fromLocalInput = (v: string) => {
  const ms = new Date(v).getTime();
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : NaN;
};

export const defaultStart = (nowSeconds: number) => toLocalInput(Math.ceil((nowSeconds + 120) / 60) * 60);

export const scheduleOf = (r: Row): Schedule => ({
  cliff: r.cliff,
  cliffUnit: r.cliffUnit,
  duration: r.duration,
  durationUnit: r.durationUnit,
  cancelable: r.cancelable,
});

export function blankRow(nowSeconds: number, schedule?: Schedule): Row {
  return {
    key: newKey(),
    recipient: '',
    amount: '',
    start: defaultStart(nowSeconds),
    cliff: '0',
    cliffUnit: 'day',
    duration: '30',
    durationUnit: 'day',
    cancelable: true,
    ...schedule,
  };
}

const NUM = /^\d*\.?\d+$/;
const parseSpan = (value: string, unit: Unit) => {
  const s = value.trim();
  if (s === '') return 0;
  if (!NUM.test(s)) return NaN;
  return Math.round(Number(s) * unitSeconds(unit));
};

export const isBlank = (r: Row) => !r.recipient.trim() && !r.amount.trim();

/** Converts a form row into exact contract params, mirroring StreamVault's own checks via validateParams. */
export function rowToParams(row: Row): RowResult {
  const errors: RowErrors = {};
  let amount = 0n;
  try {
    amount = parseAmount(row.amount);
  } catch (e) {
    errors.amount = e instanceof AmountError ? e.message : 'Not a valid number';
  }
  const start = fromLocalInput(row.start);
  if (!Number.isFinite(start)) errors.start = 'Pick a start date and time';
  const cliffSpan = parseSpan(row.cliff, row.cliffUnit);
  if (!Number.isFinite(cliffSpan)) errors.cliff = 'Enter a number';
  const durationSpan = parseSpan(row.duration, row.durationUnit);
  if (!Number.isFinite(durationSpan)) errors.duration = 'Enter a number';
  else if (durationSpan <= 0) errors.duration = 'Duration must be longer than zero';
  if (!isAddress(row.recipient.trim())) errors.recipient = 'Enter a valid recipient address';
  if (Object.keys(errors).length) return { errors };

  const params: StreamParams = {
    recipient: row.recipient.trim() as Address,
    amount,
    start,
    cliff: start + cliffSpan,
    end: start + durationSpan,
    cancelable: row.cancelable,
  };
  try {
    validateParams(params);
  } catch (e) {
    if (!(e instanceof ParamsError)) throw e;
    const field: RowField = e.field === 'end' ? 'duration' : e.field === 'cancelable' ? 'start' : e.field;
    return { errors: { [field]: e.message } };
  }
  return { params, errors };
}

export const TEMPLATES: { id: string; label: string; hint: string; schedule: Schedule }[] = [
  {
    id: 'salary',
    label: 'Monthly salary · 6 months',
    hint: 'No cliff, streams for 6 × 30 days',
    schedule: { cliff: '0', cliffUnit: 'day', duration: '6', durationUnit: 'month', cancelable: true },
  },
  {
    id: 'vest',
    label: '4-year vest · 1-year cliff',
    hint: 'Nothing unlocks for a year, then linear',
    schedule: { cliff: '1', cliffUnit: 'year', duration: '4', durationUnit: 'year', cancelable: true },
  },
  {
    id: 'contractor',
    label: 'Contractor · 2 weeks',
    hint: 'Linear over 14 days, no cliff',
    schedule: { cliff: '0', cliffUnit: 'day', duration: '14', durationUnit: 'day', cancelable: true },
  },
  {
    id: 'demo',
    label: 'Live demo · 10 minutes',
    hint: '2-minute cliff, fully vested in 10 minutes',
    schedule: { cliff: '2', cliffUnit: 'minute', duration: '10', durationUnit: 'minute', cancelable: true },
  },
];

export interface CsvResult {
  rows: Row[];
  errors: { line: number; message: string }[];
}

const truthy = new Set(['true', 'yes', 'y', '1']);
const falsy = new Set(['false', 'no', 'n', '0']);

/** Parses `address,amount,startISO?,cliffDays,durationDays,cancelable` lines. A header line is skipped. */
export function parseCsv(text: string, nowSeconds: number): CsvResult {
  const rows: Row[] = [];
  const errors: CsvResult['errors'] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1;
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const cells = trimmed.split(/[,;\t]/).map((c) => c.trim());
    if (/^(address|recipient)$/i.test(cells[0] ?? '')) return;
    const fail = (message: string) => void errors.push({ line, message });
    if (cells.length < 5) return fail(`Expected at least 5 columns, found ${cells.length}`);
    const [address = '', amount = '', startIso = '', cliffDays = '', durationDays = '', cancelable = 'true'] = cells;
    if (!isAddress(address))
      return fail(`"${address.length > 16 ? address.slice(0, 16) + '…' : address}" is not a valid address`);
    try {
      if (parseAmount(amount) <= 0n) return fail('Amount must be greater than zero');
    } catch (e) {
      return fail(`Amount: ${(e as Error).message}`);
    }
    let start = defaultStart(nowSeconds);
    if (startIso) {
      const ms = Date.parse(startIso);
      if (!Number.isFinite(ms)) return fail(`"${startIso}" is not an ISO date`);
      start = toLocalInput(Math.floor(ms / 1000));
    }
    const cliff = cliffDays || '0';
    if (!NUM.test(cliff)) return fail(`Cliff days "${cliffDays}" is not a number`);
    if (!NUM.test(durationDays) || Number(durationDays) <= 0)
      return fail(`Duration days "${durationDays}" must be a positive number`);
    if (Number(cliff) > Number(durationDays)) return fail('Cliff is longer than the duration');
    const c = cancelable.toLowerCase() || 'true';
    if (!truthy.has(c) && !falsy.has(c)) return fail(`Cancelable must be true or false, got "${cancelable}"`);
    rows.push({
      key: newKey(),
      recipient: address,
      amount,
      start,
      cliff,
      cliffUnit: 'day',
      duration: durationDays,
      durationUnit: 'day',
      cancelable: truthy.has(c),
    });
  });
  return { rows, errors };
}

/** Aggregate vesting curve across streams: exact BigInt sums at each sample; numbers only for display. */
export function aggregateCurve(params: readonly StreamParams[], maxPoints = 160) {
  if (!params.length) return [];
  const times = new Set<number>();
  const pinned = new Set<number>();
  for (const p of params) {
    for (const pt of vestingCurve({ total: p.amount, start: p.start, cliff: p.cliff, end: p.end }, 40)) times.add(pt.t);
    if (p.cliff > p.start && p.cliff < p.end) {
      pinned.add(p.cliff - 1);
      pinned.add(p.cliff);
    }
  }
  let ts = [...times].sort((a, b) => a - b);
  if (ts.length > maxPoints) {
    const step = ts.length / maxPoints;
    const kept = new Set<number>([ts[0]!, ts[ts.length - 1]!, ...pinned]);
    for (let i = 0; i < maxPoints; i++) kept.add(ts[Math.floor(i * step)]!);
    ts = [...kept].sort((a, b) => a - b);
  }
  const scheds = params.map((p) => ({
    total: p.amount,
    withdrawn: 0n,
    start: p.start,
    cliff: p.cliff,
    end: p.end,
    canceled: false,
  }));
  return ts.map((t) => ({ t, vested: Number(scheds.reduce((acc, s) => acc + vestedAt(s, t), 0n)) / 1e6 }));
}
