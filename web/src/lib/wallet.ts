import { create } from 'zustand';
import {
  createWalletClient,
  custom,
  http,
  type Address,
  type EIP1193Provider,
  type Hex,
  type WalletClient,
  type Account,
  type Chain,
  type Transport,
} from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { aevumAddChainParams } from '@paystream/sdk';
import { config } from '@/config';

export type WalletMode = 'none' | 'injected' | 'burner';

const BURNER_KEY = 'ps-burner-key';
const AGENT_KEY = 'ps-agent-burner-key';
const MODE_KEY = 'ps-wallet-mode';

declare global {
  interface Window {
    ethereum?: EIP1193Provider & { isMetaMask?: boolean; on?: (e: string, cb: (...a: unknown[]) => void) => void };
  }
}

interface WalletState {
  mode: WalletMode;
  address?: Address;
  chainId?: number;
  connecting: boolean;
  error?: string;
}

export const useWallet = create<WalletState>(() => ({ mode: 'none', connecting: false }));

export const hasInjected = () => typeof window !== 'undefined' && Boolean(window.ethereum);

export const isWrongNetwork = () => {
  const s = useWallet.getState();
  return s.mode === 'injected' && s.chainId !== undefined && s.chainId !== config.chainId;
};

/** Throwaway burner key kept in localStorage. Testnet only: anyone with access to this browser profile can use it. */
function loadKey(storageKey: string, create: boolean): Hex | undefined {
  let k = localStorage.getItem(storageKey) as Hex | null;
  if (!k && create) {
    k = generatePrivateKey();
    localStorage.setItem(storageKey, k);
  }
  return k ?? undefined;
}

export const burnerAccount = (create = false) => {
  const k = loadKey(BURNER_KEY, create);
  return k ? privateKeyToAccount(k) : undefined;
};

/** Separate burner used as the AI payroll agent's operator key in the in-browser demo. */
export const agentBurnerAccount = (create = false) => {
  const k = loadKey(AGENT_KEY, create);
  return k ? privateKeyToAccount(k) : undefined;
};

export const exportBurnerKey = () => localStorage.getItem(BURNER_KEY) as Hex | null;

export function forgetBurner() {
  localStorage.removeItem(BURNER_KEY);
  if (useWallet.getState().mode === 'burner') disconnect();
}

let listenersBound = false;
function bindInjectedListeners() {
  if (listenersBound || !window.ethereum?.on) return;
  listenersBound = true;
  window.ethereum.on('accountsChanged', (accs) => {
    const list = accs as Address[];
    if (useWallet.getState().mode !== 'injected') return;
    if (!list.length) disconnect();
    else useWallet.setState({ address: list[0] });
  });
  window.ethereum.on('chainChanged', (id) => {
    if (useWallet.getState().mode !== 'injected') return;
    useWallet.setState({ chainId: Number(id as string) });
  });
}

export async function connectInjected() {
  if (!window.ethereum) {
    useWallet.setState({ error: 'No browser wallet found. Use Demo mode or install a wallet.' });
    return;
  }
  useWallet.setState({ connecting: true, error: undefined });
  try {
    const accounts = (await window.ethereum.request({ method: 'eth_requestAccounts' })) as Address[];
    const chainId = Number(await window.ethereum.request({ method: 'eth_chainId' }));
    bindInjectedListeners();
    useWallet.setState({ mode: 'injected', address: accounts[0], chainId, connecting: false });
    localStorage.setItem(MODE_KEY, 'injected');
    if (chainId !== config.chainId) await switchToAevum().catch(() => undefined);
  } catch (e) {
    useWallet.setState({ connecting: false, error: (e as Error).message?.includes('reject') ? 'Connection request was rejected.' : 'Could not connect the wallet.' });
  }
}

export function enableBurner() {
  const acc = burnerAccount(true)!;
  useWallet.setState({ mode: 'burner', address: acc.address, chainId: config.chainId, error: undefined });
  localStorage.setItem(MODE_KEY, 'burner');
}

export function disconnect() {
  useWallet.setState({ mode: 'none', address: undefined, chainId: undefined });
  localStorage.removeItem(MODE_KEY);
}

/** One-click "Add / Switch to Aevum (44005)". */
export async function switchToAevum() {
  if (!window.ethereum) return;
  try {
    await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: aevumAddChainParams.chainId }] });
  } catch (e) {
    const code = (e as { code?: number }).code;
    if (code === 4902 || code === -32603 || String((e as Error).message).includes('Unrecognized')) {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{ ...aevumAddChainParams, rpcUrls: [...aevumAddChainParams.rpcUrls], blockExplorerUrls: [...aevumAddChainParams.blockExplorerUrls] }],
      });
    } else throw e;
  }
  const chainId = Number(await window.ethereum.request({ method: 'eth_chainId' }));
  useWallet.setState({ chainId });
}

export type AppWalletClient = WalletClient<Transport, Chain, Account>;

export function walletClientFor(account: Account): AppWalletClient {
  return createWalletClient({ account, chain: config.chain, transport: http(config.rpcUrl, { retryCount: 3 }) });
}

/** Wallet client for the connected wallet, or undefined when disconnected. */
export function getWalletClient(): AppWalletClient | undefined {
  const s = useWallet.getState();
  if (s.mode === 'burner') {
    const acc = burnerAccount();
    return acc ? walletClientFor(acc) : undefined;
  }
  if (s.mode === 'injected' && s.address && window.ethereum) {
    return createWalletClient({ account: s.address, chain: config.chain, transport: custom(window.ethereum) }) as unknown as AppWalletClient;
  }
  return undefined;
}

/** Restore the previous session without prompting. */
export async function restoreWallet() {
  const mode = localStorage.getItem(MODE_KEY) as WalletMode | null;
  if (mode === 'burner' && burnerAccount()) return enableBurner();
  if (mode === 'injected' && window.ethereum) {
    try {
      const accounts = (await window.ethereum.request({ method: 'eth_accounts' })) as Address[];
      if (!accounts.length) return;
      const chainId = Number(await window.ethereum.request({ method: 'eth_chainId' }));
      bindInjectedListeners();
      useWallet.setState({ mode: 'injected', address: accounts[0], chainId });
    } catch {
      /* stay disconnected */
    }
  }
}
