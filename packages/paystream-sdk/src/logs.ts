import type { AbiEvent, Address, Log, PublicClient } from 'viem';

export const MAX_LOG_RANGE = 1000n;

export interface ChunkedLogsOptions<E extends AbiEvent> {
  address: Address;
  events: readonly E[];
  fromBlock: bigint;
  toBlock: bigint;
  /** Max blocks per eth_getLogs call. Aevum caps this at 1,000. */
  chunkSize?: bigint;
  retries?: number;
  onChunk?: (info: { from: bigint; to: bigint; logs: number }) => void;
  signal?: AbortSignal;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Retries with exponential backoff and jitter, for flaky or rate-limited RPCs. */
export async function withRetry<T>(fn: () => Promise<T>, retries = 4, baseMs = 400): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      if (attempt++ >= retries) throw err;
      await sleep(baseMs * 2 ** (attempt - 1) + Math.random() * baseMs);
    }
  }
}

/** eth_getLogs over [fromBlock, toBlock] in inclusive chunks of at most `chunkSize` blocks. */
export async function getLogsChunked<E extends AbiEvent>(client: PublicClient, opts: ChunkedLogsOptions<E>) {
  const size = opts.chunkSize ?? MAX_LOG_RANGE;
  const all: Log[] = [];
  for (let from = opts.fromBlock; from <= opts.toBlock; from += size) {
    if (opts.signal?.aborted) break;
    const to = from + size - 1n < opts.toBlock ? from + size - 1n : opts.toBlock;
    const logs = await withRetry(
      () => client.getLogs({ address: opts.address, events: opts.events as unknown as AbiEvent[], fromBlock: from, toBlock: to, strict: true }),
      opts.retries,
    );
    all.push(...(logs as Log[]));
    opts.onChunk?.({ from, to, logs: logs.length });
  }
  return all;
}

/** Splits a block range into the chunk boundaries getLogsChunked would use. */
export function chunkRanges(fromBlock: bigint, toBlock: bigint, size = MAX_LOG_RANGE) {
  const out: [bigint, bigint][] = [];
  for (let from = fromBlock; from <= toBlock; from += size) out.push([from, from + size - 1n < toBlock ? from + size - 1n : toBlock]);
  return out;
}
