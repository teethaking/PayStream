// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {StreamVault} from "../src/StreamVault.sol";

/// PRIVATE_KEY=0x... forge script script/Deploy.s.sol --rpc-url aevum --broadcast --legacy
/// then: node scripts/sync-artifacts.mjs   (writes deployments/aevum-44005.json and the TS ABIs)
contract Deploy is Script {
    // tUSD8 on QDay Aevum testnet (chain 44005), 6 decimals
    address constant TUSD8 = 0x456569838f1d43009A91ebA4263147Afd7233483;

    function run() external {
        vm.startBroadcast(vm.envUint("PRIVATE_KEY"));
        StreamVault vault = new StreamVault(IERC20(TUSD8));
        vm.stopBroadcast();
        console.log("StreamVault:", address(vault));
    }
}
