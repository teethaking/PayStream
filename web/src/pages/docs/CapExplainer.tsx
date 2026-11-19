import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, X } from 'lucide-react';
import { checkOperatorCaps, parseAmount, VAULT_ERROR_MESSAGES, type StreamParams } from '@paystream/sdk';
import { cn } from '@/lib/cn';
import { fmt } from '@/lib/format';

const PER_STREAM = parseAmount('1000');
const DAILY = parseAmount('2500');
const NOW = 1_800_000_000;
const DUMMY = '0x000000000000000000000000000000000000dEaD';

const PRESETS = [
  { id: 'fits', label: 'Fits', rows: ['800', '900', '700'] },
  { id: 'big', label: 'One row too big', rows: ['800', '1200', '300'] },
  { id: 'day', label: 'Day runs out', rows: ['900', '900', '900'] },
] as const;

/** Worked example of how a batch is checked row by row against the caps, using the SDK's mirror of the contract logic. */
export function CapExplainer() {
  const [preset, setPreset] = useState<(typeof PRESETS)[number]['id']>('day');
  const rows = useMemo(() => PRESETS.find((p) => p.id === preset)!.rows.map((r) => parseAmount(r)), [preset]);
  const result = useMemo(() => {
    const ps: StreamParams[] = rows.map((amount) => ({
      recipient: DUMMY,
      amount,
      start: NOW,
      cliff: NOW,
      end: NOW + 86_400 * 30,
      cancelable: true,
    }));
    return checkOperatorCaps(
      { perStreamCap: PER_STREAM, dailyCap: DAILY, expiry: NOW + 86_400, dayIndex: 0, spentToday: 0n },
      ps,
      NOW,
    );
  }, [rows]);

  let running = 0n;
  const failAt = result.ok ? -1 : result.index;

  return (
    <div className="glass p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted">
          Agent caps: <span className="font-mono text-fg tabular">{fmt(PER_STREAM)}</span> per stream,{' '}
          <span className="font-mono text-fg tabular">{fmt(DAILY)}</span> per day. Nothing spent yet today.
        </p>
        <div role="group" aria-label="Example batch" className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <label
              key={p.id}
              className={cn(
                'cursor-pointer rounded-full px-3 py-1.5 text-xs ring-1 transition has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-cyan',
                preset === p.id ? 'bg-violet/15 text-fg ring-violet/40' : 'text-muted ring-line hover:text-fg',
              )}
            >
              <input
                type="radio"
                name="cap-preset"
                className="sr-only"
                checked={preset === p.id}
                onChange={() => setPreset(p.id)}
              />
              {p.label}
            </label>
          ))}
        </div>
      </div>

      <ol className="mt-5 space-y-3" aria-label="Batch rows">
        {rows.map((amount, i) => {
          const skipped = failAt >= 0 && i > failAt;
          const failed = i === failAt;
          if (!skipped && !failed) running += amount;
          const after = failed ? running + amount : running;
          const pct = Number((after * 1000n) / DAILY) / 10;
          return (
            <motion.li
              key={`${preset}-${i}`}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: skipped ? 0.45 : 1, x: 0 }}
              transition={{ delay: i * 0.12 }}
              className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5 sm:grid-cols-[auto_7rem_1fr_11rem]"
            >
              <span className="font-mono text-xs text-faint">#{i + 1}</span>
              <span className={cn('font-mono text-sm tabular', amount > PER_STREAM ? 'text-rose' : 'text-fg')}>
                {fmt(amount)}
              </span>
              <div
                className="col-span-2 h-2 overflow-hidden rounded-full bg-surface-2 ring-1 ring-line sm:col-span-1"
                aria-hidden
              >
                <motion.div
                  className={cn('h-full rounded-full', failed ? 'bg-rose' : 'bg-accent')}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, skipped ? 0 : pct)}%` }}
                  transition={{ delay: i * 0.12, duration: 0.5 }}
                />
              </div>
              <span
                className={cn(
                  'col-span-2 flex items-center gap-1.5 text-xs sm:col-span-1',
                  failed ? 'text-rose' : skipped ? 'text-faint' : 'text-mint',
                )}
              >
                {failed ? (
                  <>
                    <X className="size-3.5" aria-hidden />
                    <code className="font-mono">{result.ok ? '' : result.reason}</code>
                  </>
                ) : skipped ? (
                  'not reached'
                ) : (
                  <>
                    <Check className="size-3.5" aria-hidden />
                    <span className="font-mono tabular">{fmt(after)}</span>&nbsp;spent today
                  </>
                )}
              </span>
            </motion.li>
          );
        })}
      </ol>
      <p className="mt-5 text-sm" aria-live="polite">
        {result.ok ? (
          <span className="text-mint">
            The whole batch goes through. The agent has {fmt(DAILY - result.spentAfter)} left for today.
          </span>
        ) : (
          <span className="text-rose">
            Row {result.index + 1} reverts with <code className="font-mono">{result.reason}</code> (
            {VAULT_ERROR_MESSAGES[result.reason].title}). The transaction is atomic, so no stream in the batch is
            created and nothing is spent.
          </span>
        )}
      </p>
    </div>
  );
}
