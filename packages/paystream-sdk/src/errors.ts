import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError, decodeErrorResult, type Hex } from 'viem';
import { streamVaultAbi } from './abi.js';

export type VaultErrorName =
  | 'ZeroAmount'
  | 'ZeroAddress'
  | 'InvalidSchedule'
  | 'InsufficientTreasury'
  | 'NotAuthorized'
  | 'OperatorExpired'
  | 'PerStreamCapExceeded'
  | 'DailyCapExceeded'
  | 'NotCancelable'
  | 'AlreadyCanceled'
  | 'NothingToWithdraw'
  | 'StreamNotFound'
  | 'SafeERC20FailedOperation'
  | 'ReentrancyGuardReentrantCall';

export interface FriendlyError {
  /** Stable code: a contract error name or a client-side category. */
  code: VaultErrorName | 'UserRejected' | 'InsufficientGas' | 'WrongNetwork' | 'RateLimited' | 'Network' | 'Unknown';
  title: string;
  message: string;
  /** True when the contract itself refused (a safety control working as designed). */
  blockedByContract: boolean;
}

export const VAULT_ERROR_MESSAGES: Record<VaultErrorName, { title: string; message: string }> = {
  ZeroAmount: { title: 'Amount is zero', message: 'Enter an amount greater than zero.' },
  ZeroAddress: { title: 'Missing address', message: 'A recipient or operator address is empty.' },
  InvalidSchedule: { title: 'Schedule does not add up', message: 'Start must be before end, and the cliff must sit between them.' },
  InsufficientTreasury: { title: 'Treasury too low', message: 'The treasury does not hold enough tUSD8 for this payroll. Deposit more first.' },
  NotAuthorized: { title: 'Not allowed', message: 'This wallet is not the employer or an active operator for this action.' },
  OperatorExpired: { title: 'Agent access expired', message: 'The operator grant has expired. The employer must grant it again.' },
  PerStreamCapExceeded: { title: 'Per-stream cap hit', message: 'The agent tried to create a stream larger than its per-stream limit.' },
  DailyCapExceeded: { title: 'Daily cap hit', message: 'The agent hit its daily limit. It can create more streams after midnight UTC.' },
  NotCancelable: { title: 'Stream is locked', message: 'This stream was created as non-cancelable, so nobody can cancel it.' },
  AlreadyCanceled: { title: 'Already canceled', message: 'This stream has already been canceled.' },
  NothingToWithdraw: { title: 'Nothing to claim yet', message: 'Nothing has vested since the last withdrawal.' },
  StreamNotFound: { title: 'Stream not found', message: 'No stream exists with this id.' },
  SafeERC20FailedOperation: { title: 'Token transfer failed', message: 'tUSD8 refused the transfer. Check your balance and allowance.' },
  ReentrancyGuardReentrantCall: { title: 'Call blocked', message: 'The vault blocked a re-entrant call.' },
};

const fromName = (name: string): FriendlyError | undefined => {
  const m = VAULT_ERROR_MESSAGES[name as VaultErrorName];
  return m ? { code: name as VaultErrorName, ...m, blockedByContract: true } : undefined;
};

/** Decodes raw revert data (e.g. 0x5c6a1c22) into a friendly error. */
export function decodeRevertData(data: Hex): FriendlyError | undefined {
  try {
    return fromName(decodeErrorResult({ abi: streamVaultAbi, data }).errorName);
  } catch {
    return undefined;
  }
}

/** Turns anything thrown by viem, a wallet or the RPC into a plain-language error. Never surfaces hex. */
export function toFriendlyError(err: unknown): FriendlyError {
  if (err instanceof BaseError) {
    const reverted = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError) {
      const name = reverted.data?.errorName;
      const known = name ? fromName(name) : reverted.raw ? decodeRevertData(reverted.raw) : undefined;
      if (known) return known;
    }
    if (err.walk((e) => e instanceof UserRejectedRequestError)) {
      return { code: 'UserRejected', title: 'Request rejected', message: 'You declined the request in your wallet. Nothing was sent.', blockedByContract: false };
    }
  }
  const text = String((err as { shortMessage?: string; message?: string })?.shortMessage ?? (err as Error)?.message ?? err).toLowerCase();
  const hex = /0x[0-9a-f]{8}/.exec(text)?.[0];
  if (hex) {
    const decoded = decodeRevertData(hex as Hex);
    if (decoded) return decoded;
  }
  if (text.includes('user rejected') || text.includes('user denied') || text.includes('4001')) {
    return { code: 'UserRejected', title: 'Request rejected', message: 'You declined the request in your wallet. Nothing was sent.', blockedByContract: false };
  }
  if (text.includes('insufficient funds')) {
    return { code: 'InsufficientGas', title: 'Not enough tQDAY for gas', message: 'Top up this wallet with test tQDAY from the faucet, then try again.', blockedByContract: false };
  }
  if (text.includes('chain') && (text.includes('mismatch') || text.includes('does not match'))) {
    return { code: 'WrongNetwork', title: 'Wrong network', message: 'Switch your wallet to QDay Aevum testnet (44005).', blockedByContract: false };
  }
  if (text.includes('429') || text.includes('rate limit') || text.includes('too many')) {
    return { code: 'RateLimited', title: 'RPC is busy', message: 'The testnet RPC is rate-limiting requests. Retrying shortly usually works.', blockedByContract: false };
  }
  if (text.includes('fetch') || text.includes('network') || text.includes('timeout') || text.includes('timed out')) {
    return { code: 'Network', title: 'Network hiccup', message: 'Could not reach the Aevum RPC. Check your connection and retry.', blockedByContract: false };
  }
  return { code: 'Unknown', title: 'Something went wrong', message: 'The transaction could not be completed. Please try again.', blockedByContract: false };
}
