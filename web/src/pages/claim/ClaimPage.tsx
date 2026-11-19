import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowDownToLine,
  ArrowLeft,
  Bot,
  Check,
  CheckCircle2,
  HandHeart,
  Link2,
  Loader2,
  Lock,
  RefreshCw,
  ShieldAlert,
  Unlock,
  Wallet,
} from 'lucide-react';
import { vestedAtPrecise } from '@paystream/sdk';
import { Page } from '@/components/layout/Page';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge, StatusChip } from '@/components/ui/Badge';
import { Ticker } from '@/components/ui/Ticker';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Address, TxLink } from '@/components/ui/Address';
import { useStream } from '@/hooks/useVault';
import { useChainNow, useChainSeconds } from '@/hooks/useChainNow';
import { refreshEvents, useEvents, type VaultEvent } from '@/lib/events';
import { sameAddress, statusOf, type StreamView } from '@/lib/derive';
import { publicClient } from '@/lib/clients';
import { streamVaultAbi } from '@/lib/abi';
import { runTx } from '@/lib/tx';
import { connectInjected, enableBurner, hasInjected, useWallet } from '@/lib/wallet';
import { fmt, fmtDate, fmtDateTime, fmtDuration, fmtLive, timeAgo } from '@/lib/format';
import { cn } from '@/lib/cn';
import { config } from '@/config';
import { ScheduleTimeline } from './ScheduleTimeline';
import { claimableExact, claimableLive, parseStreamId } from './live';

const SYMBOL = config.tokenSymbol;

export default function ClaimPage() {
  const { streamId } = useParams();
  const id = parseStreamId(streamId);
  const stream = useStream(id);
  const status = useEvents((s) => s.status);
  const progress = useEvents((s) => s.progress);
  const error = useEvents((s) => s.error);

  const back = (
    <Link to="/me" className="inline-flex items-center gap-1.5 text-sm text-muted transition hover:text-fg">
      <ArrowLeft className="size-4" aria-hidden /> My streams
    </Link>
  );

  if (id === undefined) {
    return (
      <Page title="Claim" actions={back}>
        <Card className="mx-auto max-w-xl">
          <EmptyState
            title="That is not a stream id"
            body={`"${streamId ?? ''}" is not a valid stream number. Stream ids are whole numbers like 1, 2, 3.`}
            action={<LookupLink />}
          />
        </Card>
      </Page>
    );
  }

  if (!config.vault) {
    return (
      <Page title={`Stream #${id}`} actions={back}>
        <Card className="mx-auto max-w-xl">
          <EmptyState
            title="StreamVault is not deployed yet"
            body="This build has no vault address, so there is no on-chain stream to show. Share links will start working as soon as the vault is live on Aevum."
          />
        </Card>
      </Page>
    );
  }

  if (!stream) {
    if (status === 'live') {
      return (
        <Page title={`Stream #${id}`} actions={back}>
          <Card className="mx-auto max-w-xl">
            <EmptyState
              title={`Stream #${id} does not exist`}
              body="No StreamCreated event with this id was found on Aevum. Double-check the link, or the stream may not have been created yet."
              action={<LookupLink />}
            />
          </Card>
        </Page>
      );
    }
    if (status === 'error') {
      return (
        <Page title={`Stream #${id}`} actions={back}>
          <Card className="mx-auto max-w-xl" glow="rose">
            <EmptyState
              title="Could not reach the Aevum RPC"
              body={
                error
                  ? 'The event indexer hit a network error while loading this stream. It retries on its own, or you can retry now.'
                  : undefined
              }
              action={
                <Button
                  variant="secondary"
                  icon={<RefreshCw className="size-4" />}
                  onClick={() => void refreshEvents().catch(() => undefined)}
                >
                  Retry now
                </Button>
              }
            />
          </Card>
        </Page>
      );
    }
    return (
      <Page title={`Stream #${id}`} actions={back}>
        <ClaimSkeleton progress={progress} />
      </Page>
    );
  }

  return (
    <Page
      title={
        <span className="inline-flex flex-wrap items-center gap-3">
          Stream <span className="font-mono text-gradient">#{stream.id.toString()}</span>
        </span>
      }
      subtitle="A salary stream on PayStream. The balance below grows every second and can be withdrawn at any time."
      actions={back}
    >
      <ClaimView stream={stream} />
    </Page>
  );
}

function LookupLink() {
  return (
    <Link to="/me" className="text-sm font-medium text-violet underline-offset-4 hover:underline">
      Look up another stream
    </Link>
  );
}

function ClaimSkeleton({ progress }: { progress: number }) {
  return (
    <div className="grid grid-cols-1 gap-6 [&>*]:min-w-0 lg:grid-cols-5" role="status" aria-live="polite">
      <div className="glass space-y-6 p-6 lg:col-span-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
        <Skeleton className="h-16 w-3/4" />
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
        <Skeleton className="h-3 rounded-full" />
        <p className="text-sm text-muted">
          Syncing stream events from Aevum… <span className="font-mono tabular">{Math.round(progress * 100)}%</span>
        </p>
      </div>
      <div className="glass space-y-4 p-6 lg:col-span-2">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-8" />
        ))}
      </div>
    </div>
  );
}

/** Re-reads withdrawableOf(id) every 15s at a pinned block, and returns the drift between chain and local math. */
function useChainResync(stream: StreamView) {
  const q = useQuery({
    queryKey: ['withdrawableOf', stream.id.toString(), stream.withdrawn.toString(), stream.canceled],
    enabled: Boolean(config.vault),
    refetchInterval: config.resyncMs,
    queryFn: async () => {
      const block = await publicClient.getBlock({ blockTag: 'latest' });
      const value = await publicClient.readContract({
        address: config.vault!,
        abi: streamVaultAbi,
        functionName: 'withdrawableOf',
        args: [stream.id],
        blockNumber: block.number,
      });
      const at = Number(block.timestamp);
      return { value, at, drift: value - claimableExact(stream, at), syncedAt: Date.now() };
    },
  });
  return { data: q.data, fetching: q.isFetching, failed: q.isError };
}

function ClaimView({ stream }: { stream: StreamView }) {
  const seconds = useChainSeconds();
  const address = useWallet((s) => s.address);
  const sync = useChainResync(stream);
  const drift = sync.data?.drift ?? 0n;
  const status = statusOf(stream, seconds);
  const isRecipient = sameAddress(stream.recipient, address);
  const exact = (() => {
    const v = claimableExact(stream, seconds) + drift;
    return v > 0n ? v : 0n;
  })();
  const [busy, setBusy] = useState(false);
  const [celebrateKey, setCelebrateKey] = useState(0);
  const [announce, setAnnounce] = useState('');

  const withdraw = async () => {
    setBusy(true);
    const amount = fmt(exact);
    const r = await runTx({
      title: isRecipient ? `Withdraw from stream #${stream.id}` : `Pay out stream #${stream.id}`,
      call: () => ({ address: config.vault!, abi: streamVaultAbi, functionName: 'withdraw', args: [stream.id] }),
      successMessage: isRecipient
        ? `About ${amount} ${SYMBOL} is on its way to your wallet.`
        : `About ${amount} ${SYMBOL} was paid to the recipient. Thanks for keeping it flowing.`,
    });
    setBusy(false);
    if (r.ok) {
      setCelebrateKey((k) => k + 1);
      setAnnounce(`Withdrawal confirmed for stream ${stream.id}.`);
    } else {
      setAnnounce(`Withdrawal failed: ${r.error.message}`);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 [&>*]:min-w-0 lg:grid-cols-5">
      <p className="sr-only" aria-live="polite" role="status">
        {announce} Stream status: {status}.
      </p>
      <motion.section
        layoutId={`stream-${stream.id}`}
        className="glass-strong relative overflow-hidden p-5 sm:p-8 lg:col-span-3"
        aria-labelledby="claim-amount-label"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 -right-24 size-80 rounded-full bg-violet/20 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-40 -left-24 size-80 rounded-full bg-cyan/10 blur-3xl"
        />
        <AnimatePresence>
          {celebrateKey > 0 && (
            <motion.div
              key={celebrateKey}
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-[inherit] ring-2 ring-mint"
              initial={{ opacity: 0.9, scale: 0.98 }}
              animate={{ opacity: 0, scale: 1.02 }}
              transition={{ duration: 1.2, ease: 'easeOut' }}
            />
          )}
        </AnimatePresence>

        <div className="relative flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <StatusChip status={status} />
            {!stream.cancelable && (
              <Badge tone="mint">
                <Lock className="size-3" aria-hidden /> Locked
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <SyncIndicator sync={sync} />
            <ShareButton id={stream.id} />
          </div>
        </div>

        <LiveHero stream={stream} drift={drift} />

        <div className="relative mt-8 flex flex-col gap-3">
          <WithdrawAction
            stream={stream}
            exact={exact}
            busy={busy}
            seconds={seconds}
            isRecipient={isRecipient}
            connected={Boolean(address)}
            onWithdraw={() => void withdraw()}
          />
          {address && !isRecipient && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex gap-3 rounded-xl bg-cyan/8 p-4 text-sm text-muted ring-1 ring-cyan/20"
            >
              <HandHeart className="mt-0.5 size-5 shrink-0 text-cyan" aria-hidden />
              <p>
                <span className="font-medium text-fg">Keeper mode.</span> You are not the recipient of this stream, but
                anyone can trigger a payout. The {SYMBOL} always goes to{' '}
                <span className="font-mono text-fg" title={stream.recipient}>
                  {stream.recipient.slice(0, 6)}…{stream.recipient.slice(-4)}
                </span>
                ; you only pay the gas.
              </p>
            </motion.div>
          )}
        </div>

        <div className="relative mt-8 border-t border-line pt-6">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold">Schedule</h2>
            <Countdown stream={stream} now={seconds} />
          </div>
          <LiveTimeline stream={stream} />
        </div>
      </motion.section>

      <div className="space-y-6 lg:col-span-2">
        <StreamDetails stream={stream} />
        <WithdrawHistory stream={stream} />
      </div>
    </div>
  );
}

/** The part of the page that re-renders every animation frame. */
function LiveHero({ stream, drift }: { stream: StreamView; drift: bigint }) {
  const now = useChainNow();
  const claimable = claimableLive(stream, now, Number(drift));
  const vested = vestedAtPrecise(stream, now);
  return (
    <div className="relative mt-8">
      <p id="claim-amount-label" className="label">
        Claimable now
      </p>
      <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <Ticker
          text={fmtLive(claimable, 6)}
          suffix={SYMBOL}
          className="text-[2.6rem] font-semibold text-fg sm:text-6xl lg:text-7xl"
        />
      </div>
      <dl className="mt-8 grid grid-cols-3 gap-3 sm:gap-6">
        <Stat label="Vested" value={fmtLive(vested, 6)} accent />
        <Stat
          label={stream.canceled ? 'Final total' : 'Total'}
          value={fmt(stream.total, 6)}
          hint={stream.canceled ? `of ${fmt(stream.originalTotal)}` : undefined}
        />
        <Stat label="Withdrawn" value={fmt(stream.withdrawn, 6)} />
      </dl>
    </div>
  );
}

function Stat({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="label">{label}</dt>
      <dd
        className={cn('mt-1 truncate font-mono text-sm tabular sm:text-base', accent ? 'text-cyan' : 'text-fg')}
        title={value}
      >
        {value}
      </dd>
      {hint && <dd className="font-mono text-[11px] text-faint">{hint}</dd>}
    </div>
  );
}

function LiveTimeline({ stream }: { stream: StreamView }) {
  const now = useChainNow();
  return <ScheduleTimeline stream={stream} now={now} />;
}

function Countdown({ stream, now }: { stream: StreamView; now: number }) {
  let text: string;
  if (stream.canceled) text = `Canceled ${stream.canceledAt ? fmtDate(stream.canceledAt) : ''}`;
  else if (now < stream.start) text = `Starts in ${fmtDuration(stream.start - now)}`;
  else if (now < stream.cliff)
    text = `Cliff unlocks in ${fmtDuration(stream.cliff - now)} · fully vested in ${fmtDuration(stream.end - now)}`;
  else if (now < stream.end) text = `Fully vested in ${fmtDuration(stream.end - now)}`;
  else text = `Fully vested since ${fmtDate(stream.end)}`;
  return <p className="font-mono text-xs text-muted tabular sm:text-sm">{text}</p>;
}

function WithdrawAction({
  stream,
  exact,
  busy,
  seconds,
  isRecipient,
  connected,
  onWithdraw,
}: {
  stream: StreamView;
  exact: bigint;
  busy: boolean;
  seconds: number;
  isRecipient: boolean;
  connected: boolean;
  onWithdraw: () => void;
}) {
  if (!connected) {
    return (
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button
          size="lg"
          magnetic
          icon={<Wallet className="size-5" />}
          onClick={() => (hasInjected() ? void connectInjected() : enableBurner())}
          className="w-full sm:w-auto"
        >
          Connect to withdraw
        </Button>
        {hasInjected() && (
          <Button variant="ghost" onClick={enableBurner}>
            or use instant demo
          </Button>
        )}
      </div>
    );
  }
  const nothing = exact === 0n;
  const reason = nothing
    ? seconds < stream.cliff && !stream.canceled
      ? `Nothing is claimable until the cliff on ${fmtDateTime(stream.cliff)}.`
      : stream.withdrawn >= stream.total
        ? 'Everything in this stream has been paid out.'
        : 'Nothing new has vested since the last withdrawal.'
    : `${isRecipient ? 'Sends' : 'Pays'} ${fmt(exact)} ${SYMBOL}${statusOf(stream, seconds) === 'vesting' ? ' or a bit more' : ''} to ${isRecipient ? 'your wallet' : 'the recipient'}.`;
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
      <Button
        size="lg"
        magnetic
        loading={busy}
        disabled={nothing}
        onClick={onWithdraw}
        icon={isRecipient ? <ArrowDownToLine className="size-5" /> : <HandHeart className="size-5" />}
        className="w-full sm:w-auto"
        aria-describedby="withdraw-hint"
      >
        {isRecipient ? 'Withdraw' : 'Pay it forward'}
      </Button>
      <p id="withdraw-hint" className="text-sm text-muted">
        {reason}
      </p>
    </div>
  );
}

function SyncIndicator({ sync }: { sync: ReturnType<typeof useChainResync> }) {
  useChainSeconds();
  const drifted = sync.data && sync.data.drift !== 0n;
  const label = sync.failed
    ? 'Chain read failed, retrying'
    : !sync.data
      ? 'Reading chain…'
      : drifted
        ? `Adjusted to chain · ${timeAgo(sync.data.syncedAt / 1000)}`
        : `Synced with chain · ${timeAgo(sync.data.syncedAt / 1000)}`;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] ring-1',
        sync.failed ? 'text-rose ring-rose/30' : drifted ? 'text-amber ring-amber/30' : 'text-muted ring-line',
      )}
      title="The claimable amount is re-read from withdrawableOf() every 15 seconds"
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={sync.fetching ? 'f' : sync.failed ? 'e' : 'ok'}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.6 }}
          className="inline-flex"
        >
          {sync.fetching ? (
            <Loader2 className="size-3 animate-spin" aria-hidden />
          ) : sync.failed ? (
            <ShieldAlert className="size-3" aria-hidden />
          ) : (
            <CheckCircle2 className="size-3 text-mint" aria-hidden />
          )}
        </motion.span>
      </AnimatePresence>
      <span className="hidden sm:inline">{label}</span>
      <span className="sr-only sm:hidden">{label}</span>
    </span>
  );
}

function ShareButton({ id }: { id: bigint }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    const url = new URL(window.location.href);
    url.search = '';
    url.hash = '';
    try {
      await navigator.clipboard.writeText(url.toString());
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      window.prompt('Copy this link', url.toString());
    }
  };
  return (
    <Button variant="secondary" size="sm" onClick={() => void copy()} aria-label={`Copy share link for stream ${id}`}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={copied ? 'y' : 'n'}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          className="inline-flex items-center gap-1.5"
        >
          {copied ? <Check className="size-3.5 text-mint" aria-hidden /> : <Link2 className="size-3.5" aria-hidden />}
          {copied ? 'Copied' : 'Share'}
        </motion.span>
      </AnimatePresence>
    </Button>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="flex min-w-0 items-center justify-end gap-2 text-right">{children}</dd>
    </div>
  );
}

function StreamDetails({ stream }: { stream: StreamView }) {
  const events = useEvents((s) => s.events);
  const canceledEvent = useMemo(
    () => events.find((e) => e.name === 'StreamCanceled' && (e.args.id as bigint) === stream.id),
    [events, stream.id],
  );
  const byAgent = !sameAddress(stream.createdBy, stream.sender);
  return (
    <Card>
      <CardHeader title="Details" subtitle="Everything here is read from on-chain events." />
      <dl className="divide-y divide-line">
        <Row label="Employer">
          <Address address={stream.sender} />
        </Row>
        <Row label="Recipient">
          <Address address={stream.recipient} />
        </Row>
        <Row label="Created by">
          {byAgent && (
            <Badge tone="violet">
              <Bot className="size-3" aria-hidden /> AI agent
            </Badge>
          )}
          <Address address={stream.createdBy} />
        </Row>
        <Row label="Cancellation">
          {stream.cancelable ? (
            <Badge tone="amber">
              <Unlock className="size-3" aria-hidden /> Employer can cancel
            </Badge>
          ) : (
            <Badge tone="mint">
              <Lock className="size-3" aria-hidden /> Locked, cannot be canceled
            </Badge>
          )}
        </Row>
        <Row label="Created">
          <span className="font-mono text-xs text-muted">{fmtDateTime(stream.createdAt)}</span>
          <TxLink hash={stream.createdTx} />
        </Row>
      </dl>
      {stream.canceled && (
        <div className="mt-4 rounded-xl bg-rose/8 p-4 ring-1 ring-rose/20">
          <p className="text-sm font-medium text-rose">
            Canceled{stream.canceledAt ? ` on ${fmtDateTime(stream.canceledAt)}` : ''}
          </p>
          <p className="mt-1 text-xs text-muted">
            The vested part stays claimable by the recipient. The unvested rest went back to the employer.
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <dt className="label">To recipient</dt>
              <dd className="font-mono text-sm text-fg tabular">
                {fmt((canceledEvent?.args.paidToRecipient as bigint | undefined) ?? stream.total - stream.withdrawn)}{' '}
                {SYMBOL}
              </dd>
            </div>
            <div>
              <dt className="label">Refunded</dt>
              <dd className="font-mono text-sm text-fg tabular">
                {fmt(stream.refunded)} {SYMBOL}
              </dd>
            </div>
          </dl>
          {canceledEvent && <TxLink hash={canceledEvent.txHash} className="mt-3" />}
        </div>
      )}
    </Card>
  );
}

function WithdrawHistory({ stream }: { stream: StreamView }) {
  const events = useEvents((s) => s.events);
  const rows = useMemo(
    () =>
      events
        .filter((e): e is VaultEvent => e.name === 'Withdrawn' && (e.args.id as bigint) === stream.id)
        .sort((a, b) => Number(b.blockNumber - a.blockNumber) || b.logIndex - a.logIndex),
    [events, stream.id],
  );
  const seconds = useChainSeconds();
  return (
    <Card>
      <CardHeader
        title="Payouts"
        subtitle={rows.length ? `${rows.length} withdrawal${rows.length === 1 ? '' : 's'} so far` : undefined}
      />
      {rows.length === 0 ? (
        <p className="text-sm text-muted">
          No withdrawals yet. Vested {SYMBOL} keeps accumulating until someone triggers one.
        </p>
      ) : (
        <ul className="space-y-2">
          <AnimatePresence initial={false}>
            {rows.map((e) => {
              const keeper = !sameAddress(e.args.triggeredBy as string, e.args.recipient as string);
              return (
                <motion.li
                  key={e.key}
                  layout
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-3 py-2.5 ring-1 ring-line"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-sm text-mint tabular">
                      +{fmt(e.args.amount as bigint)} {SYMBOL}
                    </p>
                    <p className="text-xs text-faint">
                      {timeAgo(e.timestamp, seconds)}
                      {keeper && (
                        <>
                          {' · '}
                          <span title={e.args.triggeredBy as string}>via keeper</span>
                        </>
                      )}
                    </p>
                  </div>
                  <TxLink hash={e.txHash} />
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
    </Card>
  );
}
