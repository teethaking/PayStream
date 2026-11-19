import type { Address, Hex } from 'viem';
import { DAY, streamStatus, type StreamStatus } from '@paystream/sdk';
import type { VaultEvent } from './events';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Args = Record<string, any>;

export interface StreamView {
  id: bigint;
  sender: Address;
  recipient: Address;
  createdBy: Address;
  /** Current total (shrinks to the vested amount when canceled). */
  total: bigint;
  originalTotal: bigint;
  withdrawn: bigint;
  refunded: bigint;
  start: number;
  cliff: number;
  end: number;
  cancelable: boolean;
  canceled: boolean;
  createdAt: number;
  createdTx: Hex;
  canceledAt?: number;
}

const eq = (a?: string, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
export const sameAddress = eq;

/** Rebuilds every stream from events alone: StreamCreated, Withdrawn and StreamCanceled carry all state changes. */
export function deriveStreams(events: VaultEvent[]): StreamView[] {
  const map = new Map<string, StreamView>();
  for (const e of events) {
    const a = e.args as Args;
    if (e.name === 'StreamCreated') {
      map.set(String(a.id), {
        id: a.id,
        sender: a.sender,
        recipient: a.recipient,
        createdBy: a.createdBy,
        total: a.amount,
        originalTotal: a.amount,
        withdrawn: 0n,
        refunded: 0n,
        start: Number(a.start),
        cliff: Number(a.cliff),
        end: Number(a.end),
        cancelable: a.cancelable,
        canceled: false,
        createdAt: e.timestamp,
        createdTx: e.txHash,
      });
    } else if (e.name === 'Withdrawn') {
      const s = map.get(String(a.id));
      if (s) s.withdrawn += a.amount as bigint;
    } else if (e.name === 'StreamCanceled') {
      const s = map.get(String(a.id));
      if (s) {
        s.canceled = true;
        s.refunded = a.refunded;
        s.total = s.originalTotal - (a.refunded as bigint);
        s.canceledAt = e.timestamp;
      }
    }
  }
  return [...map.values()].sort((x, y) => Number(y.id - x.id));
}

export const statusOf = (s: StreamView, now: number): StreamStatus => streamStatus(s, Math.floor(now));

export interface OperatorView {
  employer: Address;
  operator: Address;
  perStreamCap: bigint;
  dailyCap: bigint;
  expiry: number;
  grantedAt: number;
  grantedTx: Hex;
  revoked: boolean;
  revokedAt?: number;
  /** Amount created by this operator for this employer in the current UTC day since the latest grant. */
  spentToday: bigint;
  created: number;
}

export function deriveOperators(events: VaultEvent[], nowSeconds: number): OperatorView[] {
  const map = new Map<string, OperatorView>();
  const today = Math.floor(nowSeconds / DAY);
  for (const e of events) {
    const a = e.args as Args;
    if (e.name === 'OperatorSet') {
      map.set(`${String(a.sender).toLowerCase()}:${String(a.operator).toLowerCase()}`, {
        employer: a.sender,
        operator: a.operator,
        perStreamCap: a.perStreamCap,
        dailyCap: a.dailyCap,
        expiry: Number(a.expiry),
        grantedAt: e.timestamp,
        grantedTx: e.txHash,
        revoked: false,
        spentToday: 0n,
        created: 0,
      });
    } else if (e.name === 'OperatorRevoked') {
      const o = map.get(`${String(a.sender).toLowerCase()}:${String(a.operator).toLowerCase()}`);
      if (o) {
        o.revoked = true;
        o.revokedAt = e.timestamp;
      }
    } else if (e.name === 'StreamCreated' && !eq(a.createdBy, a.sender)) {
      const o = map.get(`${String(a.sender).toLowerCase()}:${String(a.createdBy).toLowerCase()}`);
      if (o) {
        o.created++;
        if (Math.floor(e.timestamp / DAY) === today) o.spentToday += a.amount as bigint;
      }
    }
  }
  return [...map.values()];
}

export const isOperatorActive = (o: OperatorView, now: number) => !o.revoked && now < o.expiry;

export function deriveTreasury(events: VaultEvent[], employer?: Address): bigint {
  if (!employer) return 0n;
  let t = 0n;
  for (const e of events) {
    const a = e.args as Args;
    if (!eq(a.sender, employer)) continue;
    if (e.name === 'TreasuryDeposited') t += a.amount as bigint;
    else if (e.name === 'TreasuryWithdrawn') t -= a.amount as bigint;
    else if (e.name === 'StreamCreated') t -= a.amount as bigint;
  }
  return t;
}

export interface Stats {
  streams: number;
  streamed: bigint;
  withdrawn: bigint;
  activeOperators: number;
  employers: number;
  recipients: number;
}

export function deriveStats(events: VaultEvent[], now: number): Stats {
  const streams = deriveStreams(events);
  const ops = deriveOperators(events, now);
  return {
    streams: streams.length,
    streamed: streams.reduce((s, x) => s + x.originalTotal, 0n),
    withdrawn: streams.reduce((s, x) => s + x.withdrawn, 0n),
    activeOperators: ops.filter((o) => isOperatorActive(o, now)).length,
    employers: new Set(streams.map((s) => s.sender.toLowerCase())).size,
    recipients: new Set(streams.map((s) => s.recipient.toLowerCase())).size,
  };
}

/** Cumulative payroll outflow (stream creations) over time for the area chart. */
export function outflowSeries(events: VaultEvent[], employer?: Address) {
  let cum = 0n;
  return events
    .filter((e) => e.name === 'StreamCreated' && (!employer || eq((e.args as { sender: string }).sender, employer)))
    .map((e) => {
      cum += (e.args as { amount: bigint }).amount;
      return { t: e.timestamp, value: cum };
    });
}
