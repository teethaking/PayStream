import { AnimatePresence, motion } from 'framer-motion';
import { Clock, Fuel, RefreshCw, ShieldAlert, X } from 'lucide-react';
import { config } from '@/config';
import { closeTxPanel, useTx, type StepId, type TxJob } from '@/lib/tx';
import { MorphCheck } from './ui/MorphCheck';
import { TxLink } from './ui/Address';
import { cn } from '@/lib/cn';

const ORDER: StepId[] = ['sign', 'submit', 'confirm', 'done'];
const LABELS: Record<StepId, string> = { sign: 'Sign', submit: 'Submit', confirm: 'Confirm', done: 'Done' };

function Job({ job }: { job: TxJob }) {
  const blocked = job.error?.blockedByContract;
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 40 }}
      className={cn('rounded-xl p-4 ring-1 ring-inset', blocked ? 'bg-rose/8 ring-rose/30' : 'bg-surface ring-line')}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="truncate text-sm font-semibold">{job.title}</p>
        {job.feeEstimate && (
          <span className="inline-flex shrink-0 items-center gap-1 font-mono text-[11px] text-faint">
            <Fuel className="size-3" aria-hidden /> {job.feeEstimate}
          </span>
        )}
      </div>
      <ol className="mt-3 grid grid-cols-4 gap-1" aria-label="Transaction progress">
        {ORDER.map((k, i) => (
          <li key={k} className="flex flex-col items-center gap-1.5 text-center">
            <div className="flex w-full items-center">
              <div
                className={cn(
                  'h-px flex-1',
                  i === 0 ? 'opacity-0' : job.steps[k] !== 'idle' ? 'bg-accent' : 'bg-line-strong',
                )}
              />
              <MorphCheck state={job.steps[k]} size={24} />
              <div
                className={cn(
                  'h-px flex-1',
                  i === 3 ? 'opacity-0' : job.steps[ORDER[i + 1]!] !== 'idle' ? 'bg-accent' : 'bg-line-strong',
                )}
              />
            </div>
            <span className={cn('text-[11px]', job.steps[k] === 'active' ? 'text-fg' : 'text-faint')}>
              {k === 'sign' ? job.signLabel : LABELS[k]}
            </span>
          </li>
        ))}
      </ol>
      {job.slow && job.status === 'running' && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-amber">
          <Clock className="size-3.5" aria-hidden /> Slower than usual. Still polling for the receipt…
        </p>
      )}
      {job.replaced && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-cyan">
          <RefreshCw className="size-3.5" aria-hidden /> Your wallet replaced this transaction; following the new one.
        </p>
      )}
      {job.error && (
        <div
          className={cn(
            'mt-3 flex gap-2 rounded-lg p-3 text-xs',
            blocked ? 'bg-rose/10 text-rose' : 'bg-amber/10 text-amber',
          )}
        >
          <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div>
            <p className="font-semibold">
              {blocked ? `Blocked by contract: ${job.error.title.toLowerCase()}` : job.error.title}
            </p>
            <p className="mt-0.5 opacity-90">{job.error.message}</p>
            {job.error.code === 'InsufficientGas' && (
              <a href={config.faucetUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block underline">
                Open the faucet
              </a>
            )}
          </div>
        </div>
      )}
      {job.hash && (
        <div className="mt-3 flex items-center gap-2">
          <TxLink hash={job.hash}>{job.revertedOnChain ? 'Reverted tx' : 'View on explorer'}</TxLink>
        </div>
      )}
    </motion.li>
  );
}

/** Floating stepper for every on-chain action. aria-live announces progress. */
export function TxPanel() {
  const { jobs, open } = useTx();
  const latest = jobs.at(-1);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center p-3 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-[380px] sm:p-0">
      <div aria-live="polite" className="sr-only">
        {latest &&
          `${latest.title}: ${latest.status === 'running' ? (Object.entries(latest.steps).find(([, v]) => v === 'active')?.[0] ?? '') : latest.status === 'success' ? 'confirmed' : (latest.error?.title ?? 'failed')}`}
      </div>
      <AnimatePresence>
        {open && jobs.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 30, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30 }}
            className="glass-strong pointer-events-auto w-full max-w-md bg-surface-solid/90 p-3"
            aria-label="Transactions"
          >
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-xs font-medium tracking-wide text-muted uppercase">Transactions</span>
              <button
                onClick={closeTxPanel}
                className="rounded p-1 text-muted hover:text-fg"
                aria-label="Close transactions panel"
              >
                <X className="size-4" />
              </button>
            </div>
            <ul className="space-y-2">
              <AnimatePresence initial={false}>
                {jobs.slice(-3).map((j) => (
                  <Job key={j.id} job={j} />
                ))}
              </AnimatePresence>
            </ul>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}
