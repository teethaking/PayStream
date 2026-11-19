import { useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/cn';

/**
 * Real-time stream progress: fill, glowing head, cliff marker and shimmer.
 * `vestedFraction` and `elapsedFraction` are 0..1; cliffFraction marks where vesting unlocks.
 */
export function StreamProgress({
  vestedFraction,
  withdrawnFraction = 0,
  cliffFraction = 0,
  canceled,
  className,
  height = 10,
  label,
}: {
  vestedFraction: number;
  withdrawnFraction?: number;
  cliffFraction?: number;
  canceled?: boolean;
  className?: string;
  height?: number;
  label?: string;
}) {
  const reduced = useReducedMotion();
  const v = Math.min(1, Math.max(0, vestedFraction));
  const wd = Math.min(v, Math.max(0, withdrawnFraction));
  const live = v > 0 && v < 1 && !canceled;
  return (
    <div
      className={cn('relative w-full', className)}
      role="progressbar"
      aria-label={label ?? 'Vesting progress'}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
    >
      <div className="relative overflow-hidden rounded-full bg-surface-2 ring-1 ring-inset ring-line" style={{ height }}>
        <div
          className={cn('absolute inset-y-0 left-0 rounded-full', canceled ? 'bg-rose/50' : 'bg-accent')}
          style={{ width: `${v * 100}%` }}
        >
          {live && !reduced && (
            <div className="absolute inset-0 overflow-hidden rounded-full">
              <div className="absolute inset-y-0 w-1/3 animate-shimmer bg-gradient-to-r from-transparent via-white/35 to-transparent" />
            </div>
          )}
        </div>
        {wd > 0 && <div className="absolute inset-y-0 left-0 rounded-full bg-mint/70" style={{ width: `${wd * 100}%` }} title="Withdrawn" />}
      </div>
      {live && (
        <div
          aria-hidden
          className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_12px_4px_rgb(34_211_238/0.75)]"
          style={{ left: `${v * 100}%` }}
        />
      )}
      {cliffFraction > 0 && cliffFraction < 1 && (
        <div aria-hidden className="absolute -top-1 -bottom-1 w-0.5 rounded bg-amber" style={{ left: `${cliffFraction * 100}%` }} title="Cliff" />
      )}
    </div>
  );
}
