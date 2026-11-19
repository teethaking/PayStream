import { forwardRef, useRef, useState, type ButtonHTMLAttributes, type MouseEvent, type ReactNode } from 'react';
import { motion, useMotionValue, useReducedMotion, useSpring } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationStart'
> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  magnetic?: boolean;
  icon?: ReactNode;
}

const variants: Record<Variant, string> = {
  primary:
    'bg-accent text-white shadow-[0_8px_30px_-8px_rgb(124_92_255/0.7)] hover:shadow-[0_10px_40px_-6px_rgb(34_211_238/0.6)]',
  secondary: 'glass text-fg hover:bg-surface-2',
  ghost: 'text-muted hover:text-fg hover:bg-surface-2',
  danger: 'bg-rose/15 text-rose ring-1 ring-rose/30 hover:bg-rose/25',
  success: 'bg-mint/15 text-mint ring-1 ring-mint/30 hover:bg-mint/25',
};
const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-6 text-base gap-2 rounded-2xl',
};

/** Magnetic, rippling button. Falls back to a plain button under prefers-reduced-motion. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading,
    magnetic = false,
    icon,
    className,
    children,
    onClick,
    disabled,
    ...rest
  },
  ref,
) {
  const reduced = useReducedMotion();
  const x = useSpring(useMotionValue(0), { stiffness: 250, damping: 15 });
  const y = useSpring(useMotionValue(0), { stiffness: 250, damping: 15 });
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);
  const seq = useRef(0);

  const onMove = (e: MouseEvent<HTMLButtonElement>) => {
    if (!magnetic || reduced) return;
    const r = e.currentTarget.getBoundingClientRect();
    x.set((e.clientX - r.left - r.width / 2) * 0.25);
    y.set((e.clientY - r.top - r.height / 2) * 0.35);
  };
  const reset = () => {
    x.set(0);
    y.set(0);
  };
  const click = (e: MouseEvent<HTMLButtonElement>) => {
    if (!reduced) {
      const r = e.currentTarget.getBoundingClientRect();
      const id = ++seq.current;
      setRipples((rs) => [...rs, { id, x: e.clientX - r.left, y: e.clientY - r.top }]);
      setTimeout(() => setRipples((rs) => rs.filter((p) => p.id !== id)), 650);
    }
    onClick?.(e);
  };

  return (
    <motion.button
      ref={ref}
      style={{ x, y }}
      whileTap={reduced ? undefined : { scale: 0.97 }}
      onMouseMove={onMove}
      onMouseLeave={reset}
      onClick={click}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'relative inline-flex select-none items-center justify-center overflow-hidden font-medium whitespace-nowrap transition-[background,box-shadow,color,opacity] duration-200 disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {ripples.map((r) => (
        <motion.span
          key={r.id}
          aria-hidden
          className="pointer-events-none absolute rounded-full bg-white/30"
          style={{ left: r.x, top: r.y, width: 8, height: 8, marginLeft: -4, marginTop: -4 }}
          initial={{ scale: 0, opacity: 0.6 }}
          animate={{ scale: 40, opacity: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      ))}
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </motion.button>
  );
});
