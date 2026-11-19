import { motion } from 'framer-motion';

/** Spinner ring that morphs into a check (done) or a cross (error). */
export function MorphCheck({ state, size = 28 }: { state: 'idle' | 'active' | 'done' | 'error'; size?: number }) {
  const color = state === 'done' ? 'var(--ps-mint)' : state === 'error' ? 'var(--ps-rose)' : state === 'active' ? 'var(--ps-cyan)' : 'var(--ps-border-strong)';
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden>
      <motion.circle
        cx="14"
        cy="14"
        r="12"
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        initial={false}
        animate={state === 'active' ? { pathLength: 0.3, rotate: 360 } : { pathLength: 1, rotate: 0 }}
        transition={state === 'active' ? { rotate: { repeat: Infinity, duration: 0.9, ease: 'linear' }, pathLength: { duration: 0.3 } } : { duration: 0.35 }}
        style={{ originX: '50%', originY: '50%' }}
      />
      {state === 'done' && (
        <motion.path d="M8.5 14.5l3.8 3.8 7.4-8" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.35, delay: 0.1 }} />
      )}
      {state === 'error' && (
        <motion.path d="M10 10l8 8M18 10l-8 8" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.3 }} />
      )}
    </svg>
  );
}
