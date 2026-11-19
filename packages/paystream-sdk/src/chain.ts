import { defineChain, type Chain } from 'viem';

export const AEVUM_CHAIN_ID = 44005;
export const AEVUM_RPC_URL = 'https://rpc-test.qday.info';
export const AEVUM_EXPLORER_URL = 'https://explorer-test.qday.info';
export const AEVUM_FAUCET_URL = 'https://faucet.qday.info';

/** tUSD8 test stablecoin on Aevum: 6 decimals, EIP-2612 permit and EIP-3009. */
export const TUSD8_ADDRESS = '0x456569838f1d43009A91ebA4263147Afd7233483' as const;
export const TUSD8_DECIMALS = 6;

/** QDay Aevum testnet. HTTPS only (no WebSocket), Shanghai EVM, legacy (type 0) transactions. */
export const aevumTestnet: Chain = defineChain({
  id: AEVUM_CHAIN_ID,
  name: 'QDay Aevum Testnet',
  nativeCurrency: { name: 'tQDAY', symbol: 'tQDAY', decimals: 18 },
  rpcUrls: { default: { http: [AEVUM_RPC_URL] } },
  blockExplorers: { default: { name: 'Aevum Explorer', url: AEVUM_EXPLORER_URL } },
  testnet: true,
});

/** Params for EIP-3085 `wallet_addEthereumChain`. */
export const aevumAddChainParams = {
  chainId: '0x' + AEVUM_CHAIN_ID.toString(16),
  chainName: 'QDay Aevum Testnet',
  nativeCurrency: { name: 'tQDAY', symbol: 'tQDAY', decimals: 18 },
  rpcUrls: [AEVUM_RPC_URL],
  blockExplorerUrls: [AEVUM_EXPLORER_URL],
} as const;

export const explorerTx = (hash: string) => `${AEVUM_EXPLORER_URL}/tx/${hash}`;
export const explorerAddress = (address: string) => `${AEVUM_EXPLORER_URL}/address/${address}`;
