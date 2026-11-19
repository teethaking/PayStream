import { formatAmount } from '@paystream/sdk';

export const shortAddr = (a?: string, n = 4) => (a ? `${a.slice(0, 2 + n)}…${a.slice(-n)}` : '');
export const fmt = (v: bigint, fraction?: number) => formatAmount(v, fraction === undefined ? {} : { fraction });
export const fmtUsd = (v: bigint) => formatAmount(v, { fraction: 2 });

const dtf = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
const dtfTime = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
export const fmtDate = (s: number) => dtf.format(new Date(s * 1000));
export const fmtDateTime = (s: number) => dtfTime.format(new Date(s * 1000));

export function fmtDuration(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  return `${m}m ${sec.toString().padStart(2, '0')}s`;
}

export function timeAgo(s: number, now = Date.now() / 1000) {
  const d = Math.max(0, now - s);
  if (d < 60) return `${Math.floor(d)}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

/** Display-only formatting of a fractional base-unit amount (used by the live tickers). */
export function fmtLive(baseUnits: number, decimals = 6) {
  const v = Math.max(0, baseUnits) / 1e6;
  return v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
