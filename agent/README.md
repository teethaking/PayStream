# PayStream agent CLI

A small Node/TypeScript CLI that acts as the **AI payroll agent's operator key**. The employer grants it a
scoped, expiring, revocable role in the PayStream app (`setOperator`). The agent can then create streams from the
employer's treasury, but only within the per-stream cap, the daily cap and the expiry. It can never cancel streams or
withdraw funds. The contract enforces this; the CLI only explains it.

Testnet only (QDay Aevum, chain 44005, tUSD8 test tokens). Unaudited hackathon code.

## Setup

```bash
pnpm install                      # from the repo root; also builds @paystream/sdk
export AGENT_PRIVATE_KEY=0x…      # testnet-only key, funded with tQDAY for gas (faucet)
# optional: VAULT_ADDRESS=0x… (defaults to deployments/aevum-44005.json), AEVUM_RPC_URL=…
```

The key is read from the environment only. Never commit it.

## Commands

```bash
pnpm agent status --employer 0xEmployer        # show the grant: caps, today's usage, expiry
pnpm agent run payroll.json                     # create streams that fit the caps, refuse the rest
pnpm agent overspend --employer 0xEmployer      # deliberately exceed a cap; the tx reverts on-chain
```

(From inside `agent/`, use `pnpm start <command>` instead.)

`run` reads the on-chain operator struct, replays the contract's cap logic off-chain (`checkOperatorCaps` from
`@paystream/sdk`), takes rows in order while they fit, prints a per-row verdict, simulates, and sends one
`createStreams` batch as a legacy (type 0) transaction. Rows that would break a cap are refused before sending.

`overspend` picks the tighter cap, builds a stream 1 tUSD8 over it, shows the simulated revert, then broadcasts
with a fixed gas limit anyway so the refusal (`PerStreamCapExceeded` or `DailyCapExceeded`) is recorded on-chain
with an explorer link. That is the demo's proof that the agent physically cannot overspend.

## payroll.json

See [`payroll.example.json`](./payroll.example.json):

| Field | Meaning |
| --- | --- |
| `employer` | Address whose treasury funds the streams (must have granted this agent) |
| `streams[].recipient` | Employee / beneficiary address |
| `streams[].amount` | tUSD8 as a decimal string, up to 6 decimals |
| `streams[].start` | Optional ISO-8601 start; defaults to now + 2 minutes |
| `streams[].cliffDays` | Optional cliff in days (nothing vests before it) |
| `streams[].durationDays` | Total stream length in days |
| `streams[].cancelable` | Optional, default `true`; `false` makes the stream non-cancelable forever |

Run the tests with `pnpm --filter @paystream/agent test`.
