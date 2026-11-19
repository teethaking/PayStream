# PayStream demo script (3:45 target, 5:00 max)

Everything happens on **QDay Aevum testnet (44005)** with **tUSD8 test tokens**. Every on-chain step below must be a
real transaction; paste its hash into the table at the end before recording the voice-over.

**Prep (off camera)**

- Employer wallet funded with tQDAY + tUSD8 from the faucet; agent key (browser agent burner, or the CLI's `AGENT_PRIVATE_KEY`) funded with tQDAY.
- Second browser profile (or phone) for the employee "Ada".
- App open at the landing page, dark theme, 1440×900, browser zoom 100%, notifications off.
- Explorer tab ready: https://explorer-test.qday.info

## Storyboard

| # | Time | Scene | On screen (shot list) | Caption (exact on-screen text) | Voice-over |
| --- | --- | --- | --- | --- | --- |
| 1 | 0:00–0:20 | Problem | Landing hero: coins flowing from Employer to Employees; headline reveals | **Payroll is a monthly batch job. AI agents with hot keys can drain treasuries.** | "Payroll still moves once a month. And the hot new idea, letting an AI run payroll, usually means giving a bot a key to the whole treasury." |
| 2 | 0:20–0:40 | Connect + demo funds | Click **Try instant demo** → TESTNET banner → **Get test funds** (faucet opens, address copied). Cut to funded balance. | **One click: burner wallet on Aevum testnet. Test tokens only.** | "PayStream runs on QDay's Aevum testnet. No wallet? One click gives you a throwaway burner, and the faucet gives it test tUSD8." |
| 3 | 0:40–1:05 | Permit deposit | Employer → Treasury → Deposit 2,000 with permit. Stepper shows **Sign permit → Submit → Confirm → Done**, confetti, explorer chip. | **One signature funds the treasury (EIP-2612 permit, real tUSD8 domain v2).** | "The employer funds a treasury with a single signature: an EIP-2612 permit, using the domain the token reports on-chain." |
| 4 | 1:05–1:40 | Batch payroll from chat | Agent page → Payroll Assistant: type *Pay Ada 500 and Tobe 300 tUSD8 over 3 months, 1 month cliff*. Parsed table, PASS, calldata summary. **Sign as employer** → one `createStreams` tx. | **Plain English → one batch transaction. Parsed locally, no API key.** | "Payroll in plain English. The assistant parses it locally, shows the exact calldata, and one transaction creates both streams." |
| 5 | 1:40–2:05 | Live claim | Switch to Ada's browser: `/claim/<id>`. Big ticking number (use a short demo stream so it moves visibly), timeline with cliff and now marker. **Withdraw** → confetti. Then show **Pay it forward** from another wallet. | **Pay streams by the second. Anyone can trigger a payout; it always goes to the employee.** | "Ada watches her pay accrue every second and withdraws whenever she wants. A keeper can even trigger it for her: the money can only go to Ada." |
| 6 | 2:05–2:30 | Grant the agent | Agent page → Grant: per-stream 1,000, daily 1,500, expiry 24h. Plain-language summary visible. Tx done. Gauges animate in. | **Scoped, expiring, revocable: 1,000 per stream, 1,500 per day, 24 hours. Never cancel, never withdraw.** | "Now the AI agent. The employer grants it a scoped role: caps per stream and per day, an expiry, and no power to cancel or withdraw." |
| 7 | 2:30–3:05 | Overspend blocked on-chain | Agent creates a 1,000 stream (gauge fills, turns amber). Click **Try to overspend**: predicted BLOCKED, then broadcast; ring shakes; card **Blocked by contract: daily cap exceeded**; open the reverted tx in the explorer. Optionally show the same with the CLI: `pnpm agent overspend`. | **The contract, not the prompt, says no. Reverted on-chain: DailyCapExceeded.** | "Let's make the agent overspend. The prediction says blocked, and we send it anyway. The contract reverts it on-chain. The agent physically cannot overspend." |
| 8 | 3:05–3:15 | Revoke | One-click **Revoke**. Status flips to Revoked; agent attempt fails with NotAuthorized. | **Instant revocation: one transaction.** | "And if anything looks off, one click revokes it." |
| 9 | 3:15–3:30 | Cancel with split | Employer → Streams → Cancel Tobe's stream. Sheet shows the exact split: vested to Tobe, unvested refunded. Confirm. | **Cancel never claws back earned pay: vested stays claimable, the rest is refunded.** | "Cancelling is fair by construction: what's vested stays with the employee, only the unvested part comes back." |
| 10 | 3:30–3:40 | Audit trail | Activity page: every event with explorer links, filter by operator, **Export CSV**. | **Every action is on-chain and attributable, including what the agent did.** | "Everything is auditable: which streams the agent created, every payout, every cancel." |
| 11 | 3:40–3:55 | Roadmap | Safety page diagram, then README roadmap | **Next: SDK on npm · ERC-8004 agent identity · ERC-4337 session keys with gas in tUSD8 · NFT streams · mainnet** | "Next: an SDK on npm, verifiable agent identities with ERC-8004, session keys with gas paid in tUSD8, and mainnet when Aevum launches." |

## Transaction log (real, run on Aevum 44005)

Recorded by `agent/src/demo.mjs` (and `deployments/demo-run.json` is the machine-readable copy). The storyboard used a
small treasury (0.275 tUSD8) because the faucet gives 5 tUSD8 per address; the app is the same at any size.

| Step | Action | Tx hash | Explorer |
| --- | --- | --- | --- |
| 0 | Deploy StreamVault | `0xfe9aafa3baa2e3451359d9915a09f2980a5fd2552182ca3bd2bbb742ae2e360b` (success, block 3545074) | [/tx/0xfe9aafa3ba](https://explorer-test.qday.info/tx/0xfe9aafa3baa2e3451359d9915a09f2980a5fd2552182ca3bd2bbb742ae2e360b) |
| 3 | depositWithPermit | `0x3dd61933d82df122cd03286ae642a339f419da51d8111b7bf700f8628a8b91eb` (success, block 3545241) | [/tx/0x3dd61933d8](https://explorer-test.qday.info/tx/0x3dd61933d82df122cd03286ae642a339f419da51d8111b7bf700f8628a8b91eb) |
| 4 | createStreams (batch from assistant) | `0x4254ad460feac810f9f32b64f85aaea986d0e9fa1bb511500151463711b642cd` (success, block 3545245) | [/tx/0x4254ad460f](https://explorer-test.qday.info/tx/0x4254ad460feac810f9f32b64f85aaea986d0e9fa1bb511500151463711b642cd) |
| 5 | withdraw (recipient) | `0x830cbead41809ec14a8cae0bdfa35d794dd9aebafab2026f5f0407676081c9f5` (success, block 3545329) | [/tx/0x830cbead41](https://explorer-test.qday.info/tx/0x830cbead41809ec14a8cae0bdfa35d794dd9aebafab2026f5f0407676081c9f5) |
| 5 | withdraw (keeper, pay it forward) | `0x830cbead41809ec14a8cae0bdfa35d794dd9aebafab2026f5f0407676081c9f5` (success, block 3545329) | [/tx/0x830cbead41](https://explorer-test.qday.info/tx/0x830cbead41809ec14a8cae0bdfa35d794dd9aebafab2026f5f0407676081c9f5) |
| 6 | setOperator | `0x574b4a473eefd3a4413dd1b321fb5a76cdbf258de91ac1faddd971c28ee7b8c0` (success, block 3545359) | [/tx/0x574b4a473e](https://explorer-test.qday.info/tx/0x574b4a473eefd3a4413dd1b321fb5a76cdbf258de91ac1faddd971c28ee7b8c0) |
| 7 | createStreams by agent (within caps) | `0x26a43d3cecc80c5fac92cbffccc5f4f829ac562415a9bf1cad6aa601404095a3` (success, block 3545363) | [/tx/0x26a43d3cec](https://explorer-test.qday.info/tx/0x26a43d3cecc80c5fac92cbffccc5f4f829ac562415a9bf1cad6aa601404095a3) |
| 7 | createStreams by agent (over cap, **reverted**) | `0x0b1cac359853697a8082bcb3c2d543107ed3386fe3e404342c1f7dd545380ed4` (reverted, block 3545366) | [/tx/0x0b1cac3598](https://explorer-test.qday.info/tx/0x0b1cac359853697a8082bcb3c2d543107ed3386fe3e404342c1f7dd545380ed4) |
| 8 | revokeOperator | `0x11b1cd07789675809b8c53bd89d12196c9f2a3bdc906c039f7770ba67eede50d` (success, block 3545333) | [/tx/0x11b1cd0778](https://explorer-test.qday.info/tx/0x11b1cd07789675809b8c53bd89d12196c9f2a3bdc906c039f7770ba67eede50d) |
| 9 | cancel | `0xf4334577d6423853263f1681c665da2a8d9c06fc29b04fd544b35fb6792dc6e9` (success, block 3545340) | [/tx/0xf4334577d6](https://explorer-test.qday.info/tx/0xf4334577d6423853263f1681c665da2a8d9c06fc29b04fd544b35fb6792dc6e9) |

## Recording tips

- Use a demo stream of a few minutes (start = now, end = now + 10 min) for scene 5 so the number visibly races.
- Keep the transactions panel visible in the bottom-right corner; it is the proof each step hit the chain.
- Record at 60 fps; the reduced-motion OS setting must be off.
