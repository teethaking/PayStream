import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Ban,
  HandCoins,
  ShieldCheck,
  ShieldOff,
  Waves,
  type LucideIcon,
} from 'lucide-react';
import { formatAmount } from '@paystream/sdk';
import type { VaultEvent, VaultEventName } from '@/lib/events';
import { sameAddress, type StreamView } from '@/lib/derive';
import { fmt, fmtDate, shortAddr } from '@/lib/format';
import { config } from '@/config';

type Tone = 'mint' | 'amber' | 'violet' | 'rose' | 'cyan';

export const EVENT_META: Record<VaultEventName, { label: string; icon: LucideIcon; tone: Tone }> = {
  StreamCreated: { label: 'Stream created', icon: Waves, tone: 'cyan' },
  Withdrawn: { label: 'Withdrawal', icon: HandCoins, tone: 'mint' },
  StreamCanceled: { label: 'Stream canceled', icon: Ban, tone: 'rose' },
  TreasuryDeposited: { label: 'Deposit', icon: ArrowDownToLine, tone: 'violet' },
  TreasuryWithdrawn: { label: 'Treasury withdrawal', icon: ArrowUpFromLine, tone: 'amber' },
  OperatorSet: { label: 'Operator set', icon: ShieldCheck, tone: 'violet' },
  OperatorRevoked: { label: 'Operator revoked', icon: ShieldOff, tone: 'rose' },
};

export const EVENT_ORDER = Object.keys(EVENT_META) as VaultEventName[];

export const TONE_CLASS: Record<Tone, string> = {
  mint: 'bg-mint/12 text-mint ring-mint/25',
  amber: 'bg-amber/12 text-amber ring-amber/25',
  violet: 'bg-violet/12 text-violet ring-violet/25',
  rose: 'bg-rose/12 text-rose ring-rose/25',
  cyan: 'bg-cyan/12 text-cyan ring-cyan/25',
};

type Args = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' ? v : undefined);

export interface Roles {
  employer?: string;
  operator?: string;
  recipient?: string;
  all: string[];
}

/** Who is involved in an event. Withdrawn and StreamCanceled borrow the employer/recipient from the stream they touch. */
export function rolesOf(e: VaultEvent, streams: Map<string, StreamView>): Roles {
  const a = e.args as Args;
  const s = a.id !== undefined ? streams.get(String(a.id)) : undefined;
  const employer = str(a.sender) ?? s?.sender;
  const recipient =
    str(a.recipient) ?? (e.name === 'StreamCanceled' || e.name === 'Withdrawn' ? s?.recipient : undefined);
  const operator =
    str(a.operator) ??
    (e.name === 'StreamCreated' && !sameAddress(str(a.createdBy), employer) ? str(a.createdBy) : undefined);
  const all = [employer, recipient, operator, str(a.createdBy), str(a.triggeredBy)].filter((x): x is string =>
    Boolean(x),
  );
  return { employer, operator, recipient, all };
}

function Who({ a, me }: { a?: string; me?: string }) {
  if (!a) return <span className="text-faint">unknown</span>;
  if (sameAddress(a, me))
    return (
      <span className="font-semibold text-fg" title={a}>
        you
      </span>
    );
  return (
    <span className="font-mono text-[0.92em] text-fg" title={a}>
      {shortAddr(a)}
    </span>
  );
}

function Amt({ v }: { v: unknown }) {
  return (
    <span className="font-mono text-[0.92em] font-medium whitespace-nowrap text-fg tabular">
      {fmt(typeof v === 'bigint' ? v : 0n)} {config.tokenSymbol}
    </span>
  );
}

function StreamRef({ id }: { id: unknown }) {
  return (
    <Link to={`/claim/${String(id)}`} className="font-mono font-medium text-violet underline-offset-2 hover:underline">
      #{String(id)}
    </Link>
  );
}

/** Plain-language sentence for one event. */
export function sentence(e: VaultEvent, me?: string): ReactNode {
  const a = e.args as Args;
  switch (e.name) {
    case 'TreasuryDeposited':
      return (
        <>
          <Who a={str(a.sender)} me={me} /> deposited <Amt v={a.amount} /> into their payroll treasury
        </>
      );
    case 'TreasuryWithdrawn':
      return (
        <>
          <Who a={str(a.sender)} me={me} /> withdrew <Amt v={a.amount} /> from their treasury
        </>
      );
    case 'OperatorSet':
      return (
        <>
          <Who a={str(a.sender)} me={me} /> authorised operator <Who a={str(a.operator)} me={me} /> for up to{' '}
          <Amt v={a.perStreamCap} /> per stream and <Amt v={a.dailyCap} /> per day, until {fmtDate(Number(a.expiry))}
        </>
      );
    case 'OperatorRevoked':
      return (
        <>
          <Who a={str(a.sender)} me={me} /> revoked operator <Who a={str(a.operator)} me={me} />
        </>
      );
    case 'StreamCreated':
      return sameAddress(str(a.createdBy), str(a.sender)) ? (
        <>
          <Who a={str(a.sender)} me={me} /> created a <Amt v={a.amount} /> stream <StreamRef id={a.id} /> for{' '}
          <Who a={str(a.recipient)} me={me} />
        </>
      ) : (
        <>
          Agent <Who a={str(a.createdBy)} me={me} /> created a <Amt v={a.amount} /> stream <StreamRef id={a.id} /> for{' '}
          <Who a={str(a.recipient)} me={me} /> on behalf of <Who a={str(a.sender)} me={me} />
        </>
      );
    case 'Withdrawn':
      return (
        <>
          <Who a={str(a.recipient)} me={me} /> received <Amt v={a.amount} /> from stream <StreamRef id={a.id} />
          {!sameAddress(str(a.triggeredBy), str(a.recipient)) && (
            <>
              , triggered by keeper <Who a={str(a.triggeredBy)} me={me} />
            </>
          )}
        </>
      );
    case 'StreamCanceled':
      return (
        <>
          <Who a={str(a.sender)} me={me} /> canceled stream <StreamRef id={a.id} />: <Amt v={a.paidToRecipient} /> stays
          with the recipient, <Amt v={a.refunded} /> refunded
        </>
      );
    default:
      return e.name;
  }
}

const AMOUNT_KEYS = new Set(['amount', 'perStreamCap', 'dailyCap', 'paidToRecipient', 'refunded']);

const csvCell = (s: string) => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/** CSV of events: block, ISO time, event name, tx hash, then every decoded arg (amounts as exact 6-decimal strings). */
export function eventsToCsv(rows: VaultEvent[]) {
  const argKeys = [...new Set(rows.flatMap((r) => Object.keys(r.args)))];
  const value = (k: string, v: unknown) => {
    if (v === undefined || v === null) return '';
    if (typeof v === 'bigint')
      return AMOUNT_KEYS.has(k) ? formatAmount(v, { fraction: 6, group: false }) : v.toString();
    return String(v);
  };
  const lines = [
    ['block', 'time', 'event', 'tx_hash', ...argKeys],
    ...rows.map((r) => [
      r.blockNumber.toString(),
      new Date(r.timestamp * 1000).toISOString(),
      r.name,
      r.txHash,
      ...argKeys.map((k) => value(k, r.args[k])),
    ]),
  ];
  return lines.map((l) => l.map(csvCell).join(',')).join('\r\n');
}

export function downloadCsv(text: string, filename: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
