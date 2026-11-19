import type { Address } from 'viem';
import { isAddress, getAddress } from 'viem';
import { MAX_UINT128 } from './amount.js';

export const DAY = 86_400;
export const MONTH = 30 * DAY;
export const YEAR = 365 * DAY;
const MAX_UINT40 = 2 ** 40 - 1;

/** Mirrors the on-chain StreamVault.StreamParams struct. */
export interface StreamParams {
  recipient: Address;
  amount: bigint;
  start: number;
  cliff: number;
  end: number;
  cancelable: boolean;
}

export interface ScheduleInput {
  recipient: string;
  amount: bigint;
  /** Unix seconds. */
  start: number;
  /** Seconds after start before anything vests. */
  cliffSeconds?: number;
  durationSeconds: number;
  cancelable?: boolean;
}

export class ParamsError extends Error {
  constructor(
    message: string,
    public field: keyof StreamParams,
  ) {
    super(message);
  }
}

/** Validates exactly what the contract validates, so a bad row is caught before a wallet prompt. */
export function validateParams(p: StreamParams): void {
  if (!isAddress(p.recipient) || /^0x0{40}$/i.test(p.recipient)) throw new ParamsError('Enter a valid recipient address', 'recipient');
  if (p.amount <= 0n) throw new ParamsError('Amount must be greater than zero', 'amount');
  if (p.amount > MAX_UINT128) throw new ParamsError('Amount is too large', 'amount');
  for (const k of ['start', 'cliff', 'end'] as const) {
    if (!Number.isInteger(p[k]) || p[k] < 0 || p[k] > MAX_UINT40) throw new ParamsError('Invalid timestamp', k);
  }
  if (p.end <= p.start) throw new ParamsError('End must be after start', 'end');
  if (p.cliff < p.start) throw new ParamsError('Cliff cannot be before start', 'cliff');
  if (p.cliff > p.end) throw new ParamsError('Cliff cannot be after end', 'cliff');
}

export function buildStreamParams(input: ScheduleInput): StreamParams {
  const p: StreamParams = {
    recipient: (isAddress(input.recipient) ? getAddress(input.recipient) : input.recipient) as Address,
    amount: input.amount,
    start: input.start,
    cliff: input.start + (input.cliffSeconds ?? 0),
    end: input.start + input.durationSeconds,
    cancelable: input.cancelable ?? true,
  };
  validateParams(p);
  return p;
}

export function totalOf(ps: readonly StreamParams[]): bigint {
  return ps.reduce((sum, p) => sum + p.amount, 0n);
}

export interface OperatorCaps {
  perStreamCap: bigint;
  dailyCap: bigint;
  expiry: number;
  dayIndex: number;
  spentToday: bigint;
}

export type CapCheck =
  | { ok: true; spentAfter: bigint }
  | { ok: false; reason: 'NotAuthorized' | 'OperatorExpired' | 'PerStreamCapExceeded' | 'DailyCapExceeded'; index: number };

/** Off-chain replica of StreamVault._authorize() applied to a whole batch, in order. */
export function checkOperatorCaps(op: OperatorCaps, ps: readonly StreamParams[], nowSeconds: number): CapCheck {
  if (op.expiry === 0) return { ok: false, reason: 'NotAuthorized', index: 0 };
  if (nowSeconds >= op.expiry) return { ok: false, reason: 'OperatorExpired', index: 0 };
  const today = Math.floor(nowSeconds / DAY);
  let spent = op.dayIndex === today ? op.spentToday : 0n;
  for (let i = 0; i < ps.length; i++) {
    const amount = ps[i]!.amount;
    if (amount > op.perStreamCap) return { ok: false, reason: 'PerStreamCapExceeded', index: i };
    if (spent + amount > op.dailyCap) return { ok: false, reason: 'DailyCapExceeded', index: i };
    spent += amount;
  }
  return { ok: true, spentAfter: spent };
}

/** Spent so far today, accounting for the UTC-day rollover the contract applies lazily. */
export function spentToday(op: Pick<OperatorCaps, 'dayIndex' | 'spentToday'>, nowSeconds: number): bigint {
  return op.dayIndex === Math.floor(nowSeconds / DAY) ? op.spentToday : 0n;
}
