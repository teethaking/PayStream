import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Address } from 'viem';
import { useEvents } from '@/lib/events';
import { deriveOperators, deriveStats, deriveStreams, deriveTreasury, sameAddress } from '@/lib/derive';
import { publicClient } from '@/lib/clients';
import { erc20Abi, streamVaultAbi } from '@/lib/abi';
import { config } from '@/config';
import { useWallet } from '@/lib/wallet';
import { useChainSeconds } from './useChainNow';

export function useStreams() {
  const events = useEvents((s) => s.events);
  return useMemo(() => deriveStreams(events), [events]);
}

export function useStream(id?: bigint) {
  const streams = useStreams();
  return useMemo(() => (id === undefined ? undefined : streams.find((s) => s.id === id)), [streams, id]);
}

export function useMyStreams() {
  const address = useWallet((s) => s.address);
  const streams = useStreams();
  return useMemo(
    () => ({
      employer: streams.filter((s) => sameAddress(s.sender, address)),
      recipient: streams.filter((s) => sameAddress(s.recipient, address)),
    }),
    [streams, address],
  );
}

export function useOperators() {
  const events = useEvents((s) => s.events);
  const now = useChainSeconds();
  const day = Math.floor(now / 60);
  // recompute each minute (or on new events), not every second
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => deriveOperators(events, now), [events, day]);
}

export function useStats() {
  const events = useEvents((s) => s.events);
  const now = useChainSeconds();
  const minute = Math.floor(now / 60);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => deriveStats(events, now), [events, minute]);
}

export function useDerivedTreasury(employer?: Address) {
  const events = useEvents((s) => s.events);
  return useMemo(() => deriveTreasury(events, employer), [events, employer]);
}

/** On-chain truth for the employer's treasury, re-synced every 15s. */
export function useTreasury(employer?: Address) {
  const derived = useDerivedTreasury(employer);
  const q = useQuery({
    queryKey: ['treasury', employer],
    enabled: Boolean(employer && config.vault),
    queryFn: () => publicClient.readContract({ address: config.vault!, abi: streamVaultAbi, functionName: 'treasury', args: [employer!] }),
    refetchInterval: config.resyncMs,
  });
  return { value: q.data ?? derived, loading: q.isLoading && Boolean(employer && config.vault) };
}

export function useBalances(address?: Address) {
  return useQuery({
    queryKey: ['balances', address],
    enabled: Boolean(address),
    refetchInterval: config.resyncMs,
    queryFn: async () => {
      const [gas, token] = await Promise.all([
        publicClient.getBalance({ address: address! }),
        publicClient.readContract({ address: config.token, abi: erc20Abi, functionName: 'balanceOf', args: [address!] }),
      ]);
      return { gas, token };
    },
  });
}

/** Live operator struct from chain (perStreamCap, dailyCap, expiry, dayIndex, spentToday). */
export function useOperatorOnchain(employer?: Address, operator?: Address) {
  return useQuery({
    queryKey: ['operator', employer, operator],
    enabled: Boolean(employer && operator && config.vault),
    refetchInterval: config.resyncMs,
    queryFn: async () => {
      const r = await publicClient.readContract({ address: config.vault!, abi: streamVaultAbi, functionName: 'operators', args: [employer!, operator!] });
      const [perStreamCap, dailyCap, expiry, dayIndex, spentToday] = r as readonly [bigint, bigint, number, number, bigint];
      return { perStreamCap, dailyCap, expiry: Number(expiry), dayIndex: Number(dayIndex), spentToday };
    },
  });
}
