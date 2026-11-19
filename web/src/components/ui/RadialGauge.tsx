import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Animated radial ring. Turns amber above 80% and rose at 100%. Changing `shakeKey` shakes it (blocked attempt).
 */
export function RadialGauge({
  fraction,
  size = 132,
  stroke = 10,
  label,
  center,
  shakeKey,
}: {
  fraction: number;
  size?: number;
  stroke?: number;
  label: string;
  center?: ReactNode;
  shakeKey?: number;
}) {
  const reduced = useReducedMotion();
  const f = Math.min(1, Math.max(0, fraction));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color = f >= 1 ? 'var(--ps-rose)' : f >= 0.8 ? 'var(--ps-amber)' : 'url(#ps-gauge-grad)';
  return (
    <motion.div
      key={shakeKey}
      className={cn('relative inline-grid place-items-center')}
      animate={shakeKey && !reduced ? { x: [0, -8, 8, -6, 6, -3, 0] } : undefined}
      transition={{ duration: 0.5 }}
      style={{ width: size, height: size }}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(f * 100)}
    >
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id="ps-gauge-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#7C5CFF" />
            <stop offset="1" stopColor="#22D3EE" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--ps-border-strong)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - f) }}
          transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 60, damping: 16 }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{center}</div>
    </motion.div>
  );
}
