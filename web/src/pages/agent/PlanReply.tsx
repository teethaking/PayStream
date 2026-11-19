import { useId, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronDown,
  Code2,
  Droplets,
  PenLine,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import { isAddress, toFunctionSelector, type Address, type Hex } from 'viem';
import { Link } from 'react-router-dom';
import { VAULT_ERROR_MESSAGES } from '@paystream/sdk';
import { Button } from '@/components/ui/Button';
import { Address as AddressChip, TxLink } from '@/components/ui/Address';
import { runTx } from '@/lib/tx';
import { streamVaultAbi } from '@/lib/abi';
import { walletClientFor } from '@/lib/wallet';
import { openFaucet } from '@/lib/faucet';
import { config } from '@/config';
import { cn } from '@/lib/cn';
import { fmt, fmtDateTime } from '@/lib/format';
import { sameAddress } from '@/lib/derive';
import { useBalances, useTreasury } from '@/hooks/useVault';
import { humanSpan, type ParseResult } from './parser';
import { evaluatePlan } from './calldata';
import { TypeText } from './TypeText';
import { getAgentBurner, shakeGauges, useAddressBook, type useOperatorPair } from './store';

type Pair = ReturnType<typeof useOperatorPair>;

const SIGNATURE = 'createStreams(address,(address,uint128,uint40,uint40,uint40,bool)[])';

function intro(p: ParseResult) {
  if (!p.rows.length) return 'I could not turn that into payroll yet.';
  const n = p.rows.length;
  const how = p.mode === 'split' ? ', split evenly' : p.mode === 'each' ? ' (' + fmt(p.rows[0]!.amount) + ' each)' : '';
  const cliff = p.cliffSeconds ? ' with a ' + humanSpan(p.cliffSeconds) + ' cliff' : ' with no cliff';
  return (
    'Here is the plan: ' +
    n +
    ' stream' +
    (n === 1 ? '' : 's') +
    ' totalling ' +
    fmt(p.total) +
    ' tUSD8' +
    how +
    ', vesting over ' +
    humanSpan(p.durationSeconds) +
    cliff +
    ', starting ' +
    fmtDateTime(p.start) +
    (p.cancelable ? '.' : '. Locked: nobody can cancel them.')
  );
}

function UnknownName({ name }: { name: string }) {
  const { set } = useAddressBook();
  const [v, setV] = useState('');
  const ok = isAddress(v.trim(), { strict: false });
  const id = 'resolve-' + name.replace(/\W/g, '-');
  return (
    <form
      className="flex flex-col gap-2 sm:flex-row sm:items-center"
      onSubmit={(e) => {
        e.preventDefault();
        if (ok) set(name, v.trim());
      }}
    >
      <label htmlFor={id} className="text-xs whitespace-nowrap text-amber">
        Who is <strong>{name}</strong>?
      </label>
      <input
        id={id}
        className="input h-9 py-1 font-mono text-xs"
        placeholder={'Paste ' + name + '’s 0x address'}
        value={v}
        onChange={(e) => setV(e.target.value)}
        spellCheck={false}
        aria-invalid={v.length > 0 && !ok}
        autoComplete="off"
      />
      <Button type="submit" size="sm" variant="secondary" disabled={!ok}>
        Save
      </Button>
    </form>
  );
}

export function PlanReply({
  parse,
  employer,
  agent,
  pair,
}: {
  parse: ParseResult;
  employer: Address;
  agent?: Address;
  pair: Pair;
}) {
  const { book } = useAddressBook();
  const reduced = useReducedMotion();
  const [typed, setTyped] = useState(Boolean(reduced));
  const [busy, setBusy] = useState<'employer' | 'agent'>();
  const [sent, setSent] = useState<{ hash: Hex; by: 'employer' | 'agent' }>();
  const burner = getAgentBurner();
  const noteId = useId();
  const burnerGas = useBalances(burner.address).data?.gas;
  const treasury = useTreasury(employer).value;
  const ev = useMemo(
    () => evaluatePlan(parse, book, pair.checkCaps, pair.now, employer),
    [parse, book, pair.checkCaps, pair.now, employer],
  );
  const unknown = ev.rows.filter((r) => !r.address).map((r) => r.label);
  const agentIsBurner = sameAddress(agent, burner.address);
  const blocked = ev.check && !ev.check.ok ? ev.check : undefined;
  const ready = Boolean(ev.params && ev.calldata);
  const short = ready && config.vault && treasury < parse.total;

  const send = async (as: 'employer' | 'agent') => {
    if (!ev.params) return;
    if (as === 'agent' && blocked) {
      shakeGauges();
      return;
    }
    setBusy(as);
    const params = ev.params;
    const res = await runTx({
      title:
        as === 'agent'
          ? 'Agent creates ' + params.length + ' stream' + (params.length === 1 ? '' : 's')
          : 'Create ' + params.length + ' stream' + (params.length === 1 ? '' : 's'),
      wallet: as === 'agent' ? walletClientFor(burner) : undefined,
      successMessage: fmt(parse.total) + ' tUSD8 of payroll is now streaming.',
      call: () => ({
        address: config.vault!,
        abi: streamVaultAbi,
        functionName: 'createStreams',
        args: [employer, params],
      }),
    });
    setBusy(undefined);
    if (res.ok) setSent({ hash: res.hash, by: as });
    else if (res.error.blockedByContract) shakeGauges();
  };

  const blockedRow = blocked ? ev.rows[blocked.index] : undefined;
  const reasonText = blocked ? VAULT_ERROR_MESSAGES[blocked.reason] : undefined;

  return (
    <div className="space-y-4 text-sm">
      <p className="leading-relaxed">
        <TypeText text={intro(parse)} onDone={() => setTyped(true)} />
      </p>

      <motion.div
        initial={reduced ? false : { opacity: 0, y: 6 }}
        animate={typed ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }}
        transition={{ duration: 0.3 }}
        className="space-y-4"
      >
        {ev.rows.length > 0 && (
          <div className="overflow-x-auto rounded-xl ring-1 ring-inset ring-line">
            <table className="w-full min-w-[30rem] text-left text-xs">
              <caption className="sr-only">Parsed streams</caption>
              <thead className="bg-surface-2 text-faint">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">
                    #
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Recipient
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Amount
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Cliff
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Ends
                  </th>
                </tr>
              </thead>
              <tbody>
                {ev.rows.map((r, i) => (
                  <motion.tr
                    key={i}
                    initial={reduced ? false : { opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.05 * i }}
                    className={cn('border-t border-line', blocked && blocked.index === i && 'bg-rose/10')}
                  >
                    <td className="px-3 py-2 font-mono text-faint">{i + 1}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-col">
                        {!r.address || r.address !== r.label ? <span className="font-medium">{r.label}</span> : null}
                        {r.address ? (
                          <AddressChip address={r.address} className="text-muted" />
                        ) : (
                          <span className="text-amber">address needed</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-medium whitespace-nowrap tabular">
                      {fmt(r.amount)}
                    </td>
                    <td className="px-3 py-2 font-mono whitespace-nowrap text-muted">
                      {r.cliffSeconds ? fmtDateTime(r.start + r.cliffSeconds) : 'none'}
                    </td>
                    <td className="px-3 py-2 font-mono whitespace-nowrap text-muted">
                      {fmtDateTime(r.start + r.durationSeconds)}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-line-strong bg-surface-2/60">
                  <td />
                  <td className="px-3 py-2 font-medium">Total</td>
                  <td className="px-3 py-2 text-right font-mono font-semibold whitespace-nowrap tabular">
                    {fmt(parse.total)}
                  </td>
                  <td colSpan={2} className="px-3 py-2 text-faint">
                    tUSD8 · {parse.cancelable ? 'cancelable' : 'locked'}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {unknown.length > 0 && (
          <div className="space-y-2 rounded-xl bg-amber/8 p-3 ring-1 ring-inset ring-amber/25">
            {unknown.map((n) => (
              <UnknownName key={n} name={n} />
            ))}
            <p className="text-[11px] text-faint">Saved names go to your address book in this browser.</p>
          </div>
        )}

        {(parse.warnings.length > 0 || parse.errors.length > 0 || ev.paramError) && (
          <ul className="space-y-1.5">
            {[...parse.errors, ...(ev.paramError ? [ev.paramError] : [])].map((e) => (
              <li key={e} className="flex items-start gap-2 text-xs text-rose">
                <XCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {e}
              </li>
            ))}
            {parse.warnings.map((w) => (
              <li key={w} className="flex items-start gap-2 text-xs text-amber">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {w}
              </li>
            ))}
          </ul>
        )}

        {ev.check && (
          <motion.div
            initial={reduced ? false : { scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className={cn(
              'flex items-start gap-3 rounded-xl p-3 ring-1 ring-inset',
              ev.check.ok ? 'bg-mint/10 ring-mint/30' : 'bg-rose/10 ring-rose/30',
            )}
            role="status"
          >
            {ev.check.ok ? (
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-mint" aria-hidden />
            ) : (
              <ShieldAlert className="mt-0.5 size-5 shrink-0 text-rose" aria-hidden />
            )}
            <div className="min-w-0 text-xs leading-relaxed">
              <p
                className={cn(
                  'font-mono text-sm font-semibold tracking-wider',
                  ev.check.ok ? 'text-mint' : 'text-rose',
                )}
              >
                {ev.check.ok ? 'PASS' : 'BLOCKED'}
              </p>
              {ev.check.ok ? (
                <p className="text-muted">
                  Within the agent’s on-chain limits. After this batch it will have used {fmt(ev.check.spentAfter)} of{' '}
                  {fmt(pair.checkCaps.dailyCap)} tUSD8 today.
                </p>
              ) : (
                <p className="text-muted">
                  <span className="text-fg">{reasonText?.title}</span>
                  {blockedRow &&
                    (blocked!.reason === 'PerStreamCapExceeded' || blocked!.reason === 'DailyCapExceeded') && (
                      <>
                        {' '}
                        at row {blocked!.index + 1} (
                        {blockedRow.label.startsWith('0x') ? blockedRow.label.slice(0, 8) + '…' : blockedRow.label},{' '}
                        {fmt(blockedRow.amount)} tUSD8).
                      </>
                    )}{' '}
                  {blocked!.reason === 'PerStreamCapExceeded'
                    ? 'The per-stream cap is ' + fmt(pair.checkCaps.perStreamCap) + ' tUSD8.'
                    : blocked!.reason === 'DailyCapExceeded'
                      ? 'Only ' + fmt(pair.checkCaps.dailyCap - pair.spent) + ' tUSD8 of today’s cap is left.'
                      : reasonText?.message}{' '}
                  The contract would reject this if the agent sent it. You can still sign it yourself as the employer.
                </p>
              )}
            </div>
          </motion.div>
        )}

        {short && (
          <p className="flex items-start gap-2 text-xs text-amber">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>
              Your treasury holds {fmt(treasury)} tUSD8, less than this batch.{' '}
              <Link to="/app" className="underline underline-offset-2">
                Deposit on the dashboard
              </Link>{' '}
              first.
            </span>
          </p>
        )}

        {ev.calldata && ev.params && (
          <details className="group rounded-xl bg-bg/40 ring-1 ring-inset ring-line">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-xs text-muted hover:text-fg">
              <span className="flex items-center gap-2">
                <Code2 className="size-3.5" aria-hidden /> Exact call:{' '}
                <code className="font-mono text-cyan">createStreams</code>
                <span className="font-mono text-faint">
                  {ev.calldata.slice(0, 10)} · {(ev.calldata.length - 2) / 2} bytes
                </span>
              </span>
              <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <div className="space-y-2 border-t border-line px-3 py-3 font-mono text-[11px] leading-relaxed text-muted">
              <p>
                <span className="text-faint">to </span>
                {config.vault ?? 'StreamVault (not deployed in this build)'}
              </p>
              <p>
                <span className="text-faint">selector </span>
                <span className="text-cyan">{toFunctionSelector(SIGNATURE)}</span>{' '}
                <span className="text-faint">= {SIGNATURE}</span>
              </p>
              <p className="break-all">
                <span className="text-faint">sender </span>
                {employer}
              </p>
              <ol className="space-y-1">
                {ev.params.map((p, i) => (
                  <li key={i} className="break-all">
                    <span className="text-faint">ps[{i}] </span>({p.recipient}, {p.amount.toString()}, {p.start},{' '}
                    {p.cliff}, {p.end}, {String(p.cancelable)})
                  </li>
                ))}
              </ol>
              <p className="text-faint">
                Amounts are base units (6 decimals); times are Unix seconds. Calldata is {(ev.calldata.length - 2) / 2}{' '}
                bytes, encoded locally with viem.
              </p>
            </div>
          </details>
        )}

        {ready && (
          <div className="space-y-2">
            {sent ? (
              <p className="flex flex-wrap items-center gap-2 text-xs text-mint" role="status">
                <CheckCircle2 className="size-4" aria-hidden /> Created by the {sent.by}. <TxLink hash={sent.hash} />
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  loading={busy === 'employer'}
                  disabled={!config.vault || Boolean(busy)}
                  onClick={() => void send('employer')}
                  icon={<PenLine className="size-3.5" aria-hidden />}
                >
                  Sign as employer
                </Button>
                <Button
                  size="sm"
                  loading={busy === 'agent'}
                  disabled={
                    !config.vault || Boolean(busy) || !agentIsBurner || pair.status !== 'active' || burnerGas === 0n
                  }
                  onClick={() => void send('agent')}
                  icon={<Bot className="size-3.5" aria-hidden />}
                  aria-describedby={noteId}
                >
                  Send as agent
                </Button>
              </div>
            )}
            {!sent && (
              <p id={noteId} className="text-[11px] text-faint">
                {!config.vault
                  ? 'Sending is disabled until the vault is deployed.'
                  : !agentIsBurner
                    ? 'Send as agent signs with the browser agent key. Select it above, or let your CLI agent submit this call.'
                    : pair.status !== 'active'
                      ? 'Grant the browser agent access first.'
                      : burnerGas === 0n
                        ? 'The browser agent has no tQDAY for gas.'
                        : blocked
                          ? 'Sending as agent will shake the gauges: the caps block this batch.'
                          : 'Send as agent signs with the browser agent key, within its caps.'}
                {agentIsBurner && burnerGas === 0n && (
                  <button
                    type="button"
                    className="ml-2 inline-flex items-center gap-1 text-cyan underline underline-offset-2"
                    onClick={() => void openFaucet(burner.address)}
                  >
                    <Droplets className="size-3" aria-hidden /> Get test funds
                  </button>
                )}
              </p>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}
