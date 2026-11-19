import { useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { formatEther, type Address } from 'viem';
import { formatAmount } from '@paystream/sdk';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ChevronDown,
  Droplets,
  Fuel,
  Landmark,
  PenLine,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Ticker } from '@/components/ui/Ticker';
import { CountUp } from '@/components/ui/CountUp';
import { Skeleton } from '@/components/ui/Skeleton';
import { Toggle } from '@/components/ui/Toggle';
import { useBalances, useTreasury } from '@/hooks/useVault';
import { openFaucet } from '@/lib/faucet';
import { config } from '@/config';
import { fmt } from '@/lib/format';
import { cn } from '@/lib/cn';
import { AmountInput, checkAmount } from './AmountInput';
import { approveAndDeposit, depositWithPermit, withdrawTreasury } from './actions';

type Tab = 'deposit' | 'withdraw';
const fmt2 = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt4 = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const plain = (v: bigint) => formatAmount(v, { group: false, minFraction: 0 });

export interface DepositPrefill {
  amount: bigint;
  n: number;
}

export function TreasuryCard({
  address,
  prefill,
  className,
}: {
  address: Address;
  prefill?: DepositPrefill;
  className?: string;
}) {
  const treasury = useTreasury(address);
  const balances = useBalances(address);
  const [tab, setTab] = useState<Tab>('deposit');
  const [depositAmount, setDepositAmount] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const depositRef = useRef<HTMLInputElement>(null);
  const tabsId = useId();

  useEffect(() => {
    if (!prefill) return;
    setTab('deposit');
    setDepositAmount(plain(prefill.amount));
    rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const t = setTimeout(() => depositRef.current?.focus({ preventScroll: true }), 450);
    return () => clearTimeout(t);
  }, [prefill]);

  const wallet = balances.data?.token;
  const gas = balances.data?.gas;

  return (
    <Card glow="violet" className={cn('overflow-hidden', className)}>
      <div ref={rootRef} className="scroll-mt-24">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-16 size-64 rounded-full bg-violet/20 blur-3xl"
        />
        <CardHeader
          title="Treasury"
          subtitle="Funds reserved in the vault for your payroll"
          icon={<Landmark className="size-5" />}
        />

        <div aria-live="polite">
          <p className="label">Available in vault</p>
          <div className="mt-2 min-h-12">
            {treasury.loading ? (
              <Skeleton className="h-11 w-56" />
            ) : (
              <Ticker
                text={fmt(treasury.value, 2)}
                suffix="tUSD8"
                className="text-4xl font-semibold text-fg sm:text-5xl"
              />
            )}
          </div>
          {!config.vault && (
            <p className="mt-2 text-xs text-faint">The vault is not deployed yet, so the treasury reads zero.</p>
          )}
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-surface-2/60 p-3 ring-1 ring-line">
            <dt className="flex items-center gap-1.5 text-xs text-muted">
              <Wallet className="size-3.5" aria-hidden /> Wallet tUSD8
            </dt>
            <dd className="mt-1 text-lg text-fg">
              {wallet === undefined ? (
                <Skeleton className="h-6 w-24" />
              ) : (
                <CountUp value={Number(wallet) / 1e6} format={fmt2} />
              )}
            </dd>
          </div>
          <div className="rounded-xl bg-surface-2/60 p-3 ring-1 ring-line">
            <dt className="flex items-center gap-1.5 text-xs text-muted">
              <Fuel className="size-3.5" aria-hidden /> Gas tQDAY
            </dt>
            <dd className="mt-1 flex flex-wrap items-center gap-2 text-lg text-fg">
              {gas === undefined ? (
                <Skeleton className="h-6 w-20" />
              ) : (
                <CountUp value={Number(formatEther(gas))} format={fmt4} />
              )}
              {gas === 0n && (
                <button
                  type="button"
                  onClick={() => void openFaucet(address)}
                  className="inline-flex items-center gap-1 rounded-full bg-amber/12 px-2 py-0.5 text-xs font-medium text-amber ring-1 ring-amber/25"
                >
                  <Droplets className="size-3" aria-hidden /> Get test funds
                </button>
              )}
            </dd>
          </div>
        </dl>

        <div
          role="tablist"
          aria-label="Treasury action"
          className="mt-6 grid grid-cols-2 gap-1 rounded-xl bg-surface-2/60 p-1 ring-1 ring-line"
        >
          {(['deposit', 'withdraw'] as const).map((t) => (
            <button
              key={t}
              role="tab"
              id={`${tabsId}-${t}-tab`}
              aria-selected={tab === t}
              aria-controls={`${tabsId}-panel`}
              onClick={() => setTab(t)}
              className={cn(
                'relative flex h-9 items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors',
                tab === t ? 'text-fg' : 'text-muted hover:text-fg',
              )}
            >
              {tab === t && (
                <motion.span
                  layoutId="treasury-tab"
                  className="absolute inset-0 -z-10 rounded-lg bg-surface-solid shadow ring-1 ring-line-strong"
                  transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                />
              )}
              {t === 'deposit' ? (
                <ArrowDownToLine className="size-4" aria-hidden />
              ) : (
                <ArrowUpFromLine className="size-4" aria-hidden />
              )}
              {t === 'deposit' ? 'Deposit' : 'Withdraw'}
            </button>
          ))}
        </div>

        <div id={`${tabsId}-panel`} role="tabpanel" aria-labelledby={`${tabsId}-${tab}-tab`} className="mt-5">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
            >
              {tab === 'deposit' ? (
                <DepositPane
                  address={address}
                  walletBalance={wallet}
                  amount={depositAmount}
                  setAmount={setDepositAmount}
                  inputRef={depositRef}
                />
              ) : (
                <WithdrawPane treasury={treasury.value} />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </Card>
  );
}

function StepCard({ n, title, body, icon }: { n: number; title: string; body: string; icon: React.ReactNode }) {
  return (
    <li className="flex gap-3 rounded-xl bg-surface p-3 ring-1 ring-line">
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent font-mono text-xs font-semibold text-white">
        {n}
      </span>
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-sm font-medium text-fg">
          {icon}
          {title}
        </p>
        <p className="mt-0.5 text-xs text-muted">{body}</p>
      </div>
    </li>
  );
}

function DepositPane({
  address,
  walletBalance,
  amount,
  setAmount,
  inputRef,
}: {
  address: Address;
  walletBalance?: bigint;
  amount: string;
  setAmount: (v: string) => void;
  inputRef: React.RefObject<HTMLInputElement>;
}) {
  const id = useId();
  const [advanced, setAdvanced] = useState(false);
  const [classic, setClassic] = useState(false);
  const [busy, setBusy] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [shake, setShake] = useState(0);
  const check = checkAmount(amount, walletBalance, 'your wallet balance');
  const error = check.error ?? (attempted && !check.value ? 'Enter an amount' : undefined);

  const submit = async () => {
    setAttempted(true);
    if (!check.value || check.error) {
      setShake((n) => n + 1);
      inputRef.current?.focus();
      return;
    }
    setBusy(true);
    const res = classic ? await approveAndDeposit(address, check.value) : await depositWithPermit(check.value);
    setBusy(false);
    if (res.ok) {
      setAmount('');
      setAttempted(false);
    }
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      noValidate
    >
      <ol className="grid gap-2 sm:grid-cols-2" aria-label="What happens when you deposit">
        {classic ? (
          <>
            <StepCard
              n={1}
              title="Approve"
              body="Transaction 1: lets the vault pull this amount."
              icon={<ShieldCheck className="size-3.5 text-cyan" aria-hidden />}
            />
            <StepCard
              n={2}
              title="Deposit"
              body="Transaction 2: moves tUSD8 into your treasury."
              icon={<ArrowDownToLine className="size-3.5 text-cyan" aria-hidden />}
            />
          </>
        ) : (
          <>
            <StepCard
              n={1}
              title="Sign permit"
              body="Off-chain and free. Authorises exactly this amount for 30 minutes."
              icon={<PenLine className="size-3.5 text-cyan" aria-hidden />}
            />
            <StepCard
              n={2}
              title="Deposit tx"
              body="One transaction moves tUSD8 into your treasury."
              icon={<ArrowDownToLine className="size-3.5 text-cyan" aria-hidden />}
            />
          </>
        )}
      </ol>

      <AmountInput
        id={`${id}-deposit`}
        label="Deposit amount"
        value={amount}
        onChange={(v) => setAmount(v)}
        onMax={walletBalance !== undefined ? () => setAmount(plain(walletBalance)) : undefined}
        error={error}
        hint={walletBalance !== undefined ? `Wallet balance: ${fmt(walletBalance)} tUSD8` : undefined}
        inputRef={inputRef}
        shakeKey={shake}
      />

      <div>
        <button
          type="button"
          onClick={() => setAdvanced((v) => !v)}
          aria-expanded={advanced}
          aria-controls={`${id}-advanced`}
          className="inline-flex items-center gap-1 rounded-md text-xs text-muted hover:text-fg"
        >
          <ChevronDown className={cn('size-3.5 transition-transform', advanced && 'rotate-180')} aria-hidden />
          Advanced
        </button>
        <AnimatePresence initial={false}>
          {advanced && (
            <motion.div
              id={`${id}-advanced`}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-2 flex items-start justify-between gap-4 rounded-xl bg-surface p-3 ring-1 ring-line">
                <div>
                  <label htmlFor={`${id}-classic`} className="text-sm font-medium text-fg">
                    Approve + deposit
                  </label>
                  <p className="mt-0.5 text-xs text-muted">
                    Two transactions, for wallets that cannot sign EIP-712 permits.
                  </p>
                </div>
                <Toggle
                  id={`${id}-classic`}
                  checked={classic}
                  onChange={setClassic}
                  label="Use approve + deposit instead of a permit"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <Button
        type="submit"
        size="lg"
        magnetic
        className="w-full"
        loading={busy}
        disabled={!config.vault}
        icon={classic ? <ShieldCheck className="size-4" /> : <PenLine className="size-4" />}
      >
        {classic ? 'Approve + deposit' : 'Deposit with permit'}
      </Button>
      {!config.vault && <p className="text-center text-xs text-faint">Deposits unlock once the vault is deployed.</p>}
    </form>
  );
}

function WithdrawPane({ treasury }: { treasury: bigint }) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [shake, setShake] = useState(0);
  const check = checkAmount(amount, treasury, 'your treasury');
  const error = check.error ?? (attempted && !check.value ? 'Enter an amount' : undefined);

  const submit = async () => {
    setAttempted(true);
    if (!check.value || check.error) {
      setShake((n) => n + 1);
      inputRef.current?.focus();
      return;
    }
    setBusy(true);
    const res = await withdrawTreasury(check.value);
    setBusy(false);
    if (res.ok) {
      setAmount('');
      setAttempted(false);
    }
  };

  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <p className="text-sm text-muted">
        Move unallocated funds back to your wallet. Money already streaming is not affected.
      </p>
      <AmountInput
        id={`${id}-withdraw`}
        label="Withdraw amount"
        value={amount}
        onChange={setAmount}
        onMax={() => setAmount(plain(treasury))}
        error={error}
        hint={`In treasury: ${fmt(treasury)} tUSD8`}
        inputRef={inputRef}
        shakeKey={shake}
      />
      <Button
        type="submit"
        variant="secondary"
        size="lg"
        className="w-full"
        loading={busy}
        disabled={!config.vault}
        icon={<ArrowUpFromLine className="size-4" />}
      >
        Withdraw to wallet
      </Button>
    </form>
  );
}
