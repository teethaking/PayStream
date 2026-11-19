# @paystream/sdk

Typed [viem](https://viem.sh) helpers for **PayStream** (`StreamVault` on QDay Aevum testnet, chain 44005).
MIT licensed. Unaudited hackathon code; testnet only.

```ts
import { aevumTestnet, streamVaultAbi, buildStreamParams, parseAmount, DAY, MONTH, toFriendlyError } from '@paystream/sdk';

const params = buildStreamParams({
  recipient: '0x…',
  amount: parseAmount('500'),          // 500 tUSD8 -> 500_000000n, BigInt only
  start: Math.floor(Date.now() / 1000),
  cliffSeconds: MONTH,
  durationSeconds: 3 * MONTH,
});

try {
  await wallet.writeContract({ address: vault, abi: streamVaultAbi, functionName: 'createStreams', args: [employer, [params]], type: 'legacy', chain: aevumTestnet });
} catch (e) {
  console.log(toFriendlyError(e).message); // "The agent hit its daily limit. …"
}
```

| Module | What it gives you |
| --- | --- |
| `chain` | `aevumTestnet` viem chain, `wallet_addEthereumChain` params, tUSD8 address, explorer link builders |
| `amount` | `parseAmount` / `formatAmount` for 6-decimal money, BigInt only, truncating, uint128-bounded |
| `vesting` | `vestedAt`, `withdrawableAt`, `streamStatus`, `cancelSplit`, `vestingCurve`: exact mirrors of the contract math |
| `params` | `buildStreamParams`, `validateParams` (same checks as the contract), `checkOperatorCaps` (off-chain replica of the cap logic) |
| `errors` | `toFriendlyError`: decodes every StreamVault custom error and common wallet/RPC failures into plain language |
| `permit` | `readPermitDomain`: reads the token's EIP-712 domain at runtime and asserts it against `DOMAIN_SEPARATOR()` |
| `logs` | `getLogsChunked` (≤1,000-block `eth_getLogs` windows with retry and backoff), `withRetry` |

Run the tests with `pnpm --filter @paystream/sdk test`.
