/** Off-chain mirror of StreamVault._vested(). Same integer math, so the UI agrees with the chain to the unit. */

export interface StreamSchedule {
  total: bigint;
  withdrawn: bigint;
  start: number | bigint;
  cliff: number | bigint;
  end: number | bigint;
  canceled: boolean;
}

export type StreamStatus = 'pending-cliff' | 'vesting' | 'completed' | 'canceled';

export function vestedAt(s: StreamSchedule, now: number | bigint): bigint {
  const t = BigInt(now);
  const start = BigInt(s.start);
  const cliff = BigInt(s.cliff);
  const end = BigInt(s.end);
  if (s.canceled) return s.total;
  if (t < cliff) return 0n;
  if (t >= end) return s.total;
  return (s.total * (t - start)) / (end - start);
}

export const withdrawableAt = (s: StreamSchedule, now: number | bigint) => vestedAt(s, now) - s.withdrawn;

/**
 * Fractional vested amount for smooth animation between seconds. Returns base units as a float
 * (display only, never used for value transfer) clamped by the same cliff/end rules.
 */
export function vestedAtPrecise(s: StreamSchedule, nowSeconds: number): number {
  const start = Number(s.start);
  const cliff = Number(s.cliff);
  const end = Number(s.end);
  const total = Number(s.total);
  if (s.canceled) return total;
  if (nowSeconds < cliff) return 0;
  if (nowSeconds >= end) return total;
  return (total * (nowSeconds - start)) / (end - start);
}

export function streamStatus(s: StreamSchedule, now: number | bigint): StreamStatus {
  const t = BigInt(now);
  if (s.canceled) return 'canceled';
  if (t < BigInt(s.cliff)) return 'pending-cliff';
  if (t >= BigInt(s.end)) return 'completed';
  return 'vesting';
}

/** What cancel(id) would do right now: vested part stays claimable, the rest goes back to the employer. */
export function cancelSplit(s: StreamSchedule, now: number | bigint) {
  const vested = vestedAt({ ...s, canceled: false }, now);
  return { toRecipient: vested - s.withdrawn, refunded: s.total - vested, alreadyPaid: s.withdrawn };
}

/** Sample the vesting curve for charts: [{t, vested}] with `points` samples including cliff jump. */
export function vestingCurve(s: Omit<StreamSchedule, 'withdrawn' | 'canceled'>, points = 48) {
  const start = Number(s.start);
  const end = Number(s.end);
  const cliff = Number(s.cliff);
  const out: { t: number; vested: bigint }[] = [];
  const sched = { ...s, withdrawn: 0n, canceled: false };
  for (let i = 0; i <= points; i++) {
    const t = Math.round(start + ((end - start) * i) / points);
    out.push({ t, vested: vestedAt(sched, t) });
  }
  if (cliff > start && cliff < end) {
    out.push({ t: cliff - 1, vested: 0n }, { t: cliff, vested: vestedAt(sched, cliff) });
    out.sort((a, b) => a.t - b.t);
  }
  return out;
}
