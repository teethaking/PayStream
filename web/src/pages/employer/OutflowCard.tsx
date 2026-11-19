import { useId, useMemo } from 'react';
import { useReducedMotion } from 'framer-motion';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Address } from 'viem';
import { vestedAtPrecise } from '@paystream/sdk';
import { TrendingUp } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';
import { CountUp } from '@/components/ui/CountUp';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { useChainNow, useChainSeconds } from '@/hooks/useChainNow';
import { useEvents } from '@/lib/events';
import { outflowSeries, type StreamView } from '@/lib/derive';
import { config } from '@/config';
import { fmt, fmtLive } from '@/lib/format';
import { cn } from '@/lib/cn';
import { chartDefs, ChartTooltip, axisTick, fmtCompact, timeTickFormatter } from './charts';

const fmtInt = (n: number) => Math.round(n).toLocaleString('en-US');

export function OutflowCard({
  address,
  streams,
  className,
}: {
  address: Address;
  streams: StreamView[];
  className?: string;
}) {
  const events = useEvents((s) => s.events);
  const status = useEvents((s) => s.status);
  const reduced = useReducedMotion();
  const id = useId().replace(/:/g, '');
  const nowSec = useChainSeconds();
  const minute = Math.floor(nowSec / 60);

  const data = useMemo(() => {
    const series = outflowSeries(events, address);
    if (!series.length) return [];
    const pts = [{ t: series[0]!.t - 60, value: 0 }, ...series.map((p) => ({ t: p.t, value: Number(p.value) / 1e6 }))];
    const end = Math.max(minute * 60, pts[pts.length - 1]!.t);
    pts.push({ t: end, value: pts[pts.length - 1]!.value });
    return pts;
  }, [events, address, minute]);

  const committed = streams.reduce((a, s) => a + s.total, 0n);
  const claimed = streams.reduce((a, s) => a + s.withdrawn, 0n);
  const active = streams.filter((s) => !s.canceled && nowSec < s.end).length;
  const loading = !!config.vault && !events.length && (status === 'idle' || status === 'syncing');
  const first = data[0]?.t ?? 0;
  const last = data[data.length - 1]?.t ?? 0;

  return (
    <Card glow="cyan" className={cn('flex flex-col', className)}>
      <CardHeader
        title="Payroll outflow"
        subtitle="Cumulative tUSD8 committed to streams"
        icon={<TrendingUp className="size-5" />}
      />

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Committed">
          <CountUp value={Number(committed) / 1e6} format={fmtInt} />
        </Stat>
        <Stat label="Vested now" live>
          <LiveVested streams={streams} />
        </Stat>
        <Stat label="Claimed by team">
          <CountUp value={Number(claimed) / 1e6} format={fmtInt} />
        </Stat>
        <Stat label="Active streams">
          <CountUp value={active} />
        </Stat>
      </dl>

      <div className="mt-6 min-h-56 flex-1">
        {loading ? (
          <Skeleton className="h-56 rounded-xl" />
        ) : data.length === 0 ? (
          <EmptyState
            title="Nothing streamed yet"
            body={
              config.vault
                ? 'Your outflow curve draws itself here after the first payroll.'
                : 'The chart activates once the vault is deployed.'
            }
          />
        ) : (
          <div
            className="h-56"
            role="img"
            aria-label={`Cumulative payroll outflow, ${fmt(committed)} tUSD8 committed in total`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                {chartDefs(id)}
                <CartesianGrid stroke="var(--ps-border)" vertical={false} />
                <XAxis
                  dataKey="t"
                  type="number"
                  domain={['dataMin', 'dataMax']}
                  tickFormatter={timeTickFormatter(last - first)}
                  tick={axisTick}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={32}
                />
                <YAxis width={44} tickFormatter={fmtCompact} tick={axisTick} axisLine={false} tickLine={false} />
                <Tooltip
                  content={<ChartTooltip valueLabel="committed so far" />}
                  cursor={{ stroke: 'var(--ps-border-strong)' }}
                />
                <Area
                  type="stepAfter"
                  dataKey="value"
                  stroke={`url(#${id}-stroke)`}
                  strokeWidth={2.5}
                  fill={`url(#${id}-fill)`}
                  isAnimationActive={!reduced}
                  animationDuration={1400}
                  animationEasing="ease-out"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </Card>
  );
}

function Stat({ label, live, children }: { label: string; live?: boolean; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl bg-surface-2/60 p-3 ring-1 ring-line">
      <dt className="flex items-center gap-1.5 text-xs text-muted">
        {live && <span className="size-1.5 animate-pulse rounded-full bg-cyan" aria-hidden />}
        {label}
      </dt>
      <dd className="mt-1 truncate font-mono text-base text-fg tabular sm:text-lg">{children}</dd>
    </div>
  );
}

function LiveVested({ streams }: { streams: StreamView[] }) {
  const now = useChainNow();
  const v = streams.reduce((a, s) => a + vestedAtPrecise(s, now), 0);
  return <span aria-label={`${fmtLive(v, 2)} tUSD8 vested`}>{fmtLive(v, 4)}</span>;
}
