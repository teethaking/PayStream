import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

/** Animated empty state: a gently flowing stream line, pure SVG. */
export function EmptyState({ title, body, action }: { title: string; body?: ReactNode; action?: ReactNode }) {
  const reduced = useReducedMotion();
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <svg width="160" height="72" viewBox="0 0 160 72" aria-hidden className="mb-4">
        <defs>
          <linearGradient id="es-g" x1="0" x2="1">
            <stop offset="0" stopColor="#7C5CFF" />
            <stop offset="1" stopColor="#22D3EE" />
          </linearGradient>
        </defs>
        <path
          d="M10 46 C 50 46, 50 22, 80 22 S 110 46, 150 46"
          fill="none"
          stroke="var(--ps-border-strong)"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <motion.path
          d="M10 46 C 50 46, 50 22, 80 22 S 110 46, 150 46"
          fill="none"
          stroke="url(#es-g)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="24 200"
          animate={reduced ? undefined : { strokeDashoffset: [224, 0] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'linear' }}
        />
        <circle cx="10" cy="46" r="6" fill="#7C5CFF" />
        <circle cx="150" cy="46" r="6" fill="#22D3EE" />
      </svg>
      <p className="font-display text-base font-semibold">{title}</p>
      {body && <p className="mt-1 max-w-sm text-sm text-muted">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
