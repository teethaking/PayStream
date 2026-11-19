import { useCallback, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import type { Address } from 'viem';
import { Bot } from 'lucide-react';
import { Page } from '@/components/layout/Page';
import { RequireWallet } from '@/components/RequireWallet';
import { useMyStreams } from '@/hooks/useVault';
import { useWallet } from '@/lib/wallet';
import { TreasuryCard, type DepositPrefill } from './TreasuryCard';
import { OutflowCard } from './OutflowCard';
import { PayrollForm } from './PayrollForm';
import { StreamsSection } from './StreamsTable';

const enter = (i: number) => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { delay: 0.06 * i, type: 'spring' as const, stiffness: 260, damping: 30 },
});

export default function EmployerDashboard() {
  return (
    <Page
      title={
        <>
          Payroll <span className="text-gradient">control room</span>
        </>
      }
      subtitle="Fund your treasury, stream salaries by the second and keep every payout in view."
      actions={
        <Link
          to="/app/agent"
          className="glass inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-medium text-fg transition hover:bg-surface-2"
        >
          <Bot className="size-4 text-violet" aria-hidden /> Delegate to AI agent
        </Link>
      }
    >
      <RequireWallet purpose="Connect a wallet (or start the instant demo) to fund a treasury and stream payroll on Aevum.">
        <Dashboard />
      </RequireWallet>
    </Page>
  );
}

function Dashboard() {
  const address = useWallet((s) => s.address) as Address;
  const { employer } = useMyStreams();
  const [prefill, setPrefill] = useState<DepositPrefill>();
  const payrollRef = useRef<HTMLDivElement>(null);
  const requestDeposit = useCallback((amount: bigint) => setPrefill((p) => ({ amount, n: (p?.n ?? 0) + 1 })), []);
  const scrollToPayroll = useCallback(() => {
    payrollRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => payrollRef.current?.querySelector<HTMLElement>('input')?.focus({ preventScroll: true }), 500);
  }, []);

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <motion.div {...enter(0)} className="lg:col-span-5">
        <TreasuryCard address={address} prefill={prefill} className="h-full" />
      </motion.div>
      <motion.div {...enter(1)} className="lg:col-span-7">
        <OutflowCard address={address} streams={employer} className="h-full" />
      </motion.div>
      <motion.div {...enter(2)} ref={payrollRef} className="scroll-mt-24 lg:col-span-12">
        <PayrollForm address={address} onRequestDeposit={requestDeposit} />
      </motion.div>
      <motion.div {...enter(3)} className="lg:col-span-12">
        <StreamsSection streams={employer} onCreateFirst={scrollToPayroll} />
      </motion.div>
    </div>
  );
}
