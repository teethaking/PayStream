import { useEffect, useRef } from 'react';
import { animate, useInView, useReducedMotion } from 'framer-motion';

/** Counts up to `value` when scrolled into view. `format` turns the tweened float into display text. */
export function CountUp({ value, format = (n) => Math.round(n).toLocaleString('en-US'), className }: { value: number; format?: (n: number) => string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduced = useReducedMotion();
  const from = useRef(0);
  useEffect(() => {
    if (!ref.current) return;
    if (!inView || reduced) {
      ref.current.textContent = format(value);
      return;
    }
    const c = animate(from.current, value, {
      duration: 1.2,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        if (ref.current) ref.current.textContent = format(v);
      },
    });
    from.current = value;
    return () => c.stop();
  }, [value, inView, reduced, format]);
  return <span ref={ref} className={className + ' font-mono tabular'}>{format(0)}</span>;
}
