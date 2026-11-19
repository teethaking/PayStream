import { createPublicClient, http, type PublicClient } from 'viem';
import { config } from '@/config';

/** Read client. HTTP only (Aevum has no WebSocket); JSON-RPC batching and retry with backoff for rate limits. */
export const publicClient: PublicClient = createPublicClient({
  chain: config.chain,
  transport: http(config.rpcUrl, { batch: { wait: 16 }, retryCount: 4, retryDelay: 400, timeout: 20_000 }),
  pollingInterval: 2_000,
}) as PublicClient;
