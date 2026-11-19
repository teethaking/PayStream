# Verifying StreamVault

Explorer source verification may not be enabled on QDay Aevum, so this repo ships everything needed to rebuild the
exact deployed bytecode yourself.

| | |
| --- | --- |
| Contract | `src/StreamVault.sol:StreamVault` |
| Address (Aevum 44005) | _PLACEHOLDER: see `deployments/aevum-44005.json` after deployment_ |
| Deploy tx | _PLACEHOLDER_ |
| Constructor args | `(address token)` = `0x456569838f1d43009A91ebA4263147Afd7233483` |
| Compiler | solc `0.8.28` |
| EVM version | `shanghai` |
| Optimizer | enabled, `200` runs, no via-IR |
| Metadata | `bytecodeHash: ipfs`, CBOR appended |
| OpenZeppelin | v5.1.0 (pinned: v5.2+ uses `mcopy`, which Shanghai lacks) |

## Files

- [`verification/StreamVault.standard-input.json`](verification/StreamVault.standard-input.json): solc standard-JSON input (only the 11 sources the contract uses). Compiling it reproduces Foundry's creation and runtime bytecode **byte for byte, including the metadata hash** (checked when the file was generated).
- [`verification/StreamVault.flattened.sol`](verification/StreamVault.flattened.sol): single-file source from `forge flatten`. Compiled with the same settings it yields the same executable code; the trailing metadata hash differs because the source layout differs.

## Reproduce

```bash
# 1. Compile the standard-JSON input
solc-0.8.28 --standard-json docs/verification/StreamVault.standard-input.json > /tmp/out.json

# 2. Compare with the chain (runtime code; immutables are embedded, so compare against your deployment)
ADDR=$(jq -r .streamVault deployments/aevum-44005.json)
cast code $ADDR --rpc-url https://rpc-test.qday.info > /tmp/onchain.hex
node -e '
const o = require("/tmp/out.json").contracts["src/StreamVault.sol"].StreamVault.evm.deployedBytecode;
const fs = require("fs");
let local = o.object;
// patch the immutable "token" references with the constructor argument
const token = "456569838f1d43009a91eba4263147afd7233483".padStart(64, "0");
for (const refs of Object.values(o.immutableReferences)) for (const r of refs) local = local.slice(0, r.start * 2) + token + local.slice((r.start + r.length) * 2);
const chain = fs.readFileSync("/tmp/onchain.hex", "utf8").trim().slice(2).toLowerCase();
console.log(local.toLowerCase() === chain ? "MATCH" : "MISMATCH");
'
```

With Foundry you can also run:

```bash
forge verify-bytecode $ADDR StreamVault --rpc-url https://rpc-test.qday.info --constructor-args $(cast abi-encode "f(address)" 0x456569838f1d43009A91ebA4263147Afd7233483)
```

If the Aevum explorer exposes a Blockscout-compatible verification API, `forge verify-contract` with
`--verifier blockscout --verifier-url https://explorer-test.qday.info/api` and the settings above should work; the
result will be recorded here once tried.
