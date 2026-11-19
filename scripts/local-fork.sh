#!/usr/bin/env bash
# Local end-to-end sandbox: an anvil fork of Aevum (chain 44005) with the REAL tUSD8 contract,
# a freshly deployed StreamVault, and test balances written straight into fork storage.
# Nothing here touches the live testnet.
#
#   anvil --fork-url https://rpc-test.qday.info --chain-id 44005 --port 8545 &   # terminal 1
#   scripts/local-fork.sh 0xYourBurner 0xYourAgent                               # terminal 2
#   VITE_RPC_URL=http://127.0.0.1:8545 VITE_VAULT_ADDRESS=… VITE_VAULT_DEPLOY_BLOCK=… pnpm --filter @paystream/web dev
set -euo pipefail
RPC=${LOCAL_RPC:-http://127.0.0.1:8545}
TOKEN=0x456569838f1d43009A91ebA4263147Afd7233483
BALANCE_SLOT=11 # tUSD8 balances mapping slot (found with forge-std stdstore on a fork)
# anvil's well-known default account #0; only valid on a local anvil chain
DEPLOYER_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
cd "$(dirname "$0")/.."

fund() {
  local who=$1
  cast rpc anvil_setBalance "$who" 0x56BC75E2D63100000 --rpc-url "$RPC" >/dev/null # 100 tQDAY
  local slot
  slot=$(cast index address "$who" $BALANCE_SLOT)
  cast rpc anvil_setStorageAt $TOKEN "$slot" 0x$(printf '%064x' 100000000000) --rpc-url "$RPC" >/dev/null # 100,000 tUSD8
  echo "funded $who: $(cast call $TOKEN 'balanceOf(address)(uint256)' "$who" --rpc-url "$RPC") tUSD8 base units"
}

VAULT=$(forge create src/StreamVault.sol:StreamVault --rpc-url "$RPC" --private-key $DEPLOYER_KEY --legacy --broadcast --json --constructor-args $TOKEN 2>/dev/null | grep -o '"deployedTo": *"0x[0-9a-fA-F]*"' | grep -o '0x[0-9a-fA-F]*')
BLOCK=$(cast block-number --rpc-url "$RPC")
for a in "$@"; do fund "$a"; done
echo
echo "VITE_RPC_URL=$RPC"
echo "VITE_VAULT_ADDRESS=$VAULT"
echo "VITE_VAULT_DEPLOY_BLOCK=$BLOCK"
