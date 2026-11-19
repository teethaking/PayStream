import { create } from 'zustand';
import type { Abi, Address, Hex, TransactionReceipt } from 'viem';
import { formatEther } from 'viem';
import { explorerTx, toFriendlyError, type FriendlyError } from '@paystream/sdk';
import { publicClient } from './clients';
import { getWalletClient, switchToAevum, useWallet, type AppWalletClient } from './wallet';
import { config } from '@/config';
import { toast } from './toast';
import { celebrate } from './confetti';
import { refreshEvents } from './events';

export type StepId = 'sign' | 'submit' | 'confirm' | 'done';
export type StepState = 'idle' | 'active' | 'done' | 'error';

export interface TxJob {
  id: number;
  title: string;
  signLabel: string;
  steps: Record<StepId, StepState>;
  status: 'running' | 'success' | 'error';
  hash?: Hex;
  feeEstimate?: string;
  error?: FriendlyError;
  /** The transaction was mined but reverted (e.g. the deliberate overspend demo). */
  revertedOnChain?: boolean;
  replaced?: boolean;
  slow?: boolean;
}

interface TxStore {
  jobs: TxJob[];
  open: boolean;
}

export const useTx = create<TxStore>(() => ({ jobs: [], open: false }));

let seq = 0;
const patch = (id: number, p: Partial<TxJob> | ((j: TxJob) => Partial<TxJob>)) =>
  useTx.setState((s) => ({ jobs: s.jobs.map((j) => (j.id === id ? { ...j, ...(typeof p === 'function' ? p(j) : p) } : j)) }));
const step = (id: number, k: StepId, v: StepState) => patch(id, (j) => ({ steps: { ...j.steps, [k]: v } }));

export const closeTxPanel = () => useTx.setState({ open: false });
export const clearFinishedJobs = () => useTx.setState((s) => ({ jobs: s.jobs.filter((j) => j.status === 'running') }));

export interface ContractCall {
  address: Address;
  abi: Abi;
  functionName: string;
  args: readonly unknown[];
}

export interface TxOptions<S = undefined> {
  title: string;
  /** Override the signer (e.g. the agent's operator key). Defaults to the connected wallet. */
  wallet?: AppWalletClient;
  /** Optional off-chain signature before the transaction (EIP-2612 permit). */
  sign?: (wallet: AppWalletClient) => Promise<S>;
  signLabel?: string;
  call: (signed: S) => ContractCall;
  /** Broadcast even though simulation reverts, to produce an on-chain proof of the block. */
  forceSend?: boolean;
  celebrate?: boolean;
  successMessage?: string;
  onSuccess?: (receipt: TransactionReceipt) => void;
}

export type TxResult =
  | { ok: true; hash: Hex; receipt: TransactionReceipt }
  | { ok: false; error: FriendlyError; hash?: Hex; revertedOnChain?: boolean };

async function ensureReady(wallet: AppWalletClient | undefined): Promise<AppWalletClient> {
  if (!wallet) throw Object.assign(new Error('Connect a wallet first'), { friendly: { code: 'Unknown', title: 'No wallet connected', message: 'Connect a wallet or start Demo mode first.', blockedByContract: false } satisfies FriendlyError });
  if (!config.vault) throw Object.assign(new Error('Vault not configured'), { friendly: { code: 'Unknown', title: 'Vault not deployed yet', message: 'This build has no StreamVault address configured.', blockedByContract: false } satisfies FriendlyError });
  const s = useWallet.getState();
  if (s.mode === 'injected' && s.chainId !== config.chainId) {
    try {
      await switchToAevum();
    } catch {
      throw Object.assign(new Error('wrong network'), { friendly: { code: 'WrongNetwork', title: 'Wrong network', message: 'Switch your wallet to QDay Aevum testnet (44005) to continue.', blockedByContract: false } satisfies FriendlyError });
    }
  }
  const bal = await publicClient.getBalance({ address: wallet.account.address });
  if (bal === 0n) throw Object.assign(new Error('no gas'), { friendly: { code: 'InsufficientGas', title: 'No tQDAY for gas', message: 'This wallet has no test tQDAY. Use "Get test funds" to open the faucet, then retry.', blockedByContract: false } satisfies FriendlyError });
  return wallet;
}

const friendly = (e: unknown): FriendlyError => (e as { friendly?: FriendlyError }).friendly ?? toFriendlyError(e);

/**
 * Runs one on-chain action through Sign → Submit → Confirm → Done:
 * simulate first, show the fee, send as a legacy (type 0) tx, poll for the receipt (no WebSocket),
 * follow replaced transactions and map every failure to plain language.
 */
export async function runTx<S = undefined>(opts: TxOptions<S>): Promise<TxResult> {
  const id = ++seq;
  useTx.setState((s) => ({
    open: true,
    jobs: [
      ...s.jobs.filter((j) => j.status === 'running'),
      { id, title: opts.title, signLabel: opts.signLabel ?? 'Sign', status: 'running', steps: { sign: 'active', submit: 'idle', confirm: 'idle', done: 'idle' } },
    ],
  }));
  let hash: Hex | undefined;
  let expected: FriendlyError | undefined;
  try {
    const wallet = await ensureReady(opts.wallet ?? getWalletClient());
    const signed = opts.sign ? await opts.sign(wallet) : (undefined as S);
    const call = opts.call(signed);
    const account = wallet.account;

    let gas: bigint | undefined;
    try {
      const { request } = await publicClient.simulateContract({ ...call, account } as Parameters<typeof publicClient.simulateContract>[0]);
      gas = await publicClient.estimateContractGas({ ...request, account } as Parameters<typeof publicClient.estimateContractGas>[0]);
    } catch (e) {
      expected = friendly(e);
      if (!opts.forceSend) throw e;
    }
    const gasPrice = await publicClient.getGasPrice();
    const gasLimit = gas ? (gas * 12n) / 10n : 400_000n;
    patch(id, { feeEstimate: `≈ ${Number(formatEther(gasLimit * gasPrice)).toPrecision(3)} tQDAY` });

    hash = await wallet.writeContract({ ...call, account, chain: config.chain, type: 'legacy', gas: gasLimit, gasPrice } as Parameters<typeof wallet.writeContract>[0]);
    patch(id, { hash });
    step(id, 'sign', 'done');
    step(id, 'submit', 'done');
    step(id, 'confirm', 'active');

    const slowTimer = setTimeout(() => patch(id, { slow: true }), 25_000);
    const receipt = await publicClient
      .waitForTransactionReceipt({
        hash,
        pollingInterval: 1_500,
        timeout: 180_000,
        retryCount: 8,
        onReplaced: (r) => {
          hash = r.transaction.hash;
          patch(id, { hash, replaced: true });
        },
      })
      .finally(() => clearTimeout(slowTimer));

    if (receipt.status === 'reverted') {
      const err = expected ?? { code: 'Unknown', title: 'Transaction reverted', message: 'The contract rejected this transaction.', blockedByContract: true };
      step(id, 'confirm', 'error');
      patch(id, { status: 'error', error: err, revertedOnChain: true });
      toast({ kind: 'blocked', title: `Blocked by contract: ${err.title.toLowerCase()}`, message: err.message, href: explorerTx(receipt.transactionHash) }, 9000);
      void refreshEvents();
      return { ok: false, error: err, hash: receipt.transactionHash, revertedOnChain: true };
    }

    step(id, 'confirm', 'done');
    step(id, 'done', 'done');
    patch(id, { status: 'success' });
    toast({ kind: 'success', title: opts.title, message: opts.successMessage ?? 'Confirmed on Aevum.', href: explorerTx(receipt.transactionHash) });
    if (opts.celebrate !== false) void celebrate();
    opts.onSuccess?.(receipt);
    void refreshEvents();
    return { ok: true, hash: receipt.transactionHash, receipt };
  } catch (e) {
    const err = friendly(e);
    patch(id, (j) => ({
      status: 'error',
      error: err,
      steps: Object.fromEntries(Object.entries(j.steps).map(([k, v]) => [k, v === 'active' ? 'error' : v])) as TxJob['steps'],
    }));
    toast({ kind: err.blockedByContract ? 'blocked' : 'error', title: err.title, message: err.message, href: hash ? explorerTx(hash) : undefined });
    return { ok: false, error: err, hash };
  }
}
