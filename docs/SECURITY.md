# Security

> **Unaudited hackathon code. Testnet only (QDay Aevum 44005, tUSD8 test tokens). Do not use with real funds.**

## Trust model

- No owner, admin, pause or upgrade. Deployed bytecode is final.
- One immutable token per vault (tUSD8).
- Each employer's treasury is isolated: no function moves one employer's funds on another's behalf except through an operator grant that employer made.
- Operators can only call `createStream` / `createStreams` for the employer that granted them.

## Threats and mitigations

| Threat | Mitigation | Residual risk |
| --- | --- | --- |
| **Compromised operator (agent) key** | Per-stream cap, daily cap, expiry, instant `revokeOperator`. Operators cannot cancel, withdraw the treasury or change their own grant. Streams are funded only from the treasury, never from the employer's wallet. | Until revoked or expired, an attacker can create streams up to the caps, to any recipient, with any schedule (including `cancelable = false`). Worst case per day ≈ `dailyCap`. Keep caps tight and expiries short; monitor `StreamCreated.createdBy`. A future version could whitelist recipients or force `cancelable = true` for operator-created streams. |
| **Re-grant resets daily usage** | `setOperator` writes a fresh struct with `spentToday = 0`. Only the employer can call it. | An employer who re-grants mid-day allows up to one more `dailyCap` that day. Documented, by design. |
| **Front-run permit** | `depositWithPermit` wraps `permit` in `try/catch` and proceeds if the allowance is already sufficient. | The front-runner wastes gas; the deposit still lands. |
| **Wrong permit domain** | The app derives the domain at runtime and asserts it against `DOMAIN_SEPARATOR()` before signing; fork test rejects a version-`1` signature. | None known. |
| **Reentrancy** | OpenZeppelin `ReentrancyGuard` on every state-changing external function; checks-effects-interactions (state updated before `safeTransfer`). | tUSD8 has no transfer hooks today. |
| **Rounding** | Vesting uses floor division in uint256; `total` is uint128 and timestamps uint40, so `total * elapsed` cannot overflow. On cancel, `total` is set to the vested amount, so `withdrawn ≤ total` always holds and payouts + refund equal the original amount exactly (fuzzed and invariant-tested). | A stream can lag by under one base unit until `end`. |
| **Griefing withdrawals** | `withdraw(id)` is permissionless but always pays `s.recipient`; a keeper can only make the recipient get paid earlier. | None. |
| **Timestamp manipulation** | Schedules are coarse (minutes to years). | Sequencer timestamp drift shifts vesting by seconds. |
| **Token behaviour changes** | `SafeERC20` for all transfers. | tUSD8 is an upgradeable test token (EIP-3009/permit); a malicious upgrade or blacklist could freeze funds. Out of scope for a testnet entry. |
| **Front-end key handling** | Demo burner keys live in `localStorage` and are labelled TESTNET ONLY. Real wallets go through EIP-1193; the app never sees their keys. CLI keys come from env vars only; `.env` is git-ignored. | Anyone with access to the browser profile can use a burner key. |

## Invariants (tested in `test/invariant`)

1. `token.balanceOf(vault) ≥ Σ treasury + Σ (stream.total − stream.withdrawn)`, with exact equality when nobody donates tokens.
2. Every successful operator batch respects the per-stream cap and the per-UTC-day cap since the latest grant.
3. For every stream: payouts + cancel refund ≤ original amount; `withdrawn ≤ total`; `vestedOf ≤ total`; `withdrawableOf = vestedOf − withdrawn`; `total` only changes on cancel.

## Reporting

This is a hackathon project. Please open a GitHub issue for anything you find.
