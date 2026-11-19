import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';

export function Toggle({ checked, onChange, label, id }: { checked: boolean; onChange: (v: boolean) => void; label: string; id?: string }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn('relative h-6 w-11 shrink-0 rounded-full p-0.5 transition-colors', checked ? 'bg-accent' : 'bg-surface-2 ring-1 ring-inset ring-line-strong')}
    >
      <motion.span layout transition={{ type: 'spring', stiffness: 600, damping: 32 }} className={cn('block size-5 rounded-full bg-white shadow', checked && 'ml-auto')} />
    </button>
  );
}
