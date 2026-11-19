import { Bot, Droplets, Fuel, Terminal } from 'lucide-react';
import { formatEther } from 'viem';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Address as AddressChip } from '@/components/ui/Address';
import { Skeleton } from '@/components/ui/Skeleton';
import { useBalances } from '@/hooks/useVault';
import { openFaucet } from '@/lib/faucet';
import { sameAddress } from '@/lib/derive';
import { getAgentBurner, setAgentInput, useAgentUi } from './store';

export function AgentKeyCard() {
  const burner = getAgentBurner();
  const bal = useBalances(burner.address);
  const selected = useAgentUi((s) => s.agentInput);
  const gas = bal.data?.gas;
  const empty = gas === 0n;
  return (
    <Card>
      <CardHeader
        icon={<Bot className="size-5" aria-hidden />}
        title="Browser agent key"
        subtitle="A separate testnet burner in this browser that plays the AI agent."
        action={sameAddress(selected.trim(), burner.address) ? <Badge tone="violet">Selected</Badge> : undefined}
      />
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface p-3 ring-1 ring-inset ring-line">
          <AddressChip address={burner.address} className="text-sm" />
          {!sameAddress(selected.trim(), burner.address) && (
            <Button size="sm" variant="ghost" onClick={() => setAgentInput(burner.address)}>
              Use as agent
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="label flex items-center gap-1.5">
              <Fuel className="size-3.5" aria-hidden /> Gas balance
            </p>
            {bal.isLoading ? (
              <Skeleton className="mt-1.5 h-6 w-28" />
            ) : (
              <p className={'mt-1 font-mono text-lg tabular ' + (empty ? 'text-amber' : '')}>
                {gas !== undefined ? Number(formatEther(gas)).toFixed(4) : '—'}{' '}
                <span className="text-xs text-muted">tQDAY</span>
              </p>
            )}
          </div>
          <Button
            size="sm"
            variant={empty ? 'primary' : 'secondary'}
            icon={<Droplets className="size-3.5" aria-hidden />}
            onClick={() => void openFaucet(burner.address)}
          >
            Get test funds
          </Button>
        </div>
        {empty && (
          <p className="text-xs text-amber">
            The agent key needs a little tQDAY to sign. Without it, the demos below still simulate.
          </p>
        )}
        <p className="flex items-start gap-2 text-[11px] leading-relaxed text-faint">
          <Terminal className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Running the CLI agent instead? Paste its address into the grant form; it signs with its own key and its
          streams appear in the activity log.
        </p>
      </div>
    </Card>
  );
}
