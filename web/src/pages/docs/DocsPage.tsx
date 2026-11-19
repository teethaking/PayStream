import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, ArrowRight, FileSignature, Send, ShieldCheck } from 'lucide-react';
import { parseAmount } from '@paystream/sdk';
import { Page } from '@/components/layout/Page';
import { cn } from '@/lib/cn';
import { fmt } from '@/lib/format';
import { RoleDiagram } from './RoleDiagram';
import { CapExplainer } from './CapExplainer';
import { ACTIONS, MATRIX, ROLES, type Kind } from './model';

const SECTIONS = [
  { id: 'roles', label: 'Who can do what' },
  { id: 'matrix', label: 'Permissions matrix' },
  { id: 'caps', label: 'Cap math' },
  { id: 'cancel', label: 'Cancel split' },
  { id: 'permit', label: 'Permit flow' },
  { id: 'limits', label: 'Known limits' },
];

function Section({ id, title, kicker, children }: { id: string; title: string; kicker?: string; children: ReactNode }) {
  return (
    <motion.section
      id={id}
      aria-labelledby={`${id}-title`}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5 }}
      className="scroll-mt-24"
    >
      {kicker && <p className="font-mono text-xs tracking-[0.2em] text-cyan uppercase">{kicker}</p>}
      <h2 id={`${id}-title`} className="mt-2 text-2xl font-semibold sm:text-3xl">
        {title}
      </h2>
      <div className="mt-5 space-y-4 leading-relaxed text-muted">{children}</div>
    </motion.section>
  );
}

const cellMeta: Record<Kind, { symbol: string; label: string; tone: string }> = {
  allow: { symbol: '✓', label: 'Yes', tone: 'text-mint' },
  scoped: { symbol: '✓', label: 'Within caps', tone: 'text-cyan' },
  self: { symbol: '–', label: 'Own account only', tone: 'text-faint' },
  deny: { symbol: '✕', label: 'Reverts', tone: 'text-rose' },
};

function Matrix() {
  return (
    <div className="glass overflow-x-auto p-0" tabIndex={0} role="region" aria-label="Permissions matrix, scrollable">
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">
        <caption className="sr-only">
          Which role can call which StreamVault function, against an employer&apos;s treasury and streams
        </caption>
        <thead>
          <tr className="border-b border-line">
            <th scope="col" className="px-4 py-3 font-medium text-muted">
              Action
            </th>
            {ROLES.map((r) => (
              <th key={r.id} scope="col" className="px-4 py-3 font-medium text-fg">
                <span className="inline-flex items-center gap-1.5">
                  <r.icon className="size-4 text-violet" aria-hidden />
                  {r.label}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ACTIONS.map((a) => (
            <tr key={a.id} className="border-b border-line last:border-0 hover:bg-surface">
              <th scope="row" className="px-4 py-3 align-top font-normal">
                <span className="block text-fg">{a.label}</span>
                <code className="font-mono text-xs text-faint">{a.fn}</code>
              </th>
              {ROLES.map((r) => {
                const v = MATRIX[r.id][a.id];
                const m = cellMeta[v.kind];
                return (
                  <td key={r.id} className="px-4 py-3 align-top">
                    <span className={cn('inline-flex items-center gap-1.5 font-medium', m.tone)}>
                      <span aria-hidden>{m.symbol}</span>
                      {m.label}
                    </span>
                    {v.kind === 'deny' && v.error && (
                      <code className="mt-0.5 block font-mono text-xs text-rose/80">{v.error}</code>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CancelSplit() {
  const total = parseAmount('3000');
  const vested = (total * 40n) / 100n;
  const withdrawn = parseAmount('500');
  const claimable = vested - withdrawn;
  const refund = total - vested;
  const parts = [
    { label: 'Already withdrawn', value: withdrawn, tone: 'bg-mint', text: 'text-mint' },
    { label: 'Vested, still claimable by the recipient', value: claimable, tone: 'bg-cyan', text: 'text-cyan' },
    { label: 'Unvested, refunded to the employer', value: refund, tone: 'bg-violet/70', text: 'text-violet' },
  ];
  return (
    <div className="glass p-4 sm:p-6">
      <p className="text-sm">
        A <span className="font-mono text-fg tabular">{fmt(total)}</span> tUSD8 stream is canceled 40% of the way
        through, after the recipient already claimed <span className="font-mono text-fg tabular">{fmt(withdrawn)}</span>
        .
      </p>
      <div className="mt-5 flex h-4 overflow-hidden rounded-full ring-1 ring-line" aria-hidden>
        {parts.map((p, i) => (
          <motion.div
            key={p.label}
            className={cn('h-full', p.tone)}
            initial={{ width: 0 }}
            whileInView={{ width: `${Number((p.value * 1000n) / total) / 10}%` }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.2, duration: 0.6 }}
          />
        ))}
      </div>
      <dl className="mt-5 grid gap-3 sm:grid-cols-3">
        {parts.map((p) => (
          <div key={p.label} className="rounded-xl bg-surface p-3 ring-1 ring-line">
            <dt className="text-xs text-muted">{p.label}</dt>
            <dd className={cn('mt-1 font-mono text-lg font-semibold tabular', p.text)}>{fmt(p.value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function PermitFlow() {
  const steps = [
    {
      icon: FileSignature,
      title: 'Sign',
      body: 'The wallet signs an EIP-2612 permit for exactly the deposit amount. Off-chain, no gas.',
    },
    {
      icon: Send,
      title: 'Submit',
      body: 'One depositWithPermit transaction applies the permit and pulls the tokens in.',
    },
    { icon: ShieldCheck, title: 'Credited', body: 'Your treasury balance grows and TreasuryDeposited is emitted.' },
  ];
  return (
    <ol className="grid gap-3 sm:grid-cols-3">
      {steps.map((s, i) => (
        <li key={s.title} className="glass relative p-5">
          <div className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-full bg-accent font-mono text-xs font-semibold text-white">
              {i + 1}
            </span>
            <s.icon className="size-4 text-cyan" aria-hidden />
            <span className="font-semibold text-fg">{s.title}</span>
          </div>
          <p className="mt-3 text-sm">{s.body}</p>
          {i < steps.length - 1 && (
            <ArrowRight
              className="absolute top-1/2 -right-3 hidden size-4 -translate-y-1/2 text-faint sm:block"
              aria-hidden
            />
          )}
        </li>
      ))}
    </ol>
  );
}

const LIMITS: { title: string; body: ReactNode }[] = [
  {
    title: 'Unaudited hackathon code',
    body: 'StreamVault has tests but no professional audit. Treat it as a prototype.',
  },
  {
    title: 'Testnet only',
    body: 'Deployed on QDay Aevum testnet (chain 44005) with tUSD8 test tokens that have no value.',
  },
  {
    title: 'No admin keys, no upgrades',
    body: 'Nobody can pause, upgrade or rescue funds. That removes a trusted party, and also means bugs cannot be patched in place.',
  },
  { title: 'One token', body: 'The vault is bound to a single ERC-20 (tUSD8, 6 decimals) at deployment.' },
  {
    title: 'Block timestamps',
    body: 'Vesting and the UTC day boundary use block.timestamp, so they can drift by a few seconds within what validators allow.',
  },
  {
    title: 'Operator key compromise',
    body: 'If the agent key leaks, an attacker can create streams up to the caps until the employer revokes it or it expires. Keep caps and expiry tight.',
  },
];

export default function DocsPage() {
  return (
    <Page
      title={
        <>
          Safety <span className="text-gradient">model</span>
        </>
      }
      subtitle="PayStream lets an AI agent run payroll without trusting the agent. Every limit below is enforced by the StreamVault contract, not by the app or the model's prompt."
    >
      <div className="grid gap-12 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-16">
        <nav aria-label="On this page" className="hidden lg:block">
          <ul className="sticky top-24 space-y-1 border-l border-line text-sm">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="-ml-px block border-l border-transparent py-1.5 pl-4 text-muted transition hover:border-violet hover:text-fg"
                >
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 space-y-20">
          <Section id="roles" kicker="Interactive" title="Who can do what">
            <p>
              Four kinds of actors touch the vault. Money only ever moves in three directions: into an employer&apos;s
              treasury, from the treasury into a stream, and from a stream to its recipient (or back to the employer on
              cancel). The agent sits on exactly one of those arrows.
            </p>
            <RoleDiagram />
          </Section>

          <Section id="matrix" title="Permissions matrix">
            <p>
              The same rules as a table. &ldquo;Own account only&rdquo; means the call succeeds but only touches the
              caller&apos;s own treasury or operator list, never the employer&apos;s.
            </p>
            <Matrix />
          </Section>

          <Section id="caps" kicker="Plain maths" title="How the caps are counted">
            <ul className="list-disc space-y-2 pl-5 marker:text-violet">
              <li>
                <strong className="text-fg">Per-stream cap.</strong> Every single stream the agent creates must be at or
                below this amount.
              </li>
              <li>
                <strong className="text-fg">Daily cap.</strong> The total the agent creates in one UTC day. The day is{' '}
                <code className="font-mono text-sm text-fg">block.timestamp / 86400</code>, so the counter resets at
                00:00 UTC, not at your local midnight.
              </li>
              <li>
                <strong className="text-fg">Re-granting resets the day.</strong> Calling{' '}
                <code className="font-mono text-sm text-fg">setOperator</code> again replaces the grant and zeroes
                today&apos;s counter. Only the employer can do that, and it is the documented way to give the agent
                fresh budget.
              </li>
              <li>
                <strong className="text-fg">Batches are checked row by row.</strong> In{' '}
                <code className="font-mono text-sm text-fg">createStreams</code>, each row is checked against both caps
                with the running total so far. If any row fails, the whole transaction reverts.
              </li>
              <li>
                <strong className="text-fg">Expiry is strict.</strong> At or after the expiry timestamp every agent call
                reverts with <code className="font-mono text-sm text-rose">OperatorExpired</code>.
              </li>
            </ul>
            <CapExplainer />
          </Section>

          <Section id="cancel" title="What happens on cancel">
            <p>
              Only the employer who funded a stream can cancel it, and only if it was created as cancelable. Whatever
              has vested up to that second belongs to the recipient and stays claimable; only the unvested remainder
              goes back to the employer. Streams created as non-cancelable revert with{' '}
              <code className="font-mono text-sm text-rose">NotCancelable</code> forever.
            </p>
            <CancelSplit />
          </Section>

          <Section id="permit" title="One-signature funding">
            <p>
              Depositing uses tUSD8&apos;s EIP-2612 permit so funding is one signature plus one transaction, with an
              allowance for the exact amount instead of an open-ended approval.
            </p>
            <PermitFlow />
            <div className="glass flex gap-3 p-4 text-sm">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-mint" aria-hidden />
              <p>
                <strong className="text-fg">Front-run tolerant.</strong> Permit signatures are public once in the
                mempool, so someone could submit yours first. That would normally make the deposit revert. StreamVault
                catches the failed permit and continues if the allowance is already high enough, so a griefer cannot
                block your deposit. If the allowance is missing it reverts with{' '}
                <code className="font-mono text-rose">NotAuthorized</code>.
              </p>
            </div>
          </Section>

          <Section id="limits" kicker="Honesty" title="Known limits">
            <ul className="grid gap-3 sm:grid-cols-2">
              {LIMITS.map((l) => (
                <li key={l.title} className="glass flex gap-3 p-4">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber" aria-hidden />
                  <div>
                    <p className="font-semibold text-fg">{l.title}</p>
                    <p className="mt-1 text-sm">{l.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      </div>
    </Page>
  );
}
