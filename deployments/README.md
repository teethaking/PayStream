# Deployments

`aevum-44005.json` is written by `node scripts/sync-artifacts.mjs` from the real Foundry broadcast
log after `forge script script/Deploy.s.sol --rpc-url aevum --broadcast --legacy`. The script checks the
receipt status and that code exists at the address before writing. Until that file exists the web app
and agent run with no vault configured and say so.
