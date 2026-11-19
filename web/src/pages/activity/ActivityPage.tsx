import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Check, Download, Filter, RefreshCw, X } from 'lucide-react';
import { toFriendlyError } from '@paystream/sdk';
import { Page } from '@/components/layout/Page';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Toggle } from '@/components/ui/Toggle';
import { TxLink } from '@/components/ui/Address';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useChainSeconds } from '@/hooks/useChainNow';
import { useStreams } from '@/hooks/useVault';
import { refreshEvents, useEvents, type VaultEvent, type VaultEventName } from '@/lib/events';
import { sameAddress, type StreamView } from '@/lib/derive';
import { useWallet } from '@/lib/wallet';
import { timeAgo } from '@/lib/format';
import { cn } from '@/lib/cn';
import { config } from '@/config';
import { EVENT_META, EVENT_ORDER, TONE_CLASS, downloadCsv, eventsToCsv, rolesOf, sentence, type Roles } from './events';

const PAGE = 50;

interface Filters {
  types: VaultEventName[];
  employer: string;
  operator: string;
  recipient: string;
  mine: boolean;
}
const EMPTY: Filters = { types: [], employer: '', operator: '', recipient: '', mine: false };

const addrOk = (q: string) => /^(0x)?[0-9a-f]*$/i.test(q.trim());
const matches = (addr: string | undefined, q: string) => {
  const needle = q.trim().toLowerCase();
  return !needle || Boolean(addr && addr.toLowerCase().includes(needle));
};

export default function ActivityPage() {
  const events = useEvents((s) => s.events);
  const status = useEvents((s) => s.status);
  const streams = useStreams();
  const me = useWallet((s) => s.address);
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [limit, setLimit] = useState(PAGE);

  const streamMap = useMemo(() => new Map<string, StreamView>(streams.map((s) => [s.id.toString(), s])), [streams]);
  const sorted = useMemo(
    () =>
      events
        .map((e) => ({ e, roles: rolesOf(e, streamMap) }))
        .sort((a, b) => Number(b.e.blockNumber - a.e.blockNumber) || b.e.logIndex - a.e.logIndex),
    [events, streamMap],
  );
  const counts = useMemo(() => {
    const c = {} as Record<VaultEventName, number>;
    for (const e of events) c[e.name] = (c[e.name] ?? 0) + 1;
    return c;
  }, [events]);
  const filtered = useMemo(
    () =>
      sorted.filter(
        ({ e, roles }) =>
          (filters.types.length === 0 || filters.types.includes(e.name)) &&
          matches(roles.employer, filters.employer) &&
          matches(roles.operator, filters.operator) &&
          matches(roles.recipient, filters.recipient) &&
          (!filters.mine || roles.all.some((a) => sameAddress(a, me))),
      ),
    [sorted, filters, me],
  );
  const fresh = useFreshKeys(events, status);
  const active = filters.types.length > 0 || filters.employer || filters.operator || filters.recipient || filters.mine;

  const update = (p: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...p }));
    setLimit(PAGE);
  };

  const exportCsv = () => {
    const head = useEvents.getState().head;
    downloadCsv(eventsToCsv(filtered.map((r) => r.e)), `paystream-activity-${head.toString()}.csv`);
  };

  return (
    <Page
      title="Activity"
      subtitle="Every StreamVault event on Aevum, decoded into plain language. Nothing here comes from a server: it is indexed in your browser straight from the chain."
      actions={
        <Button
          variant="secondary"
          icon={<Download className="size-4" />}
          onClick={exportCsv}
          disabled={filtered.length === 0}
        >
          Export CSV
        </Button>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <div className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <SyncPanel />
          <FilterPanel
            filters={filters}
            counts={counts}
            update={update}
            me={me}
            onClear={() => update(EMPTY)}
            active={Boolean(active)}
          />
        </div>

        <section aria-labelledby="timeline-title" className="min-w-0">
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <h2 id="timeline-title" className="text-lg font-semibold">
              Timeline
            </h2>
            <p className="text-sm text-muted" aria-live="polite">
              <span className="font-mono tabular">{filtered.length}</span> of{' '}
              <span className="font-mono tabular">{events.length}</span> events
            </p>
          </div>
          <Timeline
            rows={filtered}
            limit={limit}
            fresh={fresh}
            me={me}
            status={status}
            filtered={Boolean(active)}
            onClear={() => update(EMPTY)}
          />
          {filtered.length > limit && (
            <div className="mt-6 flex justify-center">
              <Button variant="secondary" onClick={() => setLimit((l) => l + PAGE)}>
                Load {Math.min(PAGE, filtered.length - limit)} more
              </Button>
            </div>
          )}
        </section>
      </div>
    </Page>
  );
}

/** Keys of events that arrived after the feed was live on this page, so they can slide in with a highlight. */
function useFreshKeys(events: VaultEvent[], status: string) {
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    if (!seen.current || status !== 'live') {
      seen.current = new Set(events.map((e) => e.key));
      return;
    }
    const added = events.filter((e) => !seen.current!.has(e.key)).map((e) => e.key);
    if (!added.length) return;
    added.forEach((k) => seen.current!.add(k));
    setFresh((f) => new Set([...f, ...added]));
    const t = setTimeout(
      () =>
        setFresh((f) => {
          const n = new Set(f);
          added.forEach((k) => n.delete(k));
          return n;
        }),
      4000,
    );
    return () => clearTimeout(t);
  }, [events, status]);
  return fresh;
}

function SyncPanel() {
  const status = useEvents((s) => s.status);
  const scannedTo = useEvents((s) => s.scannedTo);
  const head = useEvents((s) => s.head);
  const lastSync = useEvents((s) => s.lastSync);
  const progress = useEvents((s) => s.progress);
  const error = useEvents((s) => s.error);
  const [busy, setBusy] = useState(false);
  useChainSeconds();

  const sync = async () => {
    setBusy(true);
    await refreshEvents().catch(() => undefined);
    setBusy(false);
  };

  if (status === 'unconfigured') {
    return (
      <Card>
        <p className="label">Indexer</p>
        <p className="mt-2 text-sm text-muted">
          StreamVault is not deployed in this build, so there is nothing to index yet.
        </p>
      </Card>
    );
  }

  const tone = status === 'live' ? 'bg-mint' : status === 'error' ? 'bg-rose' : 'bg-amber';
  const label =
    status === 'live' ? 'Live' : status === 'error' ? 'RPC error' : status === 'idle' ? 'Starting' : 'Syncing';
  const friendly = error ? toFriendlyError(new Error(error)) : undefined;
  const from = config.deployBlock;
  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5" role="status" aria-live="polite">
          <span className="relative flex size-2.5">
            {status === 'live' && (
              <span className={cn('absolute inline-flex size-full animate-pulse-ring rounded-full', tone)} />
            )}
            <span className={cn('relative inline-flex size-2.5 rounded-full', tone)} />
          </span>
          <span className="font-medium">{label}</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void sync()}
          disabled={busy || status === 'syncing'}
          aria-label="Sync now"
        >
          <RefreshCw className={cn('size-3.5', (busy || status === 'syncing') && 'animate-spin')} aria-hidden />
          Sync
        </Button>
      </div>

      <AnimatePresence initial={false}>
        {(status === 'syncing' || status === 'idle') && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div
              className="mt-4 h-1.5 overflow-hidden rounded-full bg-surface-2"
              role="progressbar"
              aria-label="Indexing progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress * 100)}
            >
              <motion.div
                className="h-full bg-accent"
                animate={{ width: `${Math.max(4, progress * 100)}%` }}
                transition={{ type: 'spring', stiffness: 120, damping: 20 }}
              />
            </div>
            <p className="mt-2 text-xs text-muted">Scanning in 1,000-block chunks… {Math.round(progress * 100)}%</p>
          </motion.div>
        )}
      </AnimatePresence>

      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Scanned</dt>
          <dd className="font-mono text-xs text-fg tabular">
            #{from.toString()} → #{scannedTo >= from ? scannedTo.toString() : '…'}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Chain head</dt>
          <dd className="font-mono text-xs text-fg tabular">{head > 0n ? `#${head.toString()}` : '…'}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Last sync</dt>
          <dd className="font-mono text-xs text-fg tabular">{lastSync ? timeAgo(lastSync / 1000) : 'never'}</dd>
        </div>
      </dl>

      <AnimatePresence>
        {status === 'error' && friendly && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-4 rounded-xl bg-rose/8 p-3 ring-1 ring-rose/25"
            role="alert"
          >
            <p className="flex items-center gap-2 text-sm font-medium text-rose">
              <AlertTriangle className="size-4" aria-hidden /> {friendly.title}
            </p>
            <p className="mt-1 text-xs text-muted">{friendly.message} The indexer keeps retrying with backoff.</p>
            <Button variant="danger" size="sm" className="mt-3" loading={busy} onClick={() => void sync()}>
              Retry now
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

function FilterPanel({
  filters,
  counts,
  update,
  me,
  onClear,
  active,
}: {
  filters: Filters;
  counts: Record<VaultEventName, number>;
  update: (p: Partial<Filters>) => void;
  me?: string;
  onClear: () => void;
  active: boolean;
}) {
  const toggleType = (t: VaultEventName) =>
    update({ types: filters.types.includes(t) ? filters.types.filter((x) => x !== t) : [...filters.types, t] });
  return (
    <Card>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Filter className="size-4 text-violet" aria-hidden /> Filters
        </h2>
        <AnimatePresence>
          {active && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
            >
              <Button variant="ghost" size="sm" onClick={onClear} icon={<X className="size-3.5" />}>
                Clear
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <fieldset>
        <legend className="label mb-2">Event type</legend>
        <div className="flex flex-wrap gap-2">
          {EVENT_ORDER.map((t) => {
            const m = EVENT_META[t];
            const on = filters.types.includes(t);
            const Icon = m.icon;
            return (
              <motion.button
                key={t}
                type="button"
                aria-pressed={on}
                onClick={() => toggleType(t)}
                whileTap={{ scale: 0.95 }}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition-colors',
                  on ? TONE_CLASS[m.tone] : 'text-muted ring-line hover:text-fg hover:ring-line-strong',
                )}
              >
                <span className="relative grid size-3.5 place-items-center">
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.span
                      key={on ? 'on' : 'off'}
                      initial={{ scale: 0, rotate: -90, opacity: 0 }}
                      animate={{ scale: 1, rotate: 0, opacity: 1 }}
                      exit={{ scale: 0, rotate: 90, opacity: 0 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 28 }}
                      className="inline-flex"
                    >
                      {on ? <Check className="size-3.5" aria-hidden /> : <Icon className="size-3.5" aria-hidden />}
                    </motion.span>
                  </AnimatePresence>
                </span>
                {m.label}
                <span className="font-mono text-[10px] opacity-70 tabular">{counts[t] ?? 0}</span>
              </motion.button>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-5 space-y-4">
        {(['employer', 'operator', 'recipient'] as const).map((k) => {
          const bad = !addrOk(filters[k]);
          return (
            <div key={k} className="space-y-1.5">
              <label htmlFor={`f-${k}`} className="label block capitalize">
                {k}
              </label>
              <input
                id={`f-${k}`}
                className="input font-mono text-sm"
                placeholder="0x… (full or partial)"
                autoComplete="off"
                spellCheck={false}
                value={filters[k]}
                aria-invalid={bad || undefined}
                aria-describedby={bad ? `f-${k}-error` : undefined}
                onChange={(e) => update({ [k]: e.target.value })}
              />
              {bad && (
                <p id={`f-${k}-error`} className="text-xs text-rose" role="alert">
                  Use hex characters only, like 0x9f…
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-5 flex items-center justify-between gap-3 border-t border-line pt-4">
        <label htmlFor="f-mine" className="text-sm">
          Only mine
          <span className="block text-xs text-faint">
            {me ? 'Events involving your wallet' : 'Connect a wallet to use this'}
          </span>
        </label>
        <Toggle
          id="f-mine"
          label="Only show events involving my wallet"
          checked={filters.mine && Boolean(me)}
          onChange={(v) => me && update({ mine: v })}
        />
      </div>
    </Card>
  );
}

function Timeline({
  rows,
  limit,
  fresh,
  me,
  status,
  filtered,
  onClear,
}: {
  rows: { e: VaultEvent; roles: Roles }[];
  limit: number;
  fresh: Set<string>;
  me?: string;
  status: string;
  filtered: boolean;
  onClear: () => void;
}) {
  const now = useChainSeconds();
  if (status === 'unconfigured') {
    return (
      <Card>
        <EmptyState
          title="No vault to watch yet"
          body="Once StreamVault is deployed on Aevum, deposits, operator grants, streams and withdrawals appear here in real time."
        />
      </Card>
    );
  }
  if (rows.length === 0) {
    if (status === 'idle' || (status === 'syncing' && !filtered)) return <SkeletonRows rows={6} />;
    return (
      <Card>
        <EmptyState
          title={filtered ? 'No events match these filters' : 'No activity yet'}
          body={
            filtered
              ? 'Try removing a filter or widening an address.'
              : 'The vault is deployed but nothing has happened on it yet.'
          }
          action={
            filtered ? (
              <Button variant="secondary" onClick={onClear}>
                Clear filters
              </Button>
            ) : undefined
          }
        />
      </Card>
    );
  }
  return (
    <ol className="relative space-y-2.5">
      <div
        aria-hidden
        className="absolute top-4 bottom-4 left-[27px] w-px bg-gradient-to-b from-violet/40 via-line-strong to-transparent sm:left-[31px]"
      />
      <AnimatePresence initial={false}>
        {rows.slice(0, limit).map(({ e }) => (
          <EventRow key={e.key} e={e} fresh={fresh.has(e.key)} me={me} now={now} />
        ))}
      </AnimatePresence>
    </ol>
  );
}

function EventRow({ e, fresh, me, now }: { e: VaultEvent; fresh: boolean; me?: string; now: number }) {
  const m = EVENT_META[e.name];
  const Icon = m.icon;
  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: -14, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.15 } }}
      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
      className="glass relative flex gap-3 overflow-hidden p-3 sm:gap-4 sm:p-4"
    >
      <AnimatePresence>
        {fresh && (
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-[inherit] bg-violet/15 ring-1 ring-violet/50 ring-inset"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0.4, 1, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 3, ease: 'easeInOut' }}
          />
        )}
      </AnimatePresence>
      <span
        className={cn(
          'relative z-10 grid size-9 shrink-0 place-items-center rounded-xl ring-1 ring-inset sm:size-10',
          TONE_CLASS[m.tone],
          'bg-surface-solid',
        )}
      >
        <span className={cn('absolute inset-0 rounded-xl', TONE_CLASS[m.tone])} aria-hidden />
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={e.name}
            initial={{ scale: 0.4, rotate: -45, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            exit={{ scale: 0.4, rotate: 45, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 24 }}
            className="relative inline-flex"
          >
            <Icon className="size-4 sm:size-[18px]" aria-hidden />
          </motion.span>
        </AnimatePresence>
      </span>
      <div className="relative min-w-0 flex-1">
        <p className="text-sm leading-relaxed text-muted [overflow-wrap:anywhere]">{sentence(e, me)}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-faint">
          <span className={cn('rounded-full px-2 py-0.5 font-medium ring-1 ring-inset', TONE_CLASS[m.tone])}>
            {m.label}
          </span>
          <time
            dateTime={new Date(e.timestamp * 1000).toISOString()}
            title={new Date(e.timestamp * 1000).toLocaleString()}
          >
            {timeAgo(e.timestamp, now)}
          </time>
          <span className="font-mono tabular">block #{e.blockNumber.toString()}</span>
          <TxLink hash={e.txHash} className="sm:ml-auto" />
        </div>
      </div>
    </motion.li>
  );
}
