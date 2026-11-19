import { parseSignature, type Address, type Hex } from 'viem';
import { PERMIT_TYPES, readPermitDomain, readPermitNonce, type StreamParams } from '@paystream/sdk';
import { runTx } from '@/lib/tx';
import { publicClient } from '@/lib/clients';
import { erc20Abi, streamVaultAbi } from '@/lib/abi';
import { config } from '@/config';
import { useEvents } from '@/lib/events';
import { fmt } from '@/lib/format';

const PERMIT_TTL = 30 * 60;

/** One signature + one transaction: EIP-2612 permit signed off-chain, then depositWithPermit. */
export function depositWithPermit(amount: bigint) {
  return runTx<{ deadline: bigint; v: number; r: Hex; s: Hex }>({
    title: `Deposit ${fmt(amount)} tUSD8`,
    signLabel: 'Sign permit',
    sign: async (wallet) => {
      const owner = wallet.account.address;
      const [domain, nonce] = await Promise.all([
        readPermitDomain(publicClient, config.token),
        readPermitNonce(publicClient, config.token, owner),
      ]);
      const deadline = BigInt(Math.floor(Date.now() / 1000 + useEvents.getState().chainOffset) + PERMIT_TTL);
      const signature = await wallet.signTypedData({
        account: wallet.account,
        domain,
        types: PERMIT_TYPES,
        primaryType: 'Permit',
        message: { owner, spender: config.vault!, value: amount, nonce, deadline },
      });
      const sig = parseSignature(signature);
      return { deadline, v: Number(sig.v ?? 27n + BigInt(sig.yParity)), r: sig.r, s: sig.s };
    },
    call: ({ deadline, v, r, s }) => ({
      address: config.vault!,
      abi: streamVaultAbi,
      functionName: 'depositWithPermit',
      args: [amount, deadline, v, r, s],
    }),
    successMessage: 'Your treasury is funded and ready to stream.',
  });
}

/** Fallback for wallets without EIP-712 support: approve (skipped when the allowance already covers it), then deposit. */
export async function approveAndDeposit(owner: Address, amount: bigint) {
  const allowance = config.vault
    ? await publicClient
        .readContract({ address: config.token, abi: erc20Abi, functionName: 'allowance', args: [owner, config.vault] })
        .catch(() => 0n)
    : 0n;
  if (allowance < amount) {
    const approved = await runTx({
      title: `Approve ${fmt(amount)} tUSD8`,
      call: () => ({ address: config.token, abi: erc20Abi, functionName: 'approve', args: [config.vault!, amount] }),
      celebrate: false,
      successMessage: 'Allowance set. Now depositing…',
    });
    if (!approved.ok) return approved;
  }
  return runTx({
    title: `Deposit ${fmt(amount)} tUSD8`,
    call: () => ({ address: config.vault!, abi: streamVaultAbi, functionName: 'deposit', args: [amount] }),
    successMessage: 'Your treasury is funded and ready to stream.',
  });
}

export function withdrawTreasury(amount: bigint) {
  return runTx({
    title: `Withdraw ${fmt(amount)} tUSD8`,
    call: () => ({ address: config.vault!, abi: streamVaultAbi, functionName: 'withdrawTreasury', args: [amount] }),
    celebrate: false,
    successMessage: 'Funds are back in your wallet.',
  });
}

export function createStreams(sender: Address, params: StreamParams[]) {
  const total = params.reduce((a, p) => a + p.amount, 0n);
  return runTx({
    title: params.length === 1 ? 'Start 1 payroll stream' : `Start ${params.length} payroll streams`,
    call: () => ({
      address: config.vault!,
      abi: streamVaultAbi,
      functionName: 'createStreams',
      args: [sender, params],
    }),
    successMessage: `${fmt(total)} tUSD8 is now streaming to ${params.length} ${params.length === 1 ? 'recipient' : 'recipients'}.`,
  });
}

export function cancelStream(id: bigint) {
  return runTx({
    title: `Cancel stream #${id.toString()}`,
    call: () => ({ address: config.vault!, abi: streamVaultAbi, functionName: 'cancel', args: [id] }),
    celebrate: false,
    successMessage: 'Vested pay stays claimable; the unvested rest was refunded to your wallet.',
  });
}
