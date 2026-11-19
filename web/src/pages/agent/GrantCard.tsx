import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bot, KeyRound, ShieldCheck } from 'lucide-react';
import { getAddress, isAddress, type Address } from 'viem';
import { useQueryClient } from '@tanstack/react-query';
import { AmountError, parseAmount } from '@paystream/sdk';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { runTx } from '@/lib/tx';
import { streamVaultAbi } from '@/lib/abi';
import { config } from '@/config';
import { fmt, fmtDateTime, shortAddr } from '@/lib/format';
import { sameAddress } from '@/lib/derive';
import { cn } from '@/lib/cn';
import { useChainSeconds } from '@/hooks/useChainNow';
import { getAgentBurner, setAgentInput, useAgentUi, type OperatorStatus } from './store';

const PRESETS = [
  { id: '1h', label: '1 hour', short: '1h', seconds: 3600 },
  { id: '24h', label: '24 hours', short: '24h', seconds: 86_400 },
  { id: '7d', label: '7 days', short: '7d', seconds: 7 * 86_400 },
  { id: 'custom', label: 'Custom date', short: 'Custom', seconds: 0 },
] as const;
type PresetId = (typeof PRESETS)[number]['id'];

const readCap = (raw: string): { value?: bigint; error?: string } => {
  try {
    const value = parseAmount(raw);
    return value > 0n ? { value } : { error: 'Must be greater than zero' };
  } catch (e) {
    return { error: e instanceof AmountError ? e.message : 'Not a valid amount' };
  }
};

const toLocalInput = (s: number) => {
  const d = new Date(s * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    d.getFullYear() +
    '-' +
    pad(d.getMonth() + 1) +
    '-' +
    pad(d.getDate()) +
    'T' +
    pad(d.getHours()) +
    ':' +
    pad(d.getMinutes())
  );
};

/** Swaps in the new value with a short vertical flip so the summary feels live. */
function Live({ children, tone = 'text-fg' }: { children: string; tone?: string }) {
  return (
    <span className="relative inline-flex overflow-hidden align-bottom">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.strong
          key={children}
          initial={{ y: '70%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '-70%', opacity: 0 }}
          transition={{ type: 'spring', stiffness: 420, damping: 32 }}
          className={cn('font-mono font-semibold tabular', tone)}
        >
          {children}
        </motion.strong>
      </AnimatePresence>
    </span>
  );
}

export function GrantCard({ employer, status }: { employer: Address; status: OperatorStatus }) {
  const agentInput = useAgentUi((s) => s.agentInput);
  const burner = getAgentBurner();
  const now = useChainSeconds();
  const qc = useQueryClient();
  const [perStream, setPerStream] = useState('500');
  const [daily, setDaily] = useState('1,000');
  const [preset, setPreset] = useState<PresetId>('24h');
  const [custom, setCustom] = useState(() => toLocalInput(Math.floor(Date.now() / 1000) + 3 * 86_400));
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);

  const per = readCap(perStream);
  const day = readCap(daily);
  const agentOk = isAddress(agentInput.trim(), { strict: false });
  const agentError = !agentInput.trim()
    ? 'Enter the agent address'
    : !agentOk
      ? 'Not a valid address'
      : sameAddress(agentInput.trim(), employer)
        ? 'The agent must be a different key from your own wallet'
        : undefined;

  const expiry = useMemo(() => {
    if (preset !== 'custom') return now + PRESETS.find((p) => p.id === preset)!.seconds;
    const t = Math.floor(new Date(custom).getTime() / 1000);
    return Number.isFinite(t) ? t : 0;
  }, [preset, custom, now]);
  const expiryError =
    expiry <= now + 60
      ? 'Pick a time at least a minute from now'
      : expiry > now + 5 * 365 * 86_400
        ? 'Keep it under 5 years'
        : undefined;
  const capsWarning =
    per.value !== undefined && day.value !== undefined && per.value > day.value
      ? 'The per-stream cap is above the daily cap, so the daily cap is the real limit.'
      : undefined;
  const valid = !agentError && per.value !== undefined && day.value !== undefined && !expiryError;
  const isBurner = agentOk && sameAddress(agentInput.trim(), burner.address);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!valid) return;
    const agent = getAddress(agentInput.trim());
    const finalExpiry =
      preset === 'custom' ? expiry : Math.floor(Date.now() / 1000) + PRESETS.find((p) => p.id === preset)!.seconds;
    setBusy(true);
    await runTx({
      title: status === 'active' ? 'Update agent limits' : 'Grant agent access',
      celebrate: status !== 'active',
      successMessage: shortAddr(agent) + ' can now create streams within your limits.',
      call: () => ({
        address: config.vault!,
        abi: streamVaultAbi,
        functionName: 'setOperator',
        args: [agent, per.value!, day.value!, finalExpiry],
      }),
      onSuccess: () => void qc.invalidateQueries({ queryKey: ['operator'] }),
    });
    setBusy(false);
  };

  return (
    <Card className="h-full">
      <CardHeader
        icon={<KeyRound className="size-5" aria-hidden />}
        title={status === 'active' ? 'Update the grant' : 'Grant operator access'}
        subtitle="A scoped, expiring and revocable payroll key."
      />
      <form onSubmit={submit} noValidate className="space-y-5">
        <Field
          label="Agent address"
          htmlFor="agent-address"
          error={touched || agentInput ? agentError : undefined}
          hint={
            isBurner
              ? 'This is the browser agent key, so it can sign the demo actions below.'
              : 'Any address works, for example the CLI agent. Browser-signed demos need the browser agent.'
          }
        >
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="agent-address"
              className="input font-mono text-sm"
              value={agentInput}
              onChange={(e) => setAgentInput(e.target.value)}
              placeholder="0x…"
              spellCheck={false}
              autoComplete="off"
              aria-invalid={Boolean((touched || agentInput) && agentError)}
              aria-describedby={agentError ? 'agent-address-error' : undefined}
            />
            <Button
              type="button"
              variant="secondary"
              size="md"
              icon={<Bot className="size-4" aria-hidden />}
              onClick={() => setAgentInput(burner.address)}
              disabled={isBurner}
            >
              Use browser agent
            </Button>
          </div>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Per-stream cap (tUSD8)" htmlFor="per-cap" error={touched || perStream ? per.error : undefined}>
            <input
              id="per-cap"
              className="input font-mono tabular"
              inputMode="decimal"
              value={perStream}
              onChange={(e) => setPerStream(e.target.value)}
              aria-invalid={Boolean(per.error)}
            />
          </Field>
          <Field
            label="Daily cap (tUSD8)"
            htmlFor="daily-cap"
            error={touched || daily ? day.error : undefined}
            hint="Resets at 00:00 UTC."
          >
            <input
              id="daily-cap"
              className="input font-mono tabular"
              inputMode="decimal"
              value={daily}
              onChange={(e) => setDaily(e.target.value)}
              aria-invalid={Boolean(day.error)}
            />
          </Field>
        </div>

        <fieldset className="space-y-2">
          <legend className="label mb-1.5 block">Expires</legend>
          <div
            role="radiogroup"
            aria-label="Expiry"
            className="relative grid grid-cols-4 gap-1 rounded-xl bg-surface p-1 ring-1 ring-inset ring-line"
          >
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={preset === p.id}
                aria-label={p.label}
                onClick={() => setPreset(p.id)}
                className={cn(
                  'relative h-9 rounded-lg text-sm font-medium transition-colors',
                  preset === p.id ? 'text-fg' : 'text-muted hover:text-fg',
                )}
              >
                {preset === p.id && (
                  <motion.span
                    layoutId="expiry-pill"
                    className="absolute inset-0 rounded-lg bg-surface-2 shadow-sm ring-1 ring-line-strong"
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  />
                )}
                <span className="relative">{p.short}</span>
              </button>
            ))}
          </div>
          <AnimatePresence initial={false}>
            {preset === 'custom' && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <label htmlFor="custom-expiry" className="sr-only">
                  Custom expiry date and time
                </label>
                <input
                  id="custom-expiry"
                  type="datetime-local"
                  className="input mt-1 font-mono text-sm"
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  aria-invalid={Boolean(expiryError)}
                />
              </motion.div>
            )}
          </AnimatePresence>
          {expiryError && (touched || preset === 'custom') && (
            <p className="text-xs text-rose" role="alert">
              {expiryError}
            </p>
          )}
        </fieldset>

        <div
          className="relative overflow-hidden rounded-2xl bg-violet/8 p-4 ring-1 ring-inset ring-violet/20"
          aria-live="polite"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute -top-10 -right-10 size-32 rounded-full bg-violet/20 blur-3xl"
          />
          <p className="relative flex gap-3 text-sm leading-relaxed text-muted">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-violet" aria-hidden />
            <span>
              This agent can create at most <Live>{per.value !== undefined ? fmt(per.value) + ' tUSD8' : '…'}</Live> per
              stream and <Live>{day.value !== undefined ? fmt(day.value) + ' tUSD8' : '…'}</Live> per day until{' '}
              <Live tone="text-cyan">{expiry > 0 ? fmtDateTime(expiry) : '…'}</Live>, and can never cancel streams or
              withdraw funds.
            </span>
          </p>
        </div>
        {capsWarning && <p className="text-xs text-amber">{capsWarning}</p>}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-faint">
            {status === 'active'
              ? 'Updating replaces the limits and resets today’s spend counter.'
              : config.vault
                ? 'One transaction from your wallet.'
                : 'Disabled until the vault is deployed.'}
          </p>
          <Button
            type="submit"
            magnetic
            loading={busy}
            disabled={!config.vault}
            icon={<KeyRound className="size-4" aria-hidden />}
          >
            {status === 'active' ? 'Update grant' : 'Grant access'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
