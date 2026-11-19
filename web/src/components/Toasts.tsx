import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, ExternalLink, Info, ShieldBan, XCircle } from 'lucide-react';
import { dismissToast, useToasts, type ToastKind } from '@/lib/toast';
import { cn } from '@/lib/cn';

const icons: Record<ToastKind, typeof Info> = { success: CheckCircle2, error: XCircle, info: Info, blocked: ShieldBan };
const tones: Record<ToastKind, string> = { success: 'text-mint', error: 'text-amber', info: 'text-cyan', blocked: 'text-rose' };

export function Toasts() {
  const toasts = useToasts((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-3 sm:top-4 sm:right-4 sm:left-auto sm:items-end" aria-live="assertive">
      <AnimatePresence>
        {toasts.map((t) => {
          const Icon = icons[t.kind];
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: -16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 60 }}
              className="glass-strong pointer-events-auto flex w-full max-w-sm items-start gap-3 bg-surface-solid/90 p-3.5"
              role="status"
            >
              <Icon className={cn('mt-0.5 size-5 shrink-0', tones[t.kind])} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{t.title}</p>
                {t.message && <p className="mt-0.5 text-xs text-muted">{t.message}</p>}
                {t.href && (
                  <a href={t.href} target="_blank" rel="noreferrer" className="mt-1.5 inline-flex items-center gap-1 text-xs text-cyan hover:underline">
                    View on explorer <ExternalLink className="size-3" aria-hidden />
                  </a>
                )}
              </div>
              <button onClick={() => dismissToast(t.id)} className="text-faint hover:text-fg" aria-label="Dismiss notification">
                <XCircle className="size-4" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
