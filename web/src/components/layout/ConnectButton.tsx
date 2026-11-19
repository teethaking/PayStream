import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Droplets, FlaskConical, LogOut, Wallet, AlertTriangle } from 'lucide-react';
import { connectInjected, disconnect, enableBurner, hasInjected, switchToAevum, useWallet } from '@/lib/wallet';
import { useBalances } from '@/hooks/useVault';
import { config } from '@/config';
import { fmt, shortAddr } from '@/lib/format';
import { formatEther } from 'viem';
import { Button } from '../ui/Button';
import { openFaucet } from '@/lib/faucet';

export function ConnectButton() {
  const { mode, address, chainId, connecting, error } = useWallet();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const balances = useBalances(address);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const wrong = mode === 'injected' && chainId !== config.chainId;

  if (mode !== 'none' && address && wrong) {
    return (
      <Button variant="danger" size="sm" icon={<AlertTriangle className="size-4" />} onClick={() => void switchToAevum()}>
        Switch to Aevum
      </Button>
    );
  }

  return (
    <div ref={ref} className="relative">
      {mode === 'none' ? (
        <Button size="sm" magnetic loading={connecting} icon={<Wallet className="size-4" />} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu">
          Connect
        </Button>
      ) : (
        <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu" className="glass flex h-9 items-center gap-2 rounded-xl px-3 text-sm">
          <span className={`size-2 rounded-full ${mode === 'burner' ? 'bg-amber' : 'bg-mint'}`} aria-hidden />
          <span className="font-mono text-xs">{shortAddr(address)}</span>
          <ChevronDown className="size-3.5 text-muted" aria-hidden />
        </button>
      )}
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            className="glass-strong absolute right-0 z-50 mt-2 w-72 bg-surface-solid/95 p-2"
          >
            {mode === 'none' ? (
              <>
                <MenuItem
                  icon={<Wallet className="size-4" />}
                  title={hasInjected() ? 'Browser wallet' : 'Browser wallet (not found)'}
                  body="MetaMask, Rabby or any EIP-1193 wallet. Adds Aevum 44005 for you."
                  onClick={() => {
                    setOpen(false);
                    void connectInjected();
                  }}
                  disabled={!hasInjected()}
                />
                <MenuItem
                  icon={<FlaskConical className="size-4" />}
                  title="Demo mode (burner)"
                  body="Throwaway key in this browser. Testnet only."
                  onClick={() => {
                    setOpen(false);
                    enableBurner();
                  }}
                />
                {error && <p className="px-3 py-2 text-xs text-rose">{error}</p>}
              </>
            ) : (
              <>
                <div className="px-3 py-2">
                  <p className="text-xs text-muted">{mode === 'burner' ? 'Demo burner wallet' : 'Browser wallet'}</p>
                  <p className="mt-1 font-mono text-xs break-all">{address}</p>
                  <div className="mt-2 grid grid-cols-2 gap-2 font-mono text-xs">
                    <div className="rounded-lg bg-surface-2 p-2">
                      <p className="text-faint">tQDAY</p>
                      <p className="tabular">{balances.data ? Number(formatEther(balances.data.gas)).toFixed(4) : '…'}</p>
                    </div>
                    <div className="rounded-lg bg-surface-2 p-2">
                      <p className="text-faint">tUSD8</p>
                      <p className="tabular">{balances.data ? fmt(balances.data.token) : '…'}</p>
                    </div>
                  </div>
                </div>
                <MenuItem icon={<Droplets className="size-4" />} title="Get test funds" body="Copies your address and opens the faucet." onClick={() => void openFaucet(address)} />
                <MenuItem
                  icon={<LogOut className="size-4" />}
                  title="Disconnect"
                  onClick={() => {
                    setOpen(false);
                    disconnect();
                  }}
                />
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MenuItem({ icon, title, body, onClick, disabled }: { icon: React.ReactNode; title: string; body?: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button role="menuitem" disabled={disabled} onClick={onClick} className="flex w-full items-start gap-3 rounded-xl p-3 text-left transition hover:bg-surface-2 disabled:opacity-50">
      <span className="mt-0.5 text-violet">{icon}</span>
      <span>
        <span className="block text-sm font-medium">{title}</span>
        {body && <span className="block text-xs text-muted">{body}</span>}
      </span>
    </button>
  );
}
