import { useEffect, useId, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { StreamParams } from '@paystream/sdk';
import { LineChart } from 'lucide-react';
import { fmt, fmtDate } from '@/lib/format';
import { aggregateCurve } from './payroll';
import { ChartDefs, ChartTooltip, axisTick, fmtCompact, timeTickFormatter } from './charts';

/** Aggregate vesting curve of the draft batch. Recomputed 250ms after the last edit so typing never stutters. */
export function VestingPreview({ params }: { params: StreamParams[] }) {
  const reduced = useReducedMotion();
  const id = useId().replace(/:/g, '');
  const [data, setData] = useState(() => aggregateCurve(params));
  useEffect(() => {
    const t = setTimeout(() => setData(aggregateCurve(params)), 250);
    return () => clearTimeout(t);
  }, [params]);

  if (!params.length || !data.length) {
    return (
      <div className="grid h-48 place-items-center rounded-xl border border-dashed border-line-strong text-center">
        <div className="px-6">
          <LineChart className="mx-auto size-6 text-faint" aria-hidden />
          <p className="mt-2 text-sm text-muted">Add a valid recipient to preview how the payroll vests over time.</p>
        </div>
      </div>
    );
  }
  const first = data[0]!.t;
  const last = data[data.length - 1]!.t;
  const total = params.reduce((a, p) => a + p.amount, 0n);
  return (
    <div
      className="h-48"
      role="img"
      aria-label={`Aggregate vesting preview: ${fmt(total)} tUSD8 vests between ${fmtDate(first)} and ${fmtDate(last)}`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <ChartDefs id={id} />
          <CartesianGrid stroke="var(--ps-border)" vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            domain={['dataMin', 'dataMax']}
            tickFormatter={timeTickFormatter(last - first)}
            tick={axisTick}
            tickCount={4}
            axisLine={false}
            tickLine={false}
            minTickGap={24}
          />
          <YAxis width={40} tickFormatter={fmtCompact} tick={axisTick} axisLine={false} tickLine={false} />
          <Tooltip
            content={<ChartTooltip valueLabel="vested across the batch" />}
            cursor={{ stroke: 'var(--ps-border-strong)' }}
          />
          <Area
            type="linear"
            dataKey="vested"
            stroke={`url(#${id}-stroke)`}
            strokeWidth={2.5}
            fill={`url(#${id}-fill)`}
            isAnimationActive={!reduced}
            animationDuration={900}
            animationEasing="ease-out"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
