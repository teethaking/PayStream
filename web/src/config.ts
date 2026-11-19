import type { Address, Hex } from 'viem';
import { AEVUM_CHAIN_ID, AEVUM_EXPLORER_URL, AEVUM_FAUCET_URL, AEVUM_RPC_URL, TUSD8_ADDRESS, aevumTestnet } from '@paystream/sdk';

interface Deployment {
  chainId: number;
  streamVault: Address;
  token: Address;
  deployer: Address;
  deployTxHash: Hex;
  deployBlock: number;
}

// deployments/aevum-44005.json is written from the real broadcast log by scripts/sync-artifacts.mjs.
// It does not exist until the vault is deployed, so it is loaded with a glob that tolerates absence.
const found = import.meta.glob<Deployment>('../../deployments/aevum-44005.json', { eager: true, import: 'default' });
const deployment: Deployment | undefined = Object.values(found)[0];

const envVault = (import.meta.env.VITE_VAULT_ADDRESS || undefined) as Address | undefined;
const envBlock = (import.meta.env.VITE_VAULT_DEPLOY_BLOCK || undefined) as string | undefined;

export const config = {
  chain: aevumTestnet,
  chainId: AEVUM_CHAIN_ID,
  rpcUrl: (import.meta.env.VITE_RPC_URL as string | undefined) ?? AEVUM_RPC_URL,
  explorerUrl: AEVUM_EXPLORER_URL,
  faucetUrl: AEVUM_FAUCET_URL,
  token: TUSD8_ADDRESS as Address,
  tokenSymbol: 'tUSD8',
  vault: (envVault ?? deployment?.streamVault) as Address | undefined,
  deployBlock: BigInt(envBlock ?? deployment?.deployBlock ?? 0),
  deployTxHash: deployment?.deployTxHash,
  /** Re-sync interpolated balances with the chain this often. */
  resyncMs: 15_000,
  /** Poll for new blocks / events this often (no WebSocket on Aevum). */
  pollMs: 6_000,
  llmEnabled: import.meta.env.VITE_ASSISTANT_LLM === '1',
} as const;

export const isVaultConfigured = () => Boolean(config.vault);
