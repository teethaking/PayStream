import { motion } from 'framer-motion';
import { Activity, Bot, Users, Waves } from 'lucide-react';
import type { ReactNode } from 'react';
import { CountUp } from '@/components/ui/CountUp';
import { Skeleton } from '@/components/ui/Skeleton';
import { Badge } from '@/components/ui/Badge';
import { useStats } from '@/hooks/useVault';
import { useEvents } from '@/lib/events';
import { config } from '@/config';

const integer = (n: number) => Math.round(n).toLocaleString('en-US');
const money = (n: number) =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toLocaleString('en-US', { maximumFractionDigits: 2 })}M`
    : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Stat({ i, icon, label, children }: { i: number; icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: i * 0.08, duration: 0.5 }}
      className="glass relative overflow-hidden p-5 sm:p-6"
    >
      <div className="flex items-center gap-2 text-sm text-muted">
        <span className="text-cyan" aria-hidden>
          {icon}
        </span>
        {label}
      </div>
      <div className="mt-3 font-mono text-2xl font-semibold tabular sm:text-3xl">{children}</div>
    </motion.div>
  );
}

export function LiveStats() {
  const stats = useStats();
  const status = useEvents((s) => s.status);
  const hasEvents = useEvents((s) => s.events.length > 0);
  const pending = !config.vault;
  const loading = !pending && !hasEvents && (status === 'idle' || status === 'syncing');

  const value = (n: number, format: (n: number) => string) => {
    if (pending) return <span className="text-faint">—</span>;
    if (loading) return <Skeleton className="h-8 w-24" />;
    return <CountUp value={n} format={format} />;
  };

  const statusLine = pending
    ? 'StreamVault deployment pending. Numbers appear here as soon as the contract is live.'
    : loading
      ? 'Syncing events from QDay Aevum…'
      : status === 'error'
        ? 'RPC is retrying. Showing the last synced numbers.'
        : 'Live from QDay Aevum testnet, read straight from on-chain events.';

  return (
    <section aria-labelledby="stats-title" className="mx-auto max-w-7xl px-4 sm:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-xs tracking-[0.2em] text-cyan uppercase">On-chain right now</p>
          <h2 id="stats-title" className="mt-3 text-3xl font-semibold sm:text-4xl">
            Live testnet stats
          </h2>
        </div>
        <div aria-live="polite" className="flex items-center gap-2">
          {pending ? (
            <Badge tone="violet">Vault deployment pending</Badge>
          ) : loading ? (
            <Badge tone="amber" pulse>
              Syncing
            </Badge>
          ) : status === 'error' ? (
            <Badge tone="rose">RPC retrying</Badge>
          ) : (
            <Badge tone="mint" pulse>
              Live
            </Badge>
          )}
        </div>
      </div>
      <p className="mt-3 text-sm text-muted">{statusLine}</p>
      <div className="mt-8 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4" aria-busy={loading || undefined}>
        <Stat i={0} icon={<Waves className="size-4" />} label="Total streams">
          {value(stats.streams, integer)}
        </Stat>
        <Stat i={1} icon={<Activity className="size-4" />} label={`${config.tokenSymbol} streamed`}>
          {value(Number(stats.streamed) / 1e6, money)}
        </Stat>
        <Stat i={2} icon={<Bot className="size-4" />} label="Active AI operators">
          {value(stats.activeOperators, integer)}
        </Stat>
        <Stat i={3} icon={<Users className="size-4" />} label="Recipients">
          {value(stats.recipients, integer)}
        </Stat>
      </div>
    </section>
  );
}
