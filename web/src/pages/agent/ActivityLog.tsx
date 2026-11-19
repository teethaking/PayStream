import { useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bot, History, ShieldX } from 'lucide-react';
import type { Address, Hex } from 'viem';
import { Card, CardHeader } from '@/components/ui/Card';
import { Address as AddressChip, TxLink } from '@/components/ui/Address';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { useStreams } from '@/hooks/useVault';
import { useChainSeconds } from '@/hooks/useChainNow';
import { useEvents } from '@/lib/events';
import { sameAddress } from '@/lib/derive';
import { fmt, fmtDateTime, timeAgo } from '@/lib/format';
import { config } from '@/config';
import { useAgentUi } from './store';

interface Row {
  key: string;
  kind: 'created' | 'blocked';
  at: number;
  hash: Hex;
  amount: bigint;
  recipient?: Address;
  id?: bigint;
  reason?: string;
}

export function ActivityLog({ employer, agent }: { employer: Address; agent?: Address }) {
  const streams = useStreams();
  const blocked = useAgentUi((s) => s.blocked);
  const status = useEvents((s) => s.status);
  const loaded = useEvents((s) => s.lastSync > 0 || s.events.length > 0);
  const now = useChainSeconds();

  const rows = useMemo<Row[]>(() => {
    if (!agent) return [];
    const created: Row[] = streams
      .filter((s) => sameAddress(s.createdBy, agent) && sameAddress(s.sender, employer))
      .map((s) => ({
        key: 's' + s.id,
        kind: 'created',
        at: s.createdAt,
        hash: s.createdTx,
        amount: s.originalTotal,
        recipient: s.recipient,
        id: s.id,
      }));
    const failed: Row[] = blocked
      .filter((b) => sameAddress(b.agent, agent) && sameAddress(b.employer, employer))
      .map((b) => ({ key: 'b' + b.hash, kind: 'blocked', at: b.at, hash: b.hash, amount: b.amount, reason: b.reason }));
    return [...created, ...failed].sort((a, b) => b.at - a.at).slice(0, 60);
  }, [streams, blocked, agent, employer]);

  const total = rows.filter((r) => r.kind === 'created').reduce((s, r) => s + r.amount, 0n);

  return (
    <Card>
      <CardHeader
        icon={<History className="size-5" aria-hidden />}
        title="Agent activity"
        subtitle="Every stream this agent created from your treasury, plus blocked attempts from this session."
        action={
          rows.length > 0 && (
            <div className="text-right">
              <p className="label">Created total</p>
              <p className="font-mono text-sm tabular">{fmt(total)} tUSD8</p>
            </div>
          )
        }
      />
      {config.vault && !loaded && status !== 'error' ? (
        <SkeletonRows rows={3} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No agent activity yet"
          body={
            config.vault
              ? 'When the agent creates a stream for you, it lands here within seconds, with a link to the transaction.'
              : 'The vault is not deployed in this build, so there is no on-chain activity to show.'
          }
        />
      ) : (
        <ul className="space-y-2" aria-live="polite" aria-relevant="additions">
          <AnimatePresence initial={false}>
            {rows.map((r) => (
              <motion.li
                key={r.key}
                layout
                initial={{ opacity: 0, x: -24, height: 0 }}
                animate={{ opacity: 1, x: 0, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ type: 'spring', stiffness: 320, damping: 30 }}
                className="overflow-hidden"
              >
                <div
                  className={
                    'flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl px-4 py-3 ring-1 ring-inset ' +
                    (r.kind === 'blocked' ? 'bg-rose/8 ring-rose/25' : 'bg-surface ring-line')
                  }
                >
                  <span
                    className={
                      'grid size-9 shrink-0 place-items-center rounded-lg ' +
                      (r.kind === 'blocked' ? 'bg-rose/15 text-rose' : 'bg-violet/15 text-violet')
                    }
                  >
                    {r.kind === 'blocked' ? (
                      <ShieldX className="size-4" aria-hidden />
                    ) : (
                      <Bot className="size-4" aria-hidden />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    {r.kind === 'created' ? (
                      <p className="flex flex-wrap items-center gap-x-2 text-sm">
                        <span className="font-medium">Stream #{String(r.id)}</span>
                        <span className="text-faint" aria-hidden>
                          →
                        </span>
                        <span className="sr-only">to</span>
                        <AddressChip address={r.recipient!} className="text-muted" />
                      </p>
                    ) : (
                      <p className="text-sm font-medium text-rose">Blocked by contract: {r.reason}</p>
                    )}
                    <p className="mt-0.5 text-xs text-faint" title={fmtDateTime(r.at)}>
                      {timeAgo(r.at, now)}
                    </p>
                  </div>
                  <p
                    className={
                      'font-mono text-sm font-medium tabular ' +
                      (r.kind === 'blocked' ? 'text-rose line-through decoration-rose/50' : '')
                    }
                  >
                    {fmt(r.amount)} tUSD8
                  </p>
                  <TxLink hash={r.hash} />
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </Card>
  );
}
