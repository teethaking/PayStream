# Architecture

PayStream has three parts and no backend: one immutable contract, a static web app that reads the chain directly,
and a CLI that plays the AI payroll agent. All three share `@paystream/sdk`.

```mermaid
flowchart TB
  subgraph Chain["QDay Aevum testnet (44005)"]
    T[tUSD8<br/>EIP-2612 / EIP-3009]
    V[(StreamVault)]
    V <-- "safeTransferFrom / safeTransfer" --> T
  end
  subgraph Web["web/ (static build)"]
    UI[Pages: Landing · Employer · Agent · Claim · Activity · Safety]
    IDX[Event indexer<br/>chunked eth_getLogs ≤1,000 blocks<br/>poll + backoff + localStorage cache]
    TX[runTx engine<br/>simulate → fee → legacy tx → poll receipt]
    W[Wallet layer<br/>EIP-1193 or demo burner]
    UI --> IDX
    UI --> TX --> W
  end
  subgraph SDK["packages/paystream-sdk"]
    M[vesting + cap math] --- A[BigInt amounts] --- E[error decoding] --- P[permit domain] --- L[chunked logs]
  end
  CLI[agent/ CLI<br/>AGENT_PRIVATE_KEY]
  IDX -- "HTTPS JSON-RPC" --> V
  TX -- "HTTPS JSON-RPC" --> V
  CLI -- "HTTPS JSON-RPC" --> V
  Web -.uses.-> SDK
  CLI -.uses.-> SDK
```

## Contract: `StreamVault`

State:

- `treasury[employer]`: unallocated tUSD8 per employer.
- `_streams[id]`: `{sender, recipient, total, withdrawn, start, cliff, end, cancelable, canceled}` packed into 3 slots.
- `operators[employer][operator]`: `{perStreamCap, dailyCap, expiry, dayIndex, spentToday}`.

Vesting: `0` before `cliff`, `total * (t - start) / (end - start)` between cliff and end, `total` at or after
`end`. A cliff therefore releases the linear amount accrued since `start` in one step. On `cancel`, `total` shrinks to
the vested amount, so the recipient keeps exactly what had vested and the unvested remainder goes back to the employer's
wallet (not the treasury).

Operator authorization (`_authorize`) runs per stream, including inside a batch, so a batch is checked row by row and
the whole transaction reverts if any row breaks a cap. The daily counter resets lazily when the UTC day index changes.

There is no owner, no pause and no upgrade path.

## Web app data flow

The app treats events as the source of truth and derives everything from them, then re-checks the numbers that matter
against `eth_call`:

| Need | Source |
| --- | --- |
| Streams (including withdrawn and canceled state) | `StreamCreated`, `Withdrawn`, `StreamCanceled` (`lib/derive.ts`) |
| Operators, agent activity log | `OperatorSet`, `OperatorRevoked`, `StreamCreated.createdBy` |
| Treasury | Derived from events, confirmed by `treasury(employer)` every 15 s |
| Operator usage | Derived, confirmed by `operators(employer, agent)` every 15 s |
| Claimable amount | Interpolated every animation frame with the contract's formula, re-anchored to `withdrawableOf` and the latest block timestamp |

Because Aevum's RPC has no WebSocket and caps `eth_getLogs` at 1,000 blocks, the indexer scans forward from the
deployment block in 1,000-block windows, retries with exponential backoff, caches results in `localStorage`, polls
every 6 s and pauses while the tab is hidden.

## Transaction lifecycle (`web/src/lib/tx.ts`)

```mermaid
stateDiagram-v2
  [*] --> Sign: wallet connected, right network, has tQDAY
  Sign --> Submit: permit signed (if any), simulateContract ok, fee estimated
  Sign --> Error: user rejected / simulation reverted (friendly message)
  Submit --> Confirm: legacy tx broadcast, hash shown
  Confirm --> Confirm: replaced tx followed
  Confirm --> Done: receipt success (confetti + toast + explorer link)
  Confirm --> Blocked: receipt reverted (overspend demo)
  Done --> [*]
```

## Permit deposit

1. Read the token's EIP-712 domain: `eip712Domain()` if implemented, otherwise `name()` and `version()`, falling back to `tUSD8` / `2`.
2. Recompute the domain separator and assert it equals `DOMAIN_SEPARATOR()` before asking the user to sign.
3. Sign `Permit(owner, spender = vault, value, nonce, deadline)` off-chain.
4. `depositWithPermit(amount, deadline, v, r, s)`. If someone front-runs the permit, the call still succeeds as long as the allowance is in place.

On the real tUSD8, `eip712Domain()` reverts and `version()` returns `"2"`; the derived separator matches the on-chain
one (covered by `test/fork`).

## Agent

The agent is just another key. In the web demo it is a second burner in `localStorage`; in the CLI it is
`AGENT_PRIVATE_KEY`. The payroll assistant parses plain English deterministically into stream rows, replays the cap
logic off-chain (`checkOperatorCaps`) to predict PASS or BLOCKED, shows the exact calldata, and then lets the contract
have the final word.
