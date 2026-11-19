import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Coins, Search, Sparkles } from 'lucide-react';
import { vestedAtPrecise } from '@paystream/sdk';
import { Page } from '@/components/layout/Page';
import { RequireWallet } from '@/components/RequireWallet';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Ticker } from '@/components/ui/Ticker';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useMyStreams } from '@/hooks/useVault';
import { useChainNow, useChainSeconds } from '@/hooks/useChainNow';
import { useEvents } from '@/lib/events';
import type { StreamView } from '@/lib/derive';
import { streamVaultAbi } from '@/lib/abi';
import { runTx } from '@/lib/tx';
import { useWallet } from '@/lib/wallet';
import { fmt, fmtLive, shortAddr } from '@/lib/format';
import { config } from '@/config';
import { StreamCard } from './StreamCard';
import { claimableExact, claimableLive, parseStreamId } from './live';

const SYMBOL = config.tokenSymbol;

export default function MyStreams() {
  return (
    <Page
      title="My streams"
      subtitle="Salary streams paying this wallet. Balances grow every second; withdraw whenever you like."
    >
      <div className="space-y-8">
        <LookupForm />
        <RequireWallet purpose="Connect the wallet that receives your salary to see every stream paying it.">
          <MyStreamsList />
        </RequireWallet>
      </div>
    </Page>
  );
}

function LookupForm() {
  const navigate = useNavigate();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string>();
  const [shakeKey, setShakeKey] = useState(0);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const id = parseStreamId(value.replace(/^#/, ''));
    if (id === undefined) {
      setError('Enter a stream number, like 3');
      setShakeKey((k) => k + 1);
      return;
    }
    navigate(`/claim/${id}`);
  };
  return (
    <form onSubmit={submit} className="glass flex flex-col gap-3 p-4 sm:flex-row sm:items-end sm:p-5" noValidate>
      <div className="flex-1 space-y-1.5">
        <label htmlFor="lookup-id" className="label block">
          Look up a stream
        </label>
        <motion.div
          key={shakeKey}
          animate={shakeKey ? { x: [0, -6, 6, -4, 4, 0] } : undefined}
          transition={{ duration: 0.4 }}
          className="relative"
        >
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint"
            aria-hidden
          />
          <input
            id="lookup-id"
            className="input pl-9 font-mono"
            inputMode="numeric"
            autoComplete="off"
            placeholder="Stream id, e.g. 12"
            value={value}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'lookup-id-error' : undefined}
            onChange={(e) => {
              setValue(e.target.value);
              setError(undefined);
            }}
          />
        </motion.div>
        {error && (
          <p id="lookup-id-error" role="alert" className="text-xs text-rose">
            {error}
          </p>
        )}
      </div>
      <Button type="submit" variant="secondary" icon={<ArrowRight className="size-4" />} className="sm:mb-px">
        Open stream
      </Button>
    </form>
  );
}

function MyStreamsList() {
  const { recipient: streams } = useMyStreams();
  const status = useEvents((s) => s.status);
  const address = useWallet((s) => s.address);

  if (!config.vault) {
    return (
      <Card>
        <EmptyState
          title="StreamVault is not deployed yet"
          body="Once the vault is live on Aevum, every stream paying this wallet shows up here automatically."
        />
      </Card>
    );
  }
  if (streams.length === 0 && (status === 'idle' || status === 'syncing')) {
    return (
      <div className="space-y-6" role="status" aria-label="Loading your streams">
        <div className="grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-60 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }
  if (streams.length === 0) {
    return (
      <Card>
        <EmptyState
          title="No streams pay this wallet yet"
          body={
            <>
              When an employer (or their AI agent) streams salary to{' '}
              <span className="font-mono text-fg">{shortAddr(address)}</span>, it appears here and starts ticking.
            </>
          }
        />
      </Card>
    );
  }
  return (
    <div className="space-y-8">
      <StatStrip streams={streams} />
      <ClaimAll streams={streams} />
      <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-label="Streams paying this wallet">
        {streams.map((s, i) => (
          <li key={s.id.toString()}>
            <StreamCard stream={s} index={i} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatStrip({ streams }: { streams: StreamView[] }) {
  const now = useChainNow();
  let claimable = 0;
  let vested = 0;
  let total = 0;
  for (const s of streams) {
    claimable += claimableLive(s, now);
    vested += vestedAtPrecise(s, now);
    total += Number(s.total);
  }
  return (
    <dl className="grid gap-4 sm:grid-cols-3">
      <div className="glass-strong relative overflow-hidden p-5 sm:col-span-1">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-16 -left-10 size-40 rounded-full bg-violet/25 blur-3xl"
        />
        <dt className="label relative">Claimable now</dt>
        <dd className="relative mt-3">
          <Ticker
            text={fmtLive(claimable, 6)}
            suffix={SYMBOL}
            className="text-2xl font-semibold text-fg sm:text-[1.7rem]"
          />
        </dd>
      </div>
      <div className="glass p-5">
        <dt className="label">Total vested</dt>
        <dd className="mt-3 font-mono text-xl text-cyan tabular sm:text-2xl">{fmtLive(vested, 2)}</dd>
      </div>
      <div className="glass p-5">
        <dt className="label">Still streaming</dt>
        <dd className="mt-3 font-mono text-xl text-fg tabular sm:text-2xl">
          {fmtLive(Math.max(0, total - vested), 2)}
        </dd>
      </div>
    </dl>
  );
}

function ClaimAll({ streams }: { streams: StreamView[] }) {
  const seconds = useChainSeconds();
  const ready = streams.filter((s) => claimableExact(s, seconds) > 0n);
  const sum = ready.reduce((a, s) => a + claimableExact(s, seconds), 0n);
  const [run, setRun] = useState<{ i: number; n: number } | null>(null);
  const [announce, setAnnounce] = useState('');

  const claimAll = async () => {
    const queue = [...ready];
    let done = 0;
    for (let i = 0; i < queue.length; i++) {
      const s = queue[i]!;
      setRun({ i: i + 1, n: queue.length });
      const r = await runTx({
        title: `Withdraw stream #${s.id} (${i + 1}/${queue.length})`,
        call: () => ({ address: config.vault!, abi: streamVaultAbi, functionName: 'withdraw', args: [s.id] }),
        celebrate: i === queue.length - 1,
        successMessage: `Stream #${s.id} paid out to your wallet.`,
      });
      if (!r.ok) break;
      done++;
    }
    setRun(null);
    setAnnounce(done === queue.length ? `Claimed all ${done} streams.` : `Claimed ${done} of ${queue.length} streams.`);
    setTimeout(() => setAnnounce(''), 6000);
  };

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted" aria-live="polite">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={run ? `r${run.i}` : announce || ready.length}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="inline-block"
          >
            {run
              ? `Claiming stream ${run.i} of ${run.n}…`
              : announce ||
                (ready.length
                  ? `${ready.length} of ${streams.length} stream${streams.length === 1 ? '' : 's'} have ${fmt(sum)} ${SYMBOL} ready.`
                  : 'Nothing to claim right now. Check back in a moment.')}
          </motion.span>
        </AnimatePresence>
      </p>
      <Button
        size="lg"
        magnetic
        loading={Boolean(run)}
        disabled={ready.length === 0}
        onClick={() => void claimAll()}
        icon={ready.length > 1 ? <Sparkles className="size-5" /> : <Coins className="size-5" />}
        className="w-full sm:w-auto"
      >
        {ready.length === 1 ? 'Claim' : `Claim all${ready.length ? ` (${ready.length})` : ''}`}
      </Button>
    </div>
  );
}
