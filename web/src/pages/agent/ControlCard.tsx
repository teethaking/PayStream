import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Ban, Clock, Gauge, Lock, ShieldOff } from 'lucide-react';
import type { Address } from 'viem';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { RadialGauge } from '@/components/ui/RadialGauge';
import { Ticker } from '@/components/ui/Ticker';
import { Address as AddressChip, TxLink } from '@/components/ui/Address';
import { runTx } from '@/lib/tx';
import { streamVaultAbi } from '@/lib/abi';
import { config } from '@/config';
import { fmt, fmtDateTime } from '@/lib/format';
import { cn } from '@/lib/cn';
import { getAgentBurner, ratio, useAgentUi, type OperatorStatus, type useOperatorPair } from './store';

const STATUS: Record<OperatorStatus, { label: string; tone: 'mint' | 'amber' | 'rose' | 'neutral' }> = {
  active: { label: 'Active', tone: 'mint' },
  expired: { label: 'Expired', tone: 'amber' },
  revoked: { label: 'Revoked', tone: 'rose' },
  none: { label: 'Not granted', tone: 'neutral' },
};

const pad = (n: number) => String(n).padStart(2, '0');
function clock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const d = Math.floor(s / 86_400);
  const hms = pad(Math.floor((s % 86_400) / 3600)) + ':' + pad(Math.floor((s % 3600) / 60)) + ':' + pad(s % 60);
  return d > 0 ? d + 'd ' + hms : hms;
}

type Pair = ReturnType<typeof useOperatorPair>;

export function ControlCard({ agent, pair }: { agent?: Address; pair: Pair }) {
  const { status, caps, spent, now, grantedAt } = pair;
  const reduced = useReducedMotion();
  const qc = useQueryClient();
  const { shakeKey, draftMax } = useAgentUi();
  const [busy, setBusy] = useState(false);
  const prev = useRef(status);
  const [justRevoked, setJustRevoked] = useState(0);

  useEffect(() => {
    if (prev.current === 'active' && status === 'revoked') setJustRevoked((n) => n + 1);
    prev.current = status;
  }, [status]);

  const live = status === 'active';
  const dailyFrac = caps ? ratio(spent, caps.dailyCap) : 0;
  const perFrac = caps && draftMax !== undefined ? ratio(draftMax, caps.perStreamCap) : 0;
  const remaining = caps ? caps.expiry - now : 0;
  const lifeFrac =
    caps && grantedAt && caps.expiry > grantedAt
      ? Math.max(0, Math.min(1, remaining / (caps.expiry - grantedAt)))
      : live
        ? 1
        : 0;
  const isBurner = agent && agent.toLowerCase() === getAgentBurner().address.toLowerCase();

  const revoke = async () => {
    if (!agent) return;
    setBusy(true);
    await runTx({
      title: 'Revoke agent access',
      celebrate: false,
      successMessage: 'The agent key can no longer create streams.',
      call: () => ({ address: config.vault!, abi: streamVaultAbi, functionName: 'revokeOperator', args: [agent] }),
      onSuccess: () => void qc.invalidateQueries({ queryKey: ['operator'] }),
    });
    setBusy(false);
  };

  return (
    <Card glow={status === 'revoked' ? 'rose' : 'violet'} className="relative h-full overflow-hidden">
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute -top-24 left-1/2 h-48 w-[70%] -translate-x-1/2 rounded-full blur-3xl transition-colors duration-700',
          live ? 'bg-cyan/12' : 'bg-surface-2',
        )}
      />
      <CardHeader
        icon={<Gauge className="size-5" aria-hidden />}
        title="Live limits"
        subtitle={
          agent ? (
            <span className="inline-flex flex-wrap items-center gap-x-2">
              Agent <AddressChip address={agent} className="text-muted" />
              {isBurner && <span className="text-faint">· browser agent</span>}
            </span>
          ) : (
            'Enter an agent address to inspect its grant.'
          )
        }
        action={
          <motion.span
            key={status}
            initial={reduced ? false : { scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
          >
            <Badge tone={STATUS[status].tone} pulse={live}>
              {STATUS[status].label}
            </Badge>
          </motion.span>
        }
      />
      <p className="sr-only" aria-live="polite">
        Agent status: {STATUS[status].label}
      </p>

      <div
        className={cn(
          'relative grid gap-6 transition-[filter,opacity] duration-700 sm:grid-cols-2',
          !live && 'opacity-60 grayscale-[0.6]',
        )}
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <RadialGauge
            fraction={dailyFrac}
            size={156}
            stroke={12}
            shakeKey={shakeKey}
            label="Daily cap used"
            center={
              <div>
                <p className="font-mono text-2xl font-semibold tabular">{Math.round(dailyFrac * 100)}%</p>
                <p className="mt-0.5 text-[11px] text-muted">used today</p>
              </div>
            }
          />
          <div>
            <p className="text-sm font-medium">Daily cap used</p>
            <p className="font-mono text-xs text-muted tabular">
              {caps ? fmt(spent) + ' / ' + fmt(caps.dailyCap) + ' tUSD8' : '— / —'}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-center gap-3 text-center">
          <RadialGauge
            fraction={perFrac}
            size={156}
            stroke={12}
            shakeKey={shakeKey}
            label="Largest draft stream versus per-stream cap"
            center={
              <div>
                <p className="font-mono text-2xl font-semibold tabular">
                  {draftMax !== undefined && caps ? Math.round(perFrac * 100) + '%' : '—'}
                </p>
                <p className="mt-0.5 text-[11px] text-muted">of cap</p>
              </div>
            }
          />
          <div>
            <p className="text-sm font-medium">Per-stream cap</p>
            <p className="font-mono text-xs text-muted tabular">
              {caps
                ? (draftMax !== undefined ? fmt(draftMax) : 'no draft') + ' / ' + fmt(caps.perStreamCap) + ' tUSD8'
                : '— / —'}
            </p>
          </div>
        </div>
      </div>

      <div className="relative mt-6 rounded-2xl bg-surface p-4 ring-1 ring-inset ring-line">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="label flex items-center gap-1.5">
              <Clock className="size-3.5" aria-hidden /> {status === 'expired' ? 'Expired' : 'Expires in'}
            </p>
            <div className="mt-1.5 text-2xl font-semibold sm:text-3xl">
              {caps && live ? (
                <Ticker text={clock(remaining)} />
              ) : (
                <span className="font-mono text-faint">--:--:--</span>
              )}
            </div>
            <p className="mt-1 text-xs text-faint">
              {caps
                ? fmtDateTime(caps.expiry)
                : status === 'revoked' && pair.revokedAt
                  ? 'Revoked ' + fmtDateTime(pair.revokedAt)
                  : 'No active grant'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {pair.grantedTx && status !== 'none' && <TxLink hash={pair.grantedTx}>grant tx</TxLink>}
            <Button
              variant="danger"
              loading={busy}
              disabled={!config.vault || !agent || status === 'none' || status === 'revoked'}
              onClick={() => void revoke()}
              icon={<Ban className="size-4" aria-hidden />}
            >
              Revoke
            </Button>
          </div>
        </div>
        <div
          className="mt-4 h-1.5 overflow-hidden rounded-full bg-surface-2"
          role="progressbar"
          aria-label="Grant time remaining"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(lifeFrac * 100)}
        >
          <motion.div
            className={cn('h-full rounded-full', lifeFrac < 0.15 ? 'bg-amber' : 'bg-accent')}
            initial={false}
            animate={{ width: lifeFrac * 100 + '%' }}
            transition={{ duration: reduced ? 0 : 0.8, ease: 'linear' }}
          />
        </div>
      </div>

      <ul className="mt-5 grid gap-2 text-xs text-muted sm:grid-cols-3">
        {[
          ['Create streams within caps', true],
          ['Cancel streams', false],
          ['Withdraw treasury', false],
        ].map(([label, allowed]) => (
          <li
            key={String(label)}
            className="flex items-center gap-2 rounded-xl bg-surface px-3 py-2 ring-1 ring-inset ring-line"
          >
            {allowed ? (
              <Gauge className="size-3.5 text-mint" aria-hidden />
            ) : (
              <Lock className="size-3.5 text-rose" aria-hidden />
            )}
            <span>
              <span className="sr-only">{allowed ? 'Allowed: ' : 'Never allowed: '}</span>
              {label}
            </span>
          </li>
        ))}
      </ul>

      <AnimatePresence>
        {status === 'revoked' && (
          <motion.div
            key={justRevoked}
            className="pointer-events-none absolute inset-0 grid place-items-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            aria-hidden
          >
            {justRevoked > 0 && !reduced && (
              <motion.div
                className="absolute size-40 rounded-full bg-rose/30"
                initial={{ scale: 0.2, opacity: 0.9 }}
                animate={{ scale: 6, opacity: 0 }}
                transition={{ duration: 1.1, ease: 'easeOut' }}
              />
            )}
            <motion.div
              className="flex items-center gap-2 rounded-2xl border-2 border-rose/70 bg-bg/70 px-5 py-2.5 font-display text-xl font-bold tracking-[0.2em] text-rose uppercase shadow-[0_0_60px_-10px_var(--ps-rose)] backdrop-blur-md sm:text-2xl"
              initial={
                justRevoked > 0 && !reduced
                  ? { scale: 2.2, rotate: -14, opacity: 0 }
                  : { scale: 1, rotate: -6, opacity: 0 }
              }
              animate={{ scale: 1, rotate: -6, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 14, delay: justRevoked > 0 ? 0.15 : 0 }}
            >
              <ShieldOff className="size-6" /> Access revoked
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
