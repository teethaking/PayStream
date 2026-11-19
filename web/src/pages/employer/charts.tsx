import type { TooltipProps } from 'recharts';
import { DAY } from '@paystream/sdk';

const compactFmt = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
export const fmtCompact = (n: number) => compactFmt.format(n);
const fullFmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const dayFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const yearFmt = new Intl.DateTimeFormat(undefined, { month: 'short', year: '2-digit' });
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
const fullDateFmt = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** Picks an axis label format that fits the span of the chart. */
export function timeTickFormatter(spanSeconds: number) {
  const f = spanSeconds < 2 * DAY ? timeFmt : spanSeconds < 400 * DAY ? dayFmt : yearFmt;
  return (t: number) => f.format(new Date(t * 1000));
}

export const axisTick = { fill: 'var(--ps-faint)', fontSize: 11, fontFamily: 'var(--font-mono)' };

export function ChartTooltip({
  active,
  payload,
  label,
  valueLabel,
}: TooltipProps<number, string> & { valueLabel: string }) {
  if (!active || !payload?.length) return null;
  const v = Number(payload[0]?.value ?? 0);
  return (
    <div className="glass-strong rounded-xl bg-surface-solid/90 px-3 py-2 text-xs shadow-lg">
      <p className="text-faint">{fullDateFmt.format(new Date(Number(label) * 1000))}</p>
      <p className="mt-0.5 font-mono text-sm text-fg tabular">
        {fullFmt.format(v)} <span className="font-sans text-muted">tUSD8</span>
      </p>
      <p className="text-muted">{valueLabel}</p>
    </div>
  );
}

/** Gradient defs shared by both charts. Ids must be unique per chart instance. */
export function ChartDefs({ id }: { id: string }) {
  return (
    <defs>
      <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#7C5CFF" stopOpacity={0.45} />
        <stop offset="100%" stopColor="#22D3EE" stopOpacity={0.02} />
      </linearGradient>
      <linearGradient id={`${id}-stroke`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#7C5CFF" />
        <stop offset="100%" stopColor="#22D3EE" />
      </linearGradient>
    </defs>
  );
}
