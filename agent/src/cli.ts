#!/usr/bin/env -S npx tsx
/**
 * PayStream payroll agent. Acts as an OPERATOR key: it can create streams from an employer's treasury,
 * strictly within the per-stream cap, daily cap and expiry the employer set on-chain. It cannot cancel
 * streams or withdraw funds; the contract enforces that, not this script.
 *
 *   AGENT_PRIVATE_KEY=0x… pnpm agent run payroll.json
 *   AGENT_PRIVATE_KEY=0x… pnpm agent status --employer 0x…
 *   AGENT_PRIVATE_KEY=0x… pnpm agent overspend --employer 0x…   # proves the on-chain cap refusal
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPublicClient, createWalletClient, encodeFunctionData, formatEther, http, isAddress, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  AEVUM_RPC_URL,
  DAY,
  aevumTestnet,
  checkOperatorCaps,
  explorerTx,
  formatAmount,
  spentToday,
  streamVaultAbi,
  toFriendlyError,
  VAULT_ERROR_MESSAGES,
  type StreamParams,
} from '@paystream/sdk';
import { parsePayroll, type PayrollFile } from './payroll.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const c = { dim: '\x1b[2m', bold: '\x1b[1m', green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m', cyan: '\x1b[36m', reset: '\x1b[0m' };
const paint = (color: keyof typeof c, s: string) => (process.stdout.isTTY ? c[color] + s + c.reset : s);
const money = (v: bigint) => `${formatAmount(v)} tUSD8`;
const isLocal = () => /127\.0\.0\.1|localhost/.test(process.env.AEVUM_RPC_URL ?? '');
const link = (hash: Hex) => (isLocal() ? `${hash} (local fork, not on the public explorer)` : explorerTx(hash));

function vaultAddress(): Address {
  const fromEnv = process.env.VAULT_ADDRESS;
  if (fromEnv) {
    if (!isAddress(fromEnv)) throw new Error('VAULT_ADDRESS is not a valid address');
    return fromEnv;
  }
  const file = join(root, 'deployments/aevum-44005.json');
  if (!existsSync(file)) throw new Error('No vault address: deploy first (deployments/aevum-44005.json) or set VAULT_ADDRESS.');
  return JSON.parse(readFileSync(file, 'utf8')).streamVault as Address;
}

function agentKey(): Hex {
  const raw = process.env.AGENT_PRIVATE_KEY?.trim();
  const k = raw && !raw.startsWith('0x') ? `0x${raw}` : raw;
  if (!k || !/^0x[0-9a-fA-F]{64}$/.test(k)) throw new Error('Set AGENT_PRIVATE_KEY (64 hex chars, 0x optional). It is read from the environment only.');
  return k as Hex;
}

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

const rpc = process.env.AEVUM_RPC_URL ?? AEVUM_RPC_URL;
const publicClient = createPublicClient({ chain: aevumTestnet, transport: http(rpc, { retryCount: 4, retryDelay: 500 }) });

async function setup() {
  const account = privateKeyToAccount(agentKey());
  const wallet = createWalletClient({ account, chain: aevumTestnet, transport: http(rpc, { retryCount: 3 }) });
  const vault = vaultAddress();
  const gas = await publicClient.getBalance({ address: account.address });
  return { account, wallet, vault, gas };
}

async function readOperator(vault: Address, employer: Address, agent: Address) {
  const [perStreamCap, dailyCap, expiry, dayIndex, spent] = await publicClient.readContract({ address: vault, abi: streamVaultAbi, functionName: 'operators', args: [employer, agent] });
  return { perStreamCap, dailyCap, expiry: Number(expiry), dayIndex: Number(dayIndex), spentToday: spent };
}

async function chainNow() {
  return Number((await publicClient.getBlock()).timestamp);
}

function printOperator(op: Awaited<ReturnType<typeof readOperator>>, now: number) {
  if (op.expiry === 0) return console.log(paint('red', '  No operator grant from this employer. Ask them to grant this agent in the PayStream app.'));
  const left = op.expiry - now;
  const used = spentToday(op, now);
  console.log(`  per-stream cap  ${money(op.perStreamCap)}`);
  console.log(`  daily cap       ${money(op.dailyCap)}  (used today: ${money(used)}, left: ${money(op.dailyCap - used)})`);
  console.log(`  expiry          ${new Date(op.expiry * 1000).toISOString()} ${left > 0 ? paint('green', `(${(left / 3600).toFixed(1)}h left)`) : paint('red', '(expired)')}`);
}

async function send(wallet: ReturnType<typeof createWalletClient>, vault: Address, employer: Address, params: StreamParams[], force = false) {
  const account = wallet.account!;
  const call = { address: vault, abi: streamVaultAbi, functionName: 'createStreams', args: [employer, params] } as const;
  let gas = 600_000n;
  if (!force) {
    await publicClient.simulateContract({ ...call, account });
    gas = ((await publicClient.estimateContractGas({ ...call, account })) * 12n) / 10n;
  }
  const hash = await wallet.writeContract({ ...call, account, chain: aevumTestnet, type: 'legacy', gas, gasPrice: await publicClient.getGasPrice() });
  console.log(paint('dim', `  submitted ${hash}, polling for receipt…`));
  const receipt = await publicClient.waitForTransactionReceipt({ hash, pollingInterval: 1_500, timeout: 180_000 });
  return { hash, receipt };
}

async function status() {
  const employer = arg('employer');
  if (!employer || !isAddress(employer)) throw new Error('Usage: agent status --employer 0x…');
  const { account, vault, gas } = await setup();
  console.log(paint('bold', 'PayStream agent'));
  console.log(`  agent    ${account.address} (${formatEther(gas)} tQDAY)`);
  console.log(`  vault    ${vault}`);
  console.log(`  employer ${employer}`);
  printOperator(await readOperator(vault, employer, account.address), await chainNow());
}

async function run(file?: string) {
  if (!file) throw new Error('Usage: agent run payroll.json');
  const raw = JSON.parse(readFileSync(resolve(file), 'utf8')) as PayrollFile;
  const now = await chainNow();
  const payroll = parsePayroll(raw, now);
  const { account, wallet, vault, gas } = await setup();
  if (gas === 0n) throw new Error(`Agent ${account.address} has no tQDAY for gas. Use the faucet first.`);

  const op = await readOperator(vault, payroll.employer, account.address);
  console.log(paint('bold', `\nPayroll for ${payroll.employer} (${payroll.rows.length} streams)`));
  printOperator(op, now);

  // Greedy: take rows in order while they fit both caps; refuse the rest and say why.
  const accepted: typeof payroll.rows = [];
  const refused: { name: string; amount: bigint; reason: string }[] = [];
  for (const row of payroll.rows) {
    const check = checkOperatorCaps(op, [...accepted.map((a) => a.params), row.params], now);
    if (check.ok) accepted.push(row);
    else refused.push({ name: row.name, amount: row.params.amount, reason: VAULT_ERROR_MESSAGES[check.reason].title });
  }

  console.log('');
  for (const r of accepted) console.log(`  ${paint('green', '✓ fits caps')}  ${r.name.padEnd(14)} ${money(r.params.amount).padStart(20)} → ${r.params.recipient}`);
  for (const r of refused) console.log(`  ${paint('red', '✗ refused  ')}  ${r.name.padEnd(14)} ${money(r.amount).padStart(20)}  (${r.reason})`);

  if (!accepted.length) {
    console.log(paint('yellow', '\nNothing fits within the caps. Run `agent overspend` to watch the contract refuse on-chain.'));
    return;
  }
  const calldata = encodeFunctionData({ abi: streamVaultAbi, functionName: 'createStreams', args: [payroll.employer, accepted.map((a) => a.params)] });
  console.log(paint('dim', `\n  createStreams(${payroll.employer}, [${accepted.length} streams]) selector ${calldata.slice(0, 10)}, ${(calldata.length - 2) / 2} bytes`));
  try {
    const { hash, receipt } = await send(wallet, vault, payroll.employer, accepted.map((a) => a.params));
    if (receipt.status !== 'success') throw new Error('reverted');
    console.log(paint('green', `\n✓ Created ${accepted.length} stream(s) in block ${receipt.blockNumber}`));
    console.log(`  ${link(hash)}`);
  } catch (e) {
    const f = toFriendlyError(e);
    console.log(paint('red', `\n✗ ${f.blockedByContract ? 'Blocked by contract: ' : ''}${f.title}`), `\n  ${f.message}`);
    process.exitCode = 1;
  }
}

async function overspend() {
  const employer = arg('employer');
  if (!employer || !isAddress(employer)) throw new Error('Usage: agent overspend --employer 0x… [--recipient 0x…]');
  const recipient = (arg('recipient') ?? employer) as Address;
  const { account, wallet, vault, gas } = await setup();
  if (gas === 0n) throw new Error(`Agent ${account.address} has no tQDAY for gas. Use the faucet first.`);
  const now = await chainNow();
  const op = await readOperator(vault, employer, account.address);
  printOperator(op, now);
  if (op.expiry === 0) return;
  const left = op.dailyCap - spentToday(op, now);
  // Pick the cap that is easiest to break while staying under the other one where possible.
  const amount = left < op.perStreamCap ? left + 1_000_000n : op.perStreamCap + 1_000_000n;
  const which = left < op.perStreamCap ? 'daily cap' : 'per-stream cap';
  const start = now + 120;
  const params: StreamParams = { recipient, amount, start, cliff: start, end: start + 30 * DAY, cancelable: true };
  console.log(paint('bold', `\nAttempting ${money(amount)}, which exceeds the ${which}…`));
  try {
    await publicClient.simulateContract({ address: vault, abi: streamVaultAbi, functionName: 'createStreams', args: [employer, [params]], account });
    console.log(paint('yellow', 'Simulation unexpectedly passed; not sending.'));
    return;
  } catch (e) {
    console.log(`  simulation: ${paint('red', toFriendlyError(e).title)}`);
  }
  console.log(paint('dim', '  broadcasting anyway so the refusal is recorded on-chain…'));
  const { hash, receipt } = await send(wallet, vault, employer, [params], true);
  console.log(receipt.status === 'reverted' ? paint('red', `\n✗ Reverted on-chain as expected: ${which} exceeded`) : paint('yellow', '\nUnexpected success'));
  console.log(`  ${link(hash)}`);
}

const [cmd, file] = process.argv.slice(2);
const commands: Record<string, () => Promise<void>> = { run: () => run(file), status, overspend };
const fn = cmd ? commands[cmd] : undefined;
if (!fn) {
  console.log('Usage:\n  agent run <payroll.json>\n  agent status --employer 0x…\n  agent overspend --employer 0x… [--recipient 0x…]');
  process.exit(cmd ? 1 : 0);
}
fn().catch((e) => {
  console.error(paint('red', `Error: ${(e as Error).message}`));
  process.exit(1);
});
