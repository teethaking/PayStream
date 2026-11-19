#!/usr/bin/env node
/**
 * Runs the DEMO.md storyboard end-to-end against the live Aevum testnet and prints every real
 * transaction hash, so DEMO.md's table can be filled with facts instead of placeholders.
 *
 *   cd agent && PRIVATE_KEY=0x… AGENT_PRIVATE_KEY=0x… node src/demo.mjs
 *
 * Uses tiny amounts (tUSD8 from the faucet is 5 per address). Never prints keys.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPublicClient, createWalletClient, formatEther, http, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  DAY,
  PERMIT_TYPES,
  aevumTestnet,
  buildStreamParams,
  explorerTx,
  readPermitDomain,
  readPermitNonce,
  formatAmount,
  streamVaultAbi,
} from '@paystream/sdk';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const deployment = JSON.parse(readFileSync(join(root, 'deployments/aevum-44005.json'), 'utf8'));
const vault = deployment.streamVault;
const token = deployment.token;
const log = (...a) => console.log(...a);

const key = (name) => {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Set ${name}`);
  return v.startsWith('0x') ? v : `0x${v}`;
};

const publicClient = createPublicClient({ chain: aevumTestnet, transport: http(aevmRpc(), { retryCount: 4, retryDelay: 500 }) });
function aevmRpc() {
  return process.env.AEVUM_RPC_URL ?? 'https://rpc-test.qday.info';
}

const employer = privateKeyToAccount(key('PRIVATE_KEY'));
const agent = privateKeyToAccount(key('AGENT_PRIVATE_KEY'));
const employerWallet = createWalletClient({ account: employer, chain: aevumTestnet, transport: http(aevmRpc()) });
const agentWallet = createWalletClient({ account: agent, chain: aevumTestnet, transport: http(aevmRpc()) });

const hashes = {};
const send = async (label, wallet, call, force = false) => {
  const account = wallet.account;
  let gas = 700_000n;
  if (!force) {
    await publicClient.simulateContract({ ...call, account });
    gas = ((await publicClient.estimateContractGas({ ...call, account })) * 13n) / 10n;
  }
  const gasPrice = await publicClient.getGasPrice();
  const hash = await wallet.writeContract({ ...call, account, chain: aevumTestnet, type: 'legacy', gas, gasPrice });
  const receipt = await publicClient.waitForTransactionReceipt({ hash, pollingInterval: 1_500, timeout: 180_000 });
  hashes[label] = { hash, status: receipt.status, block: Number(receipt.blockNumber) };
  log(`  ${receipt.status === 'success' ? '✓' : '✗'} ${label.padEnd(22)} ${hash} (block ${receipt.blockNumber})`);
  return receipt;
};

const now = async () => Number((await publicClient.getBlock()).timestamp);
const BAL = parseAbi(['function balanceOf(address) view returns (uint256)', 'function nonces(address) view returns (uint256)']);

async function main() {
  const [empBal, agentGas] = await Promise.all([
    publicClient.readContract({ address: token, abi: BAL, functionName: 'balanceOf', args: [employer.address] }),
    publicClient.getBalance({ address: agent.address }),
  ]);
  log(`vault   ${vault}\nemployer ${employer.address} (${formatEther(empBal)} tUSD8)\nagent    ${agent.address} (${formatEther(agentGas)} tQDAY)\n`);
  if (empBal === 0n) throw new Error('Employer has no tUSD8. Use the faucet first.');

  // Faucet tUSD8 is 5 per address, so the storyboard scales to whatever the wallet holds.
  const dep = (empBal * 55n) / 100n;
  const ada = (dep * 25n) / 100n;
  const tobe = (dep * 15n) / 100n;
  const total = dep;
  const ada2 = '0x00000000000000000000000000000000000A11cE';
  const tobeAddr = '0x0000000000000000000000000000000000000B0b';
  const chiAddr = '0x000000000000000000000000000000000000c41a';

  log('1. permit deposit (one signature)');
  const domain = await readPermitDomain(publicClient, token);
  const nonce = await readPermitNonce(publicClient, token, employer.address);
  const deadline = BigInt((await now()) + 1800);
  const signature = await employerWallet.signTypedData({
    account: employer,
    domain,
    types: PERMIT_TYPES,
    primaryType: 'Permit',
    message: { owner: employer.address, spender: vault, value: total, nonce, deadline },
  });
  const { v, r, s } = (await import('viem')).parseSignature(signature);
  const vNum = Number(v ?? 27n + BigInt(r ? 0 : 0));
  await send('depositWithPermit', employerWallet, {
    address: vault,
    abi: streamVaultAbi,
    functionName: 'depositWithPermit',
    args: [total, deadline, vNum, r, s],
  });

  log('2. batch payroll');
  const t = await now();
  const start = t;
  const params = [
    buildStreamParams({ recipient: ada2, amount: ada, start, cliffSeconds: 60, durationSeconds: 600 }),
    buildStreamParams({ recipient: tobeAddr, amount: tobe, start, durationSeconds: 600 }),
  ];
  await send('createStreams', employerWallet, { address: vault, abi: streamVaultAbi, functionName: 'createStreams', args: [employer.address, params] });
  const firstId = await publicClient.readContract({ address: vault, abi: streamVaultAbi, functionName: 'nextStreamId' });
  const id1 = firstId - 2n;
  const id2 = firstId - 1n;

  const caps = { perStreamCap: ada, dailyCap: ada + tobe };
  log(`3. grant the AI agent (${formatAmount(caps.perStreamCap)} per stream, ${formatAmount(caps.dailyCap)} per day, 24h)`);
  const expiry = BigInt((await now()) + DAY);
  await send('setOperator', employerWallet, {
    address: vault,
    abi: streamVaultAbi,
    functionName: 'setOperator',
    args: [agent.address, caps.perStreamCap, caps.dailyCap, expiry],
  });

  log('4. agent creates a stream within caps');
  const t2 = await now();
  await send('agent-createStreams', agentWallet, {
    address: vault,
    abi: streamVaultAbi,
    functionName: 'createStreams',
    args: [employer.address, [buildStreamParams({ recipient: chiAddr, amount: caps.perStreamCap, start: t2 + 120, durationSeconds: 600 })]],
  });

  log('5. agent tries to overspend (must revert on-chain)');
  try {
    await send('agent-overspend-reverted', agentWallet, {
      address: vault,
      abi: streamVaultAbi,
      functionName: 'createStreams',
      args: [employer.address, [buildStreamParams({ recipient: chiAddr, amount: parseAmount('0.2'), start: t2 + 120, durationSeconds: 600 })]],
    }, true);
  } catch (e) {
    log('  unexpected:', e.name, e.shortMessage ?? e.message);
  }

  log('6. claim (anyone may trigger; pays the recipient) — waiting out the 60s cliff');
  await new Promise((r) => setTimeout(r, 75_000));
  await send('withdraw-keeper', employerWallet, { address: vault, abi: streamVaultAbi, functionName: 'withdraw', args: [id1] });

  log('7. revoke the agent, then prove it is locked out');
  await send('revokeOperator', employerWallet, { address: vault, abi: streamVaultAbi, functionName: 'revokeOperator', args: [agent.address] });
  try {
    await send('agent-after-revoke-reverted', agentWallet, {
      address: vault,
      abi: streamVaultAbi,
      functionName: 'createStreams',
      args: [employer.address, [buildStreamParams({ recipient: chiAddr, amount: ada, start: t2 + 120, durationSeconds: 600 })]],
    }, true);
  } catch (e) {
    log('  unexpected:', e.name, e.shortMessage ?? e.message);
  }

  log('8. cancel the second stream (vested stays claimable, rest refunded)');
  await send('cancel', employerWallet, { address: vault, abi: streamVaultAbi, functionName: 'cancel', args: [id2] });

  const out = Object.fromEntries(Object.entries(hashes).map(([k, v]) => [k, { ...v, explorer: explorerTx(v.hash) }]));
  writeFileSync(join(root, 'deployments/demo-run.json'), JSON.stringify({ ranAt: new Date().toISOString(), chainId: 44005, vault, streams: { id1: String(id1), id2: String(id2) }, transactions: out }, null, 2) + '\n');
  log('\nAll hashes written to deployments/demo-run.json');
  for (const [label, h] of Object.entries(hashes)) log(`${label.padEnd(24)} ${h.status.padEnd(8)} ${explorerTx(h.hash)}`);
}

main().catch((e) => {
  console.error('Error:', e.shortMessage ?? e.message);
  process.exit(1);
});
