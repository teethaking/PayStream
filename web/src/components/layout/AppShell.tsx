import { useState, type ReactNode } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Activity, Bot, BookOpen, LayoutDashboard, Menu, Wallet2, X, FlaskConical, Droplets } from 'lucide-react';
import { ConnectButton } from './ConnectButton';
import { ThemeToggle } from './ThemeToggle';
import { useWallet } from '@/lib/wallet';
import { useEvents } from '@/lib/events';
import { config } from '@/config';
import { openFaucet } from '@/lib/faucet';
import { cn } from '@/lib/cn';
import { Logo } from './Logo';

const NAV = [
  { to: '/app', label: 'Employer', icon: LayoutDashboard },
  { to: '/app/agent', label: 'AI Agent', icon: Bot },
  { to: '/me', label: 'My streams', icon: Wallet2 },
  { to: '/activity', label: 'Activity', icon: Activity },
  { to: '/docs', label: 'Safety', icon: BookOpen },
];

function SyncPill() {
  const { status, head } = useEvents();
  const tone = status === 'live' ? 'bg-mint' : status === 'error' ? 'bg-rose' : status === 'unconfigured' ? 'bg-faint' : 'bg-amber';
  const text = status === 'live' ? `Aevum · #${head.toString()}` : status === 'unconfigured' ? 'Aevum · vault pending' : status === 'error' ? 'RPC retrying' : 'Syncing…';
  return (
    <span className="hidden items-center gap-2 rounded-full px-3 py-1 font-mono text-[11px] text-muted ring-1 ring-line lg:inline-flex" title={`Chain ${config.chainId}`}>
      <span className={cn('size-1.5 rounded-full', tone, status === 'live' && 'animate-pulse')} aria-hidden />
      {text}
    </span>
  );
}

export function TestnetBanner() {
  const { mode, address } = useWallet();
  if (mode !== 'burner') return null;
  return (
    <div className="relative z-30 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-amber/12 px-4 py-2 text-center text-xs text-amber ring-1 ring-amber/25">
      <FlaskConical className="size-3.5" aria-hidden />
      <strong className="font-semibold tracking-wide">TESTNET ONLY · DEMO MODE</strong>
      <span className="text-amber/90">This burner key lives in your browser. Never send real funds to it.</span>
      <button onClick={() => void openFaucet(address)} className="inline-flex items-center gap-1 underline underline-offset-2">
        <Droplets className="size-3.5" aria-hidden /> Get test funds
      </button>
    </div>
  );
}

function VaultPendingBanner() {
  if (config.vault) return null;
  return (
    <div className="relative z-30 bg-violet/10 px-4 py-2 text-center text-xs text-violet ring-1 ring-violet/20">
      StreamVault is not deployed in this build yet. Pages render, but on-chain actions are disabled until deployments/aevum-44005.json exists.
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only z-50 rounded bg-surface-solid p-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        Skip to content
      </a>
      <TestnetBanner />
      <VaultPendingBanner />
      <header className="sticky top-0 z-30 border-b border-line bg-bg/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5" aria-label="PayStream home">
            <Logo />
            <span className="font-display text-lg font-semibold tracking-tight">PayStream</span>
          </Link>
          <nav className="ml-4 hidden items-center gap-1 md:flex" aria-label="Main">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.to === '/app'} className={({ isActive }) => cn('relative rounded-lg px-3 py-2 text-sm transition', isActive ? 'text-fg' : 'text-muted hover:text-fg')}>
                {({ isActive }) => (
                  <>
                    {isActive && <motion.span layoutId="nav-pill" className="absolute inset-0 -z-10 rounded-lg bg-surface-2 ring-1 ring-line" transition={{ type: 'spring', stiffness: 400, damping: 32 }} />}
                    {n.label}
                  </>
                )}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <SyncPill />
            <ThemeToggle />
            <ConnectButton />
            <button className="grid size-9 place-items-center rounded-xl ring-1 ring-line md:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
              <Menu className="size-4" />
            </button>
          </div>
        </div>
      </header>
      <AnimatePresence>
        {open && (
          <motion.div className="fixed inset-0 z-50 bg-bg/95 backdrop-blur-xl md:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="flex h-16 items-center justify-between px-4">
              <span className="font-display text-lg font-semibold">Menu</span>
              <button onClick={() => setOpen(false)} className="grid size-9 place-items-center rounded-xl ring-1 ring-line" aria-label="Close menu">
                <X className="size-4" />
              </button>
            </div>
            <nav className="space-y-1 px-4" aria-label="Mobile">
              {NAV.map((n, i) => (
                <motion.div key={n.to} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}>
                  <NavLink to={n.to} end={n.to === '/app'} onClick={() => setOpen(false)} className={({ isActive }) => cn('flex items-center gap-3 rounded-xl px-4 py-3.5 text-base', isActive ? 'bg-surface-2 text-fg' : 'text-muted')}>
                    <n.icon className="size-5" aria-hidden />
                    {n.label}
                  </NavLink>
                </motion.div>
              ))}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
      <main id="main" className="flex-1">
        <AnimatePresence mode="wait">
          <motion.div key={loc.pathname.split('/').slice(0, 3).join('/')} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25, ease: 'easeOut' }}>
            {children}
          </motion.div>
        </AnimatePresence>
      </main>
      <footer className="border-t border-line py-8 text-center text-xs text-faint">
        <p>
          PayStream · Aevum Builder Challenge #1 · QDay Aevum testnet (44005) · tUSD8 test tokens only · Unaudited hackathon code · MIT
        </p>
      </footer>
    </div>
  );
}
