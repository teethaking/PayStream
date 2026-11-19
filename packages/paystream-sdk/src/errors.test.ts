import { describe, expect, it } from 'vitest';
import { encodeErrorResult, ContractFunctionRevertedError, ContractFunctionExecutionError, UserRejectedRequestError } from 'viem';
import { streamVaultAbi } from './abi.js';
import { VAULT_ERROR_MESSAGES, decodeRevertData, toFriendlyError } from './errors.js';

describe('error decoding', () => {
  it('has a message for every custom error in the ABI', () => {
    const names = streamVaultAbi.filter((x) => x.type === 'error').map((x) => x.name);
    expect(names.length).toBe(14);
    for (const n of names) expect(VAULT_ERROR_MESSAGES).toHaveProperty(n);
  });

  it('decodes raw revert data', () => {
    const data = encodeErrorResult({ abi: streamVaultAbi, errorName: 'DailyCapExceeded' });
    expect(decodeRevertData(data)).toMatchObject({ code: 'DailyCapExceeded', title: 'Daily cap hit', blockedByContract: true });
  });

  it('unwraps viem contract errors', () => {
    const data = encodeErrorResult({ abi: streamVaultAbi, errorName: 'PerStreamCapExceeded' });
    const cause = new ContractFunctionRevertedError({ abi: streamVaultAbi, data, functionName: 'createStreams' });
    const err = new ContractFunctionExecutionError(cause, { abi: streamVaultAbi, functionName: 'createStreams', args: [] });
    expect(toFriendlyError(err).code).toBe('PerStreamCapExceeded');
  });

  it('classifies wallet and RPC failures without leaking hex', () => {
    expect(toFriendlyError(new UserRejectedRequestError(new Error('x'))).code).toBe('UserRejected');
    expect(toFriendlyError(new Error('insufficient funds for gas * price + value')).code).toBe('InsufficientGas');
    expect(toFriendlyError(new Error('HTTP 429 Too Many Requests')).code).toBe('RateLimited');
    const unknown = toFriendlyError(new Error('execution reverted 0xdeadbeef'));
    expect(unknown.code).toBe('Unknown');
    expect(unknown.message).not.toMatch(/0x/);
  });
});
