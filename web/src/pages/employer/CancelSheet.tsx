import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { cancelSplit, vestedAtPrecise } from '@paystream/sdk';
import { Ban, Lock, Undo2, UserRound } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { Address } from '@/components/ui/Address';
import { useChainNow } from '@/hooks/useChainNow';
import type { StreamView } from '@/lib/derive';
import { fmt, fmtLive, shortAddr } from '@/lib/format';
import { cancelStream } from './actions';

export function CancelSheet({ stream, open, onClose }: { stream?: StreamView; open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title={stream ? `Cancel stream #${stream.id.toString()}` : 'Cancel stream'}>
      {stream &&
        (stream.cancelable ? (
          <CancelBody stream={stream} onClose={onClose} />
        ) : (
          <LockedBody stream={stream} onClose={onClose} />
        ))}
    </Sheet>
  );
}

function LockedBody({ stream, onClose }: { stream: StreamView; onClose: () => void }) {
  const reduced = useReducedMotion();
  return (
    <div className="text-center">
      <motion.div
        className="mx-auto grid size-16 place-items-center rounded-2xl bg-amber/12 text-amber ring-1 ring-amber/25"
        initial={reduced ? { opacity: 0 } : { scale: 0.6, rotate: -12, opacity: 0 }}
        animate={reduced ? { opacity: 1 } : { scale: 1, rotate: [0, -10, 8, -4, 0], opacity: 1 }}
        transition={{ duration: 0.6 }}
      >
        <Lock className="size-7" aria-hidden />
      </motion.div>
      <p className="mt-4 font-display text-lg font-semibold">This stream is locked</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
        Stream #{stream.id.toString()} was created as non-cancelable, so the contract guarantees the full{' '}
        {fmt(stream.originalTotal)} tUSD8 to <span className="font-mono">{shortAddr(stream.recipient)}</span>. Nobody
        can stop it, including you.
      </p>
      <Button variant="secondary" className="mt-6 w-full" onClick={onClose}>
        Got it
      </Button>
    </div>
  );
}

function CancelBody({ stream, onClose }: { stream: StreamView; onClose: () => void }) {
  const reduced = useReducedMotion();
  const live = useChainNow();
  const [frozenAt, setFrozenAt] = useState<number>();
  const [busy, setBusy] = useState(false);
  const t = frozenAt ?? live;

  const total = Number(stream.total) || 1;
  const vested = vestedAtPrecise({ ...stream, canceled: false }, t);
  const withdrawn = Number(stream.withdrawn);
  const toRecipient = Math.max(0, vested - withdrawn);
  const refund = Math.max(0, total - vested);
  const exact = cancelSplit(stream, Math.floor(t));

  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const w = (v: number) => (entered || reduced ? `${(v / total) * 100}%` : '0%');

  const confirm = async () => {
    setFrozenAt(live);
    setBusy(true);
    const res = await cancelStream(stream.id);
    setBusy(false);
    if (res.ok) onClose();
    else setFrozenAt(undefined);
  };

  return (
    <div>
      <p className="text-sm text-muted">
        Stop paying <Address address={stream.recipient} className="text-fg" />. Everything vested so far stays theirs;
        the unvested rest comes back to you.
      </p>

      <div className="mt-6" aria-hidden>
        <div className="flex h-4 overflow-hidden rounded-full bg-surface-2 ring-1 ring-inset ring-line">
          <div
            className="h-full bg-mint/60 transition-[width] duration-700 ease-out"
            style={{ width: w(withdrawn) }}
            title="Already withdrawn"
          />
          <div
            className="relative h-full bg-cyan transition-[width] duration-700 ease-out"
            style={{ width: w(toRecipient) }}
          >
            {!frozenAt && !reduced && (
              <span className="absolute inset-y-0 right-0 w-1 bg-white shadow-[0_0_10px_3px_rgb(34_211_238/0.7)]" />
            )}
          </div>
          <div className="h-full bg-violet transition-[width] duration-700 ease-out" style={{ width: w(refund) }} />
        </div>
        <div className="mt-2 flex justify-between text-[11px] text-faint">
          <span>Start</span>
          <span>{frozenAt ? 'Split frozen at confirmation' : 'Now, ticking'}</span>
          <span>End</span>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-2xl bg-cyan/8 p-4 ring-1 ring-cyan/25"
        >
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <UserRound className="size-3.5 text-cyan" aria-hidden /> Recipient keeps (claimable)
          </p>
          <p className="mt-1 font-mono text-xl text-fg tabular">{fmtLive(toRecipient)}</p>
          {withdrawn > 0 && <p className="mt-1 text-xs text-faint">+ {fmt(stream.withdrawn)} already withdrawn</p>}
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18 }}
          className="rounded-2xl bg-violet/10 p-4 ring-1 ring-violet/25"
        >
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <Undo2 className="size-3.5 text-violet" aria-hidden /> Refunded to your wallet
          </p>
          <p className="mt-1 font-mono text-xl text-fg tabular">{fmtLive(refund)}</p>
          <p className="mt-1 text-xs text-faint">Goes to {shortAddr(stream.sender)}, not the treasury</p>
        </motion.div>
      </div>

      <p className="sr-only" aria-live="polite">
        If canceled now, the recipient keeps {fmt(exact.toRecipient)} tUSD8 and {fmt(exact.refunded)} tUSD8 is refunded
        to your wallet.
      </p>
      <p className="mt-4 text-xs text-faint">
        The exact split is fixed by the block that includes your transaction, so a few more seconds may vest before it
        confirms. Refunds are paid straight to your wallet (the contract transfers them to the sender), not back into
        the vault treasury.
      </p>

      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row">
        <Button variant="secondary" className="sm:flex-1" onClick={onClose} disabled={busy}>
          Keep streaming
        </Button>
        <Button
          variant="danger"
          className="sm:flex-1"
          onClick={() => void confirm()}
          loading={busy}
          icon={<Ban className="size-4" />}
        >
          Cancel stream
        </Button>
      </div>
    </div>
  );
}
