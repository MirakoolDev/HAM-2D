// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {HAMMaze} from "../src/HAMMaze.sol";
import {HAMKeeper} from "../src/HAMKeeper.sol";

/// @notice Deploy HAMMaze + HAMKeeper to MegaETH.
///
/// Usage:
///   forge script script/Deploy.s.sol \
///     --rpc-url megaeth \
///     --broadcast \
///     --verify \
///     -vvvv
///
/// Required env vars:
///   DEPLOYER_PRIVATE_KEY  — deployer wallet private key
contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer    = vm.addr(deployerKey);

        console.log("Deployer:", deployer);
        console.log("Chain ID:", block.chainid);

        vm.startBroadcast(deployerKey);

        // 1. Deploy HAMMaze
        HAMMaze maze = new HAMMaze(deployer);
        console.log("HAMMaze deployed at:", address(maze));

        // 2. Deploy HAMKeeper pointing at HAMMaze
        HAMKeeper keeper = new HAMKeeper(address(maze));
        console.log("HAMKeeper deployed at:", address(keeper));

        vm.stopBroadcast();

        // Print env var to paste into .env.local
        console.log("");
        console.log("=== Add to .env.local ===");
        console.log("NEXT_PUBLIC_HAM_CONTRACT=", address(maze));
        console.log("HAM_KEEPER_ADDRESS=", address(keeper));
    }
}
