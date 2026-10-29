// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { COURFactory } from "../src/COURFactory.sol";
import { Script, console2 } from "forge-std/Script.sol";

/// @notice Restore the production launch params (start $4,000 / grad $60,000) after the closed smoke test.
///         The launch allowlist is intentionally LEFT ENABLED (public opening is a separate decision).
contract RestoreParams is Script {
    function run() external {
        string memory dep = vm.readFile("deployments/4663.json");
        COURFactory factory = COURFactory(vm.parseJsonAddress(dep, ".factory"));

        uint256 pk = vm.envUint("DEPLOYER_PK");
        vm.startBroadcast(pk);
        factory.setLaunchParams(4_000, 60_000, 50_000, 0);
        vm.stopBroadcast();

        require(factory.startMcUsd() == 4_000 && factory.gradMcUsd() == 60_000, "params not restored");
        require(factory.launchAllowlistEnabled(), "allowlist must stay enabled");
        console2.log("Restored launch params to 4000/60000; allowlist still enabled");
    }
}
