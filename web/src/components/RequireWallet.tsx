import type { ReactNode } from 'react';
import { FlaskConical, Wallet } from 'lucide-react';
import { connectInjected, enableBurner, hasInjected, useWallet } from '@/lib/wallet';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { EmptyState } from './ui/EmptyState';

/** Renders children once a wallet (injected or demo burner) is connected. */
export function RequireWallet({ children, purpose }: { children: ReactNode; purpose: string }) {
  const address = useWallet((s) => s.address);
  if (address) return <>{children}</>;
  return (
    <Card className="mx-auto max-w-xl">
      <EmptyState
        title="Connect to continue"
        body={purpose}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button
              magnetic
              icon={<Wallet className="size-4" />}
              onClick={() => void connectInjected()}
              disabled={!hasInjected()}
            >
              Browser wallet
            </Button>
            <Button variant="secondary" icon={<FlaskConical className="size-4" />} onClick={enableBurner}>
              Instant demo
            </Button>
          </div>
        }
      />
    </Card>
  );
}
