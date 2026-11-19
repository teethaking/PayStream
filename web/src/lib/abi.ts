import { parseAbi } from 'viem';
export { streamVaultAbi } from '@/abi/streamVault';

export const erc20Abi = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 value) returns (bool)',
  'function transfer(address to, uint256 value) returns (bool)',
  'function nonces(address owner) view returns (uint256)',
]);
