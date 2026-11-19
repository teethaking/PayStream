import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Droplets, FlaskConical, Info, ShieldCheck, Swords } from 'lucide-react';
import type { Address, Hex } from 'viem';
import { DAY, ONE, checkOperatorCaps, toFriendlyError, type FriendlyError, type StreamParams } from '@paystream/sdk';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { TxLink } from '@/components/ui/Address';
import { publicClient } from '@/lib/clients';
import { runTx } from '@/lib/tx';
import { streamVaultAbi } from '@/lib/abi';
import { walletClientFor } from '@/lib/wallet';
import { openFaucet } from '@/lib/faucet';
import { config } from '@/config';
import { fmt } from '@/lib/format';
import { sameAddress } from '@/lib/derive';
import { useBalances } from '@/hooks/useVault';
import { addBlocked, getAgentBurner, setAgentInput, shakeGauges, useAgentUi, useOperatorPair } from './store';

type Phase =
  | { k: 'idle' }
  | { k: 'simulating'; amount: bigint; cap: 'per-stream' | 'daily' }
  | { k: 'sending'; amount: bigint; cap: 'per-stream' | 'daily'; predicted: FriendlyError }
  | { k: 'predicted'; amount: bigint; cap: 'per-stream' | 'daily'; predicted: FriendlyError }
  | { k: 'blocked'; amount: bigint; cap: 'per-stream' | 'daily'; error: FriendlyError; hash: Hex }
  | { k: 'failed'; error: FriendlyError };

/** Shield that deflects an incoming payment. Static under reduced motion. */
function Shield({ play }: { play: number }) {
  const reduced = useReducedMotion();
  const animate = !reduced && play > 0;
  return (
    <div className="relative grid size-28 place-items-center" aria-hidden>
      {animate &&
        [0, 1].map((i) => (
          <motion.span
            key={play + '-' + i}
            className="absolute inset-2 rounded-full ring-2 ring-rose/60"
            initial={{ scale: 0.7, opacity: 0.9 }}
            animate={{ scale: 1.7, opacity: 0 }}
            transition={{ duration: 1.1, delay: 0.55 + i * 0.25, ease: 'easeOut' }}
          />
        ))}
      {animate && (
        <motion.span
          key={'coin-' + play}
          className="absolute top-1/2 left-1/2 -mt-3 grid h-6 place-items-center rounded-full bg-amber px-2 font-mono text-[10px] font-bold text-black"
          initial={{ x: -150, opacity: 0, rotate: 0 }}
          animate={{ x: [-150, -46, -110], opacity: [0, 1, 0], rotate: [0, 0, -40] }}
          transition={{ duration: 1.1, times: [0, 0.5, 1], ease: 'easeOut' }}
        >
          tUSD8
        </motion.span>
      )}
      <motion.svg
        key={'shield-' + play}
        viewBox="0 0 64 64"
        className="size-24 drop-shadow-[0_0_24px_var(--ps-rose)]"
        initial={animate ? { scale: 0.8 } : false}
        animate={animate ? { scale: [0.8, 0.8, 1.12, 1] } : undefined}
        transition={{ duration: 0.9, times: [0, 0.55, 0.7, 1] }}
      >
        <motion.path
          d="M32 5 L54 13 V30 C54 44 44 54 32 59 C20 54 10 44 10 30 V13 Z"
          fill="color-mix(in srgb, var(--ps-rose) 16%, transparent)"
          stroke="var(--ps-rose)"
          strokeWidth="3"
          strokeLinejoin="round"
          initial={animate ? { pathLength: 0 } : false}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.6, ease: 'easeInOut' }}
        />
        <motion.path
          d="M24 24 L40 40 M40 24 L24 40"
          stroke="var(--ps-rose)"
          strokeWidth="4"
          strokeLinecap="round"
          initial={animate ? { pathLength: 0 } : false}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.35, delay: animate ? 0.6 : 0 }}
        />
      </motion.svg>
    </div>
  );
}

const capLabel = (cap: 'per-stream' | 'daily') => (cap === 'daily' ? 'daily cap exceeded' : 'per-stream cap exceeded');

export function OverspendCard({ employer }: { employer: Address }) {
  const burner = getAgentBurner();
  const pair = useOperatorPair(employer, burner.address);
  const selected = useAgentUi((s) => s.agentInput);
  const gas = useBalances(burner.address).data?.gas;
  const [phase, setPhase] = useState<Phase>({ k: 'idle' });
  const [play, setPlay] = useState(0);
  const selectedIsBurner = sameAddress(selected.trim(), burner.address);

  const caps = pair.caps;
  const remaining = caps ? (caps.dailyCap > pair.spent ? caps.dailyCap - pair.spent : 0n) : 0n;
  const cap: 'per-stream' | 'daily' = caps && remaining < caps.perStreamCap ? 'daily' : 'per-stream';
  const amount = caps ? (cap === 'daily' ? remaining : caps.perStreamCap) + ONE : 0n;
  const busy = phase.k === 'simulating' || phase.k === 'sending';
  const shake = () => {
    if (selectedIsBurner) shakeGauges();
  };

  const attempt = async () => {
    if (!caps || !config.vault) return;
    const now = Math.floor(Date.now() / 1000) + 60;
    const p: StreamParams = { recipient: employer, amount, start: now, cliff: now, end: now + DAY, cancelable: true };
    const offchain = checkOperatorCaps(caps, [p], now);
    if (offchain.ok)
      return setPhase({
        k: 'failed',
        error: {
          code: 'Unknown',
          title: 'Nothing to prove',
          message: 'This amount fits the caps, so the demo stops here.',
          blockedByContract: false,
        },
      });
    const call = {
      address: config.vault,
      abi: streamVaultAbi,
      functionName: 'createStream',
      args: [employer, p],
    } as const;
    setPhase({ k: 'simulating', amount, cap });
    let predicted: FriendlyError;
    try {
      await publicClient.simulateContract({ ...call, account: burner.address });
      return setPhase({
        k: 'failed',
        error: {
          code: 'Unknown',
          title: 'Simulation did not revert',
          message: 'The call would succeed, so nothing was sent. Refresh and try again.',
          blockedByContract: false,
        },
      });
    } catch (e) {
      predicted = toFriendlyError(e);
    }
    if (!predicted.blockedByContract) return setPhase({ k: 'failed', error: predicted });
    shake();
    setPlay((n) => n + 1);
    if (!gas) return setPhase({ k: 'predicted', amount, cap, predicted });

    setPhase({ k: 'sending', amount, cap, predicted });
    const res = await runTx({
      title: 'Agent tries to overspend',
      wallet: walletClientFor(burner),
      forceSend: true,
      celebrate: false,
      call: () => call,
    });
    if (!res.ok && res.revertedOnChain && res.hash) {
      addBlocked({
        hash: res.hash,
        agent: burner.address,
        employer,
        amount,
        reason: res.error.title.toLowerCase(),
        at: Math.floor(Date.now() / 1000),
      });
      setPhase({ k: 'blocked', amount, cap, error: res.error, hash: res.hash });
      setPlay((n) => n + 1);
      shake();
    } else if (!res.ok) setPhase({ k: 'failed', error: res.error });
    else
      setPhase({
        k: 'failed',
        error: {
          code: 'Unknown',
          title: 'Unexpected success',
          message: 'The chain accepted the transaction. Check the activity log.',
          blockedByContract: false,
        },
      });
  };

  const disabledReason = !config.vault
    ? 'The vault is not deployed in this build.'
    : pair.status !== 'active'
      ? 'Grant the browser agent access first, so there are caps to break.'
      : undefined;

  return (
    <Card glow="rose" className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -bottom-16 size-56 rounded-full bg-rose/15 blur-3xl"
      />
      <CardHeader
        icon={<Swords className="size-5 text-rose" aria-hidden />}
        title="Try to overspend"
        subtitle="Make the agent break its own limit and watch the contract stop it on-chain."
      />

      {caps && pair.status === 'active' ? (
        <div className="relative mb-4 rounded-xl bg-surface p-3 text-xs leading-relaxed text-muted ring-1 ring-inset ring-line">
          The {cap} cap is tighter (
          {cap === 'daily' ? fmt(remaining) + ' tUSD8 left today' : fmt(caps.perStreamCap) + ' tUSD8 per stream'}), so
          the agent will try one stream of <strong className="font-mono text-rose tabular">{fmt(amount)} tUSD8</strong>,
          exactly 1 tUSD8 over it, paid to your own address.
        </div>
      ) : (
        <p className="relative mb-4 text-xs text-muted">{disabledReason}</p>
      )}

      <div className="relative flex flex-wrap items-center gap-2">
        <Button
          variant="danger"
          magnetic
          loading={busy}
          disabled={Boolean(disabledReason) || busy}
          onClick={() => void attempt()}
          icon={<Swords className="size-4" aria-hidden />}
        >
          {phase.k === 'simulating' ? 'Simulating…' : phase.k === 'sending' ? 'Broadcasting…' : 'Try to overspend'}
        </Button>
        {pair.status !== 'active' && !selectedIsBurner && (
          <Button variant="ghost" size="sm" onClick={() => setAgentInput(burner.address)}>
            Select browser agent
          </Button>
        )}
      </div>

      <div aria-live="polite" className="relative">
        <AnimatePresence mode="wait">
          {(phase.k === 'blocked' || phase.k === 'predicted' || phase.k === 'sending') && (
            <motion.div
              key={phase.k}
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ type: 'spring', stiffness: 300, damping: 24 }}
              className="mt-5 flex flex-col items-center gap-3 rounded-2xl bg-rose/8 p-5 text-center ring-1 ring-inset ring-rose/30 sm:flex-row sm:text-left"
            >
              <Shield play={play} />
              <div className="min-w-0 flex-1 space-y-2">
                <p className="font-mono text-[11px] tracking-widest text-rose uppercase">
                  {phase.k === 'blocked'
                    ? 'Reverted on-chain'
                    : phase.k === 'sending'
                      ? 'Predicted revert · broadcasting anyway'
                      : 'Predicted by simulation'}
                </p>
                <p className="font-display text-lg leading-tight font-semibold">
                  Blocked by contract: {capLabel(phase.cap)}
                </p>
                <p className="text-xs text-muted">
                  {phase.k === 'blocked' ? phase.error.message : phase.predicted.message}
                </p>
                {phase.k === 'blocked' && (
                  <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                    <TxLink hash={phase.hash}>View reverted tx</TxLink>
                    <span className="inline-flex items-center gap-1 text-xs text-mint">
                      <ShieldCheck className="size-3.5" aria-hidden /> 0 tUSD8 moved
                    </span>
                  </div>
                )}
                {phase.k === 'predicted' && (
                  <div className="space-y-2 rounded-xl bg-surface p-3 text-left text-xs text-muted ring-1 ring-inset ring-line">
                    <p className="flex gap-2">
                      <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                      The browser agent has no tQDAY, so it cannot pay gas to broadcast. Fund the agent key and run this
                      again to prove the revert on-chain with a real transaction hash.
                    </p>
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<Droplets className="size-3.5" aria-hidden />}
                      onClick={() => void openFaucet(burner.address)}
                    >
                      Get test funds for the agent
                    </Button>
                  </div>
                )}
              </div>
            </motion.div>
          )}
          {phase.k === 'failed' && (
            <motion.p
              key="failed"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mt-4 rounded-xl bg-amber/10 p-3 text-xs text-amber ring-1 ring-inset ring-amber/25"
              role="alert"
            >
              <strong>{phase.error.title}.</strong> {phase.error.message}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      <p className="relative mt-4 flex items-start gap-2 text-[11px] text-faint">
        <FlaskConical className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        Simulates first, then broadcasts anyway with the agent key so the revert is recorded on Aevum. Only gas is
        spent.
      </p>
    </Card>
  );
}
