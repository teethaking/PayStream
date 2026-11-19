import { Bot } from 'lucide-react';
import { motion } from 'framer-motion';
import { Page } from '@/components/layout/Page';
import { RequireWallet } from '@/components/RequireWallet';
import { Badge } from '@/components/ui/Badge';
import { useWallet } from '@/lib/wallet';
import { useOperators } from '@/hooks/useVault';
import { sameAddress, isOperatorActive } from '@/lib/derive';
import { useChainSeconds } from '@/hooks/useChainNow';
import { shortAddr } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { Address } from 'viem';
import { GrantCard } from './GrantCard';
import { ControlCard } from './ControlCard';
import { ActivityLog } from './ActivityLog';
import { Assistant } from './Assistant';
import { OverspendCard } from './OverspendCard';
import { AgentKeyCard } from './AgentKeyCard';
import { getAgentBurner, setAgentInput, useOperatorPair, useSelectedAgent } from './store';

const rise = (i: number) => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { delay: 0.05 * i, type: 'spring' as const, stiffness: 260, damping: 28 },
});

/** Other agents this employer has granted, as quick-select chips. */
function GrantedAgents({ employer, selected }: { employer: Address; selected?: Address }) {
  const ops = useOperators();
  const now = useChainSeconds();
  const mine = ops.filter((o) => sameAddress(o.employer, employer));
  if (!mine.length) return null;
  const burner = getAgentBurner().address;
  return (
    <div className="mb-6 flex flex-wrap items-center gap-2" role="group" aria-label="Your agents">
      <span className="label mr-1">Your agents</span>
      {mine.map((o) => {
        const active = isOperatorActive(o, now);
        const on = sameAddress(o.operator, selected);
        return (
          <button
            key={o.operator}
            type="button"
            onClick={() => setAgentInput(o.operator)}
            aria-pressed={on}
            className={cn(
              'inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs ring-1 ring-inset transition',
              on ? 'bg-violet/15 text-fg ring-violet/40' : 'bg-surface text-muted ring-line hover:text-fg',
            )}
          >
            <span
              className={cn('size-1.5 rounded-full', active ? 'bg-mint' : o.revoked ? 'bg-rose' : 'bg-amber')}
              aria-hidden
            />
            <span className="font-mono">{shortAddr(o.operator)}</span>
            {sameAddress(o.operator, burner) && <span className="text-faint">browser</span>}
            <span className="sr-only">{active ? 'active' : o.revoked ? 'revoked' : 'expired'}</span>
          </button>
        );
      })}
    </div>
  );
}

function Panel({ employer }: { employer: Address }) {
  const agent = useSelectedAgent();
  const pair = useOperatorPair(employer, agent);
  return (
    <>
      <GrantedAgents employer={employer} selected={agent} />
      <div className="grid grid-cols-1 gap-6 [&>*]:min-w-0 lg:grid-cols-12">
        <motion.div {...rise(0)} className="lg:col-span-7">
          <ControlCard agent={agent} pair={pair} />
        </motion.div>
        <motion.div {...rise(1)} className="lg:col-span-5">
          <GrantCard employer={employer} status={pair.status} />
        </motion.div>
        <motion.div {...rise(2)} className="lg:col-span-7">
          <Assistant employer={employer} agent={agent} pair={pair} />
        </motion.div>
        <motion.div {...rise(3)} className="space-y-6 lg:col-span-5">
          <OverspendCard employer={employer} />
          <AgentKeyCard />
        </motion.div>
        <motion.div {...rise(4)} className="lg:col-span-12">
          <ActivityLog employer={employer} agent={agent} />
        </motion.div>
      </div>
    </>
  );
}

export default function AgentPanel() {
  const employer = useWallet((s) => s.address);
  return (
    <Page
      title={
        <span className="inline-flex items-center gap-3">
          AI Payroll <span className="text-gradient">Agent</span>
        </span>
      }
      subtitle="Give an AI agent a scoped, expiring payroll key. StreamVault enforces every limit on-chain: the agent can create streams within its caps, and can never cancel them or withdraw your funds."
      actions={
        <Badge tone="violet">
          <Bot className="size-3.5" aria-hidden /> Operator role
        </Badge>
      }
    >
      <RequireWallet purpose="Connect the employer wallet that will grant, watch and revoke the agent.">
        {employer && <Panel employer={employer} />}
      </RequireWallet>
    </Page>
  );
}
