import { memo, useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import type { StreamStatus } from '@paystream/sdk';
import { vestedAtPrecise } from '@paystream/sdk';
import { ArrowUpRight, Ban, Bot, Check, Link2, Lock, Search, Waves } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';
import { Address } from '@/components/ui/Address';
import { Badge, StatusChip } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { StreamProgress } from '@/components/ui/StreamProgress';
import { useChainNow, useChainSeconds } from '@/hooks/useChainNow';
import { useEvents } from '@/lib/events';
import { sameAddress, statusOf, type StreamView } from '@/lib/derive';
import { config } from '@/config';
import { toast } from '@/lib/toast';
import { fmt, fmtDate, fmtDuration, fmtLive } from '@/lib/format';
import { cn } from '@/lib/cn';
import { CancelSheet } from './CancelSheet';

type Filter = 'all' | StreamStatus;
type Sort = 'newest' | 'amount' | 'end';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'pending-cliff', label: 'Pending cliff' },
  { id: 'vesting', label: 'Vesting' },
  { id: 'completed', label: 'Completed' },
  { id: 'canceled', label: 'Canceled' },
];
const PAGE = 20;
const GRID =
  'md:grid md:grid-cols-[64px_minmax(0,1.15fr)_minmax(0,1.1fr)_minmax(0,1.5fr)_112px_auto] md:items-center md:gap-4';

const shareUrl = (id: bigint) =>
  `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, '')}/claim/${id.toString()}`;

export function StreamsSection({
  streams,
  onCreateFirst,
  className,
}: {
  streams: StreamView[];
  onCreateFirst: () => void;
  className?: string;
}) {
  const syncStatus = useEvents((s) => s.status);
  const hasEvents = useEvents((s) => s.events.length > 0);
  const nowSec = useChainSeconds();
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('newest');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [target, setTarget] = useState<bigint>();
  const [sheetOpen, setSheetOpen] = useState(false);

  const withStatus = useMemo(() => streams.map((s) => ({ s, status: statusOf(s, nowSec) })), [streams, nowSec]);
  const counts = useMemo(() => {
    const c: Record<Filter, number> = {
      all: withStatus.length,
      'pending-cliff': 0,
      vesting: 0,
      completed: 0,
      canceled: 0,
    };
    for (const x of withStatus) c[x.status]++;
    return c;
  }, [withStatus]);
  const list = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^#/, '');
    const out = withStatus.filter(
      (x) =>
        (filter === 'all' || x.status === filter) &&
        (!q ||
          x.s.id.toString() === q ||
          x.s.recipient.toLowerCase().includes(q) ||
          x.s.createdBy.toLowerCase().includes(q)),
    );
    if (sort === 'amount')
      out.sort((a, b) => (b.s.originalTotal > a.s.originalTotal ? 1 : b.s.originalTotal < a.s.originalTotal ? -1 : 0));
    else if (sort === 'end') out.sort((a, b) => a.s.end - b.s.end);
    else out.sort((a, b) => Number(b.s.id - a.s.id));
    return out;
  }, [withStatus, filter, sort, query]);

  const openCancel = useCallback((id: bigint) => {
    setTarget(id);
    setSheetOpen(true);
  }, []);
  const closeCancel = useCallback(() => setSheetOpen(false), []);
  const targetStream = streams.find((s) => s.id === target);

  const loading = !!config.vault && !hasEvents && (syncStatus === 'idle' || syncStatus === 'syncing');

  return (
    <Card className={className}>
      <CardHeader
        title="Your streams"
        subtitle="Every payroll stream you fund, ticking in real time"
        icon={<Waves className="size-5" />}
      />

      {!config.vault ? (
        <EmptyState
          title="Vault not deployed yet"
          body="Streams appear here once StreamVault is live on Aevum and you create your first payroll."
        />
      ) : loading ? (
        <SkeletonRows rows={4} />
      ) : streams.length === 0 ? (
        <EmptyState
          title="No streams yet"
          body="Fund your treasury, add recipients above and start your first payroll. It will show up here, ticking every second."
          action={
            <Button variant="secondary" onClick={onCreateFirst}>
              Create your first payroll
            </Button>
          }
        />
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1" role="group" aria-label="Filter by status">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={filter === f.id}
                  onClick={() => {
                    setFilter(f.id);
                    setLimit(PAGE);
                  }}
                  className={cn(
                    'relative inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition',
                    filter === f.id ? 'text-fg' : 'text-muted hover:text-fg',
                  )}
                >
                  {filter === f.id && (
                    <motion.span
                      layoutId="stream-filter"
                      className="absolute inset-0 -z-10 rounded-full bg-surface-2 ring-1 ring-line-strong"
                      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                    />
                  )}
                  {f.label}
                  <span className="font-mono text-[10px] text-faint tabular">{counts[f.id]}</span>
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <div className="relative min-w-0 flex-1 lg:w-64">
                <label htmlFor="stream-search" className="sr-only">
                  Search streams by address or id
                </label>
                <Search
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint"
                  aria-hidden
                />
                <input
                  id="stream-search"
                  type="search"
                  className="input h-9 py-1.5 pl-9 text-sm"
                  placeholder="Address or #id"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <label htmlFor="stream-sort" className="sr-only">
                Sort streams
              </label>
              <select
                id="stream-sort"
                className="input h-9 w-auto py-1 text-sm"
                value={sort}
                onChange={(e) => setSort(e.target.value as Sort)}
              >
                <option value="newest">Newest</option>
                <option value="amount">Amount</option>
                <option value="end">End date</option>
              </select>
            </div>
          </div>

          <p className="sr-only" aria-live="polite">
            Showing {Math.min(limit, list.length)} of {list.length} streams
          </p>

          <div className={cn('hidden px-4 pb-2 text-xs text-faint', GRID)} aria-hidden>
            <span>ID</span>
            <span>Recipient</span>
            <span>Vested</span>
            <span>Progress</span>
            <span>Status</span>
            <span className="text-right">Actions</span>
          </div>

          <LayoutGroup>
            <ul className="space-y-2" aria-label="Streams">
              <AnimatePresence initial={false}>
                {list.slice(0, limit).map(({ s, status }) => (
                  <StreamRow key={s.id.toString()} s={s} status={status} onCancel={openCancel} />
                ))}
              </AnimatePresence>
            </ul>
          </LayoutGroup>

          {list.length === 0 && <p className="py-10 text-center text-sm text-muted">No streams match these filters.</p>}
          {list.length > limit && (
            <div className="mt-4 text-center">
              <Button variant="ghost" size="sm" onClick={() => setLimit((l) => l + PAGE)}>
                Show {Math.min(PAGE, list.length - limit)} more
              </Button>
            </div>
          )}
        </>
      )}

      <CancelSheet stream={targetStream} open={sheetOpen && !!targetStream} onClose={closeCancel} />
    </Card>
  );
}

const StreamRow = memo(function StreamRow({
  s,
  status,
  onCancel,
}: {
  s: StreamView;
  status: StreamStatus;
  onCancel: (id: bigint) => void;
}) {
  const [copied, setCopied] = useState(false);
  const byAgent = !sameAddress(s.createdBy, s.sender);
  const id = s.id.toString();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl(s.id));
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
      toast({ kind: 'info', title: 'Claim link copied', message: `Send it to the recipient of stream #${id}.` }, 3500);
    } catch {
      toast({ kind: 'error', title: 'Could not copy', message: shareUrl(s.id) });
    }
  };
  const showCancel = status === 'pending-cliff' || status === 'vesting';

  return (
    <motion.li
      layout
      layoutId={`stream-${id}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 380, damping: 34 }}
      className={cn(
        'flex flex-col gap-3 rounded-2xl bg-surface p-4 ring-1 ring-line transition-colors hover:bg-surface-2 hover:ring-line-strong',
        GRID,
      )}
    >
      <div className="flex items-center justify-between md:block">
        <span className="font-mono text-sm text-muted">#{id}</span>
        <span className="md:hidden">
          <StatusChip status={status} />
        </span>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Address address={s.recipient} className="text-fg" />
        {byAgent && (
          <span title={`Created by operator ${s.createdBy}`}>
            <Badge tone="violet">
              <Bot className="size-3" aria-hidden /> AI agent
            </Badge>
          </span>
        )}
      </div>
      <LiveCells s={s} status={status} />
      <div className="hidden md:block">
        <StatusChip status={status} />
      </div>
      <div className="flex flex-wrap items-center gap-1 md:justify-end">
        <Link
          to={`/claim/${id}`}
          className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-medium text-muted ring-1 ring-line transition hover:text-fg hover:ring-line-strong"
          aria-label={`Open claim page for stream #${id}`}
        >
          Open <ArrowUpRight className="size-3.5" aria-hidden />
        </Link>
        <button
          type="button"
          onClick={() => void copy()}
          className="grid size-8 place-items-center rounded-lg text-muted ring-1 ring-line transition hover:text-fg hover:ring-line-strong"
          aria-label={`Copy claim link for stream #${id}`}
        >
          {copied ? <Check className="size-3.5 text-mint" /> : <Link2 className="size-3.5" />}
        </button>
        {showCancel && (
          <button
            type="button"
            onClick={() => onCancel(s.id)}
            className={cn(
              'inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-medium ring-1 transition',
              s.cancelable ? 'text-rose ring-rose/30 hover:bg-rose/10' : 'text-faint ring-line hover:text-muted',
            )}
            aria-label={s.cancelable ? `Cancel stream #${id}` : `Stream #${id} is not cancelable`}
          >
            {s.cancelable ? <Ban className="size-3.5" aria-hidden /> : <Lock className="size-3.5" aria-hidden />}
            Cancel
          </button>
        )}
      </div>
    </motion.li>
  );
});

/** The two live-ticking cells. Kept separate so only they re-render every frame, not the animated row. */
function LiveCells({ s, status }: { s: StreamView; status: StreamStatus }) {
  const now = useChainNow(status === 'vesting' ? 'frame' : 'second');
  const vested = vestedAtPrecise(s, now);
  const original = Number(s.originalTotal) || 1;
  const span = Math.max(1, s.end - s.start);
  const when =
    status === 'pending-cliff'
      ? `Cliff in ${fmtDuration(s.cliff - now)}`
      : status === 'vesting'
        ? `Ends in ${fmtDuration(s.end - now)}`
        : status === 'canceled'
          ? `Canceled · ${fmt(s.refunded)} refunded`
          : `Ended ${fmtDate(s.end)}`;
  return (
    <>
      <div className="min-w-0">
        <p className="font-mono text-base text-fg tabular md:text-sm">
          {fmtLive(vested, status === 'vesting' ? 6 : 2)}
          <span className="ml-1 font-sans text-xs text-faint">tUSD8</span>
        </p>
        <p className="font-mono text-xs text-faint tabular">of {fmt(s.originalTotal)}</p>
      </div>
      <div className="min-w-0">
        <StreamProgress
          vestedFraction={vested / original}
          withdrawnFraction={Number(s.withdrawn) / original}
          cliffFraction={(s.cliff - s.start) / span}
          canceled={s.canceled}
          label={`Stream #${s.id.toString()} vesting progress`}
        />
        <p className="mt-1.5 text-xs text-faint">{when}</p>
      </div>
    </>
  );
}
