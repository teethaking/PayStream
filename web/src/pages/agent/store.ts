import { useEffect, useMemo } from 'react';
import { create } from 'zustand';
import { getAddress, isAddress, type Address, type Hex } from 'viem';
import { DAY, spentToday as spentTodayOf, type OperatorCaps } from '@paystream/sdk';
import { agentBurnerAccount } from '@/lib/wallet';
import { sameAddress } from '@/lib/derive';
import { useOperatorOnchain, useOperators } from '@/hooks/useVault';
import { useChainSeconds } from '@/hooks/useChainNow';
import type { AddressBook } from './parser';

/** The browser agent key (a separate localStorage burner), created on first visit to this page. */
let burner: ReturnType<typeof agentBurnerAccount>;
export const getAgentBurner = () => (burner ??= agentBurnerAccount(true)!);

export interface BlockedAttempt {
  hash: Hex;
  agent: Address;
  employer: Address;
  amount: bigint;
  reason: string;
  at: number;
}

interface AgentUi {
  /** Raw text of the agent address field; the selected employer/agent pair follows it. */
  agentInput: string;
  /** Largest stream in the assistant's latest draft, for the per-stream gauge. */
  draftMax?: bigint;
  /** Incremented on every blocked attempt to shake the gauges. */
  shakeKey: number;
  blocked: BlockedAttempt[];
}

export const useAgentUi = create<AgentUi>(() => ({ agentInput: getAgentBurner().address, shakeKey: 0, blocked: [] }));
export const setAgentInput = (agentInput: string) => useAgentUi.setState({ agentInput });
export const shakeGauges = () => useAgentUi.setState((s) => ({ shakeKey: s.shakeKey + 1 }));
export const setDraftMax = (draftMax?: bigint) => useAgentUi.setState({ draftMax });
export const addBlocked = (b: BlockedAttempt) => useAgentUi.setState((s) => ({ blocked: [b, ...s.blocked] }));

export function useSelectedAgent(): Address | undefined {
  const input = useAgentUi((s) => s.agentInput).trim();
  return isAddress(input, { strict: false }) ? getAddress(input) : undefined;
}

export type OperatorStatus = 'active' | 'expired' | 'revoked' | 'none';

export const NO_CAPS: OperatorCaps = { perStreamCap: 0n, dailyCap: 0n, expiry: 0, dayIndex: 0, spentToday: 0n };

/**
 * Operator state for one employer/agent pair: the on-chain struct is the truth,
 * the event-derived view fills in while it loads (and when the vault is not configured).
 */
export function useOperatorPair(employer?: Address, agent?: Address) {
  const ops = useOperators();
  const now = useChainSeconds();
  const q = useOperatorOnchain(employer, agent);
  const derived = useMemo(
    () => ops.find((o) => sameAddress(o.employer, employer) && sameAddress(o.operator, agent)),
    [ops, employer, agent],
  );
  const chain = q.data;
  let caps: OperatorCaps | undefined;
  if (chain) caps = chain.expiry > 0 ? chain : undefined;
  else if (derived && !derived.revoked)
    caps = { ...derived, dayIndex: Math.floor(now / DAY), spentToday: derived.spentToday };

  const status: OperatorStatus = caps
    ? now >= caps.expiry
      ? 'expired'
      : 'active'
    : derived?.revoked
      ? 'revoked'
      : 'none';
  return {
    status,
    caps,
    checkCaps: caps ?? NO_CAPS,
    spent: caps ? spentTodayOf(caps, now) : 0n,
    grantedAt: derived && !derived.revoked ? derived.grantedAt : undefined,
    grantedTx: derived?.grantedTx,
    revokedAt: derived?.revokedAt,
    loading: q.isLoading && q.fetchStatus !== 'idle',
    refetch: q.refetch,
    now,
  };
}

const BOOK_KEY = 'ps-agent-address-book';

const readBook = (): AddressBook => {
  try {
    const v = JSON.parse(localStorage.getItem(BOOK_KEY) ?? '{}') as unknown;
    return v && typeof v === 'object' ? (v as AddressBook) : {};
  } catch {
    return {};
  }
};

const useBookStore = create<{ book: AddressBook }>(() => ({ book: readBook() }));

/** Small editable name -> address book, kept in localStorage. */
export function useAddressBook() {
  const book = useBookStore((s) => s.book);
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== BOOK_KEY) return;
      useBookStore.setState({ book: readBook() });
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  const save = (next: AddressBook) => {
    localStorage.setItem(BOOK_KEY, JSON.stringify(next));
    useBookStore.setState({ book: next });
  };
  return {
    book,
    set: (name: string, address: string) => {
      const clean = Object.fromEntries(
        Object.entries(book).filter(([n]) => n.toLowerCase() !== name.trim().toLowerCase()),
      );
      save({ ...clean, [name.trim()]: getAddress(address) });
    },
    remove: (name: string) => save(Object.fromEntries(Object.entries(book).filter(([n]) => n !== name))),
  };
}

/** Exact BigInt ratio as a display float in [0, 1+]. */
export const ratio = (a: bigint, b: bigint) => (b > 0n ? Number((a * 10_000n) / b) / 10_000 : a > 0n ? 1 : 0);
