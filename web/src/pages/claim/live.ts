import { vestedAtPrecise, withdrawableAt } from '@paystream/sdk';
import type { StreamView } from '@/lib/derive';

/** Display-only claimable amount in base units (float), interpolated between seconds. */
export const claimableLive = (s: StreamView, now: number, correction = 0) =>
  Math.max(0, vestedAtPrecise(s, now) - Number(s.withdrawn) + correction);

/** Exact claimable amount at a whole chain second, in base units. Decides what can actually be withdrawn. */
export const claimableExact = (s: StreamView, nowSeconds: number) => {
  const w = withdrawableAt(s, Math.floor(nowSeconds));
  return w > 0n ? w : 0n;
};

/** Fractions for StreamProgress, relative to the original stream size so a canceled stream shows where it stopped. */
export function progressOf(s: StreamView, now: number) {
  const base = Number(s.originalTotal) || 1;
  const span = Math.max(1, s.end - s.start);
  return {
    vested: vestedAtPrecise(s, now) / base,
    withdrawn: Number(s.withdrawn) / base,
    cliff: s.cliff > s.start ? (s.cliff - s.start) / span : 0,
    time: Math.min(1, Math.max(0, (now - s.start) / span)),
  };
}

export const parseStreamId = (raw?: string) => (raw && /^\d{1,30}$/.test(raw.trim()) ? BigInt(raw.trim()) : undefined);
