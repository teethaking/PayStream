import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import type { StreamStatus } from '@paystream/sdk';
import { cn } from '@/lib/cn';

type Tone = 'violet' | 'cyan' | 'mint' | 'amber' | 'rose' | 'neutral';
const tones: Record<Tone, string> = {
  violet: 'bg-violet/12 text-violet ring-violet/25',
  cyan: 'bg-cyan/12 text-cyan ring-cyan/25',
  mint: 'bg-mint/12 text-mint ring-mint/25',
  amber: 'bg-amber/12 text-amber ring-amber/25',
  rose: 'bg-rose/12 text-rose ring-rose/25',
  neutral: 'bg-surface-2 text-muted ring-line',
};

export function Badge({ tone = 'neutral', children, pulse, className }: { tone?: Tone; children: ReactNode; pulse?: boolean; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset', tones[tone], className)}>
      {pulse && (
        <span className="relative flex size-1.5">
          <span className="absolute inline-flex size-full animate-pulse-ring rounded-full bg-current" />
          <span className="relative inline-flex size-1.5 rounded-full bg-current" />
        </span>
      )}
      {children}
    </span>
  );
}

const statusMeta: Record<StreamStatus, { tone: Tone; label: string; pulse?: boolean }> = {
  'pending-cliff': { tone: 'amber', label: 'Pending cliff' },
  vesting: { tone: 'cyan', label: 'Vesting', pulse: true },
  completed: { tone: 'mint', label: 'Completed' },
  canceled: { tone: 'rose', label: 'Canceled' },
};

export function StatusChip({ status }: { status: StreamStatus }) {
  const m = statusMeta[status];
  return (
    <motion.span key={status} initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 22 }}>
      <Badge tone={m.tone} pulse={m.pulse}>
        {m.label}
      </Badge>
    </motion.span>
  );
}
