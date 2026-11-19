import { domainSeparator, type Address, type PublicClient, type TypedDataDomain, parseAbi } from 'viem';

const tokenAbi = parseAbi([
  'function eip712Domain() view returns (bytes1 fields, string name, string version, uint256 chainId, address verifyingContract, bytes32 salt, uint256[] extensions)',
  'function name() view returns (string)',
  'function version() view returns (string)',
  'function DOMAIN_SEPARATOR() view returns (bytes32)',
  'function nonces(address) view returns (uint256)',
]);

export const PERMIT_TYPES = {
  Permit: [
    { name: 'owner', type: 'address' },
    { name: 'spender', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const;

export class PermitDomainMismatchError extends Error {}

/**
 * Reads the token's EIP-712 domain at runtime: eip712Domain() if implemented, otherwise name()/version(),
 * falling back to "tUSD8" / "2". Asserts the derived separator equals DOMAIN_SEPARATOR() on chain,
 * so a wrong guess fails loudly before the user signs anything.
 */
export async function readPermitDomain(
  client: PublicClient,
  token: Address,
  fallback: { name: string; version: string } = { name: 'tUSD8', version: '2' },
): Promise<TypedDataDomain & { name: string; version: string; chainId: number; verifyingContract: Address }> {
  const chainId = await client.getChainId();
  let { name, version } = fallback;
  try {
    const d = await client.readContract({ address: token, abi: tokenAbi, functionName: 'eip712Domain' });
    name = d[1];
    version = d[2];
  } catch {
    const [n, v] = await Promise.allSettled([
      client.readContract({ address: token, abi: tokenAbi, functionName: 'name' }),
      client.readContract({ address: token, abi: tokenAbi, functionName: 'version' }),
    ]);
    if (n.status === 'fulfilled') name = n.value;
    if (v.status === 'fulfilled') version = v.value;
  }
  const domain = { name, version, chainId, verifyingContract: token };
  const onchain = await client.readContract({ address: token, abi: tokenAbi, functionName: 'DOMAIN_SEPARATOR' });
  if (domainSeparator({ domain }).toLowerCase() !== onchain.toLowerCase()) {
    throw new PermitDomainMismatchError(`Derived EIP-712 domain (${name} v${version}) does not match the token's DOMAIN_SEPARATOR`);
  }
  return domain;
}

export async function readPermitNonce(client: PublicClient, token: Address, owner: Address) {
  return client.readContract({ address: token, abi: tokenAbi, functionName: 'nonces', args: [owner] });
}
