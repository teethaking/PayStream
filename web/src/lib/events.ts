import { create } from 'zustand';
import type { Address, Hex } from 'viem';
import { getLogsChunked, sleep } from '@paystream/sdk';
import { streamVaultAbi } from '@/abi/streamVault';
import { publicClient } from './clients';
import { config } from '@/config';

type AbiEvents = Extract<(typeof streamVaultAbi)[number], { type: 'event' }>;
export type VaultEventName = AbiEvents['name'];

export interface VaultEvent {
  key: string;
  name: VaultEventName;
  // decoded args; bigint values preserved
  args: Record<string, unknown>;
  blockNumber: bigint;
  logIndex: number;
  txHash: Hex;
  timestamp: number;
}

type Status = 'unconfigured' | 'idle' | 'syncing' | 'live' | 'error';

interface EventsState {
  status: Status;
  events: VaultEvent[];
  scannedTo: bigint;
  head: bigint;
  /** chain timestamp minus local clock, seconds. Keeps client-side interpolation honest. */
  chainOffset: number;
  lastSync: number;
  progress: number;
  error?: string;
}

export const useEvents = create<EventsState>(() => ({
  status: config.vault ? 'idle' : 'unconfigured',
  events: [],
  scannedTo: config.deployBlock > 0n ? config.deployBlock - 1n : 0n,
  head: 0n,
  chainOffset: 0,
  lastSync: 0,
  progress: 0,
}));

const CACHE_KEY = () => `ps-events-v1-${config.chainId}-${config.vault?.toLowerCase()}`;
const replacer = (_: string, v: unknown) => (typeof v === 'bigint' ? { $b: v.toString() } : v);
const reviver = (_: string, v: unknown) => (v && typeof v === 'object' && '$b' in (v as object) ? BigInt((v as { $b: string }).$b) : v);

function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY());
    if (!raw) return;
    const c = JSON.parse(raw, reviver) as { events: VaultEvent[]; scannedTo: bigint };
    useEvents.setState({ events: c.events, scannedTo: c.scannedTo });
  } catch {
    localStorage.removeItem(CACHE_KEY());
  }
}

function saveCache() {
  const { events, scannedTo } = useEvents.getState();
  try {
    localStorage.setItem(CACHE_KEY(), JSON.stringify({ events, scannedTo }, replacer));
  } catch {
    /* storage full: fine, we can rescan */
  }
}

const blockTimes = new Map<bigint, number>();
async function timestampsFor(blocks: bigint[]) {
  const missing = [...new Set(blocks)].filter((b) => !blockTimes.has(b));
  const got = await Promise.all(missing.map((b) => publicClient.getBlock({ blockNumber: b })));
  got.forEach((b) => blockTimes.set(b.number, Number(b.timestamp)));
}

let syncing: Promise<void> | undefined;

/** Scan new blocks once: chunked eth_getLogs (≤1,000 blocks each) from the last scanned block to head. */
export function refreshEvents(): Promise<void> {
  if (!config.vault) return Promise.resolve();
  syncing ??= (async () => {
    try {
      const latest = await publicClient.getBlock({ blockTag: 'latest' });
      const head = latest.number;
      useEvents.setState({ head, chainOffset: Number(latest.timestamp) - Date.now() / 1000 });
      const from = useEvents.getState().scannedTo + 1n;
      if (from > head) {
        useEvents.setState({ status: 'live', lastSync: Date.now(), error: undefined, progress: 1 });
        return;
      }
      const total = Number(head - from + 1n);
      if (useEvents.getState().status !== 'live') useEvents.setState({ status: 'syncing' });
      const logs = await getLogsChunked(publicClient, {
        address: config.vault!,
        events: streamVaultAbi.filter((x): x is AbiEvents => x.type === 'event'),
        fromBlock: from,
        toBlock: head,
        onChunk: ({ to }) => useEvents.setState({ progress: Math.min(1, Number(to - from + 1n) / total) }),
      });
      const decoded = logs as unknown as { eventName: VaultEventName; args: Record<string, unknown>; blockNumber: bigint; logIndex: number; transactionHash: Hex }[];
      await timestampsFor(decoded.map((l) => l.blockNumber));
      const fresh: VaultEvent[] = decoded.map((l) => ({
        key: `${l.blockNumber}-${l.logIndex}`,
        name: l.eventName,
        args: l.args,
        blockNumber: l.blockNumber,
        logIndex: l.logIndex,
        txHash: l.transactionHash,
        timestamp: blockTimes.get(l.blockNumber) ?? Math.floor(Date.now() / 1000),
      }));
      useEvents.setState((s) => {
        const seen = new Set(s.events.map((e) => e.key));
        return {
          events: [...s.events, ...fresh.filter((e) => !seen.has(e.key))],
          scannedTo: head,
          status: 'live',
          lastSync: Date.now(),
          error: undefined,
          progress: 1,
        };
      });
      saveCache();
    } catch (e) {
      useEvents.setState({ status: 'error', error: (e as Error).message });
      throw e;
    } finally {
      syncing = undefined;
    }
  })();
  return syncing;
}

let started = false;
/** Poll loop: no WebSocket on Aevum. Pauses while the tab is hidden and backs off on errors. */
export function startEventSync() {
  if (started || !config.vault) return;
  started = true;
  loadCache();
  void (async () => {
    let backoff: number = config.pollMs;
    for (;;) {
      if (document.hidden) {
        await new Promise<void>((r) => document.addEventListener('visibilitychange', () => r(), { once: true }));
        continue;
      }
      try {
        await refreshEvents();
        backoff = config.pollMs;
      } catch {
        backoff = Math.min(backoff * 2, 60_000);
      }
      await sleep(backoff);
    }
  })();
}

export const eventsOf = (name: VaultEventName) => useEvents.getState().events.filter((e) => e.name === name);
export type { Address };
