// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { COURFactory } from "../src/COURFactory.sol";
import { COURFeeVault } from "../src/COURFeeVault.sol";
import { Constants } from "../src/libraries/Constants.sol";
import { Script, console2 } from "forge-std/Script.sol";

/// @notice Restore production params after the closed smoke test: launch params (start $4,000 / grad
///         $60,000) and minBuybackUsd ($50). The launch allowlist is intentionally LEFT ENABLED and
///         ownership stays with the deployer (public opening is a separate, later decision — see GO_LIVE.md).
contract RestoreParams is Script {
    function run() external {
        string memory dep = vm.readFile("deployments/4663.json");
        COURFactory factory = COURFactory(vm.parseJsonAddress(dep, ".factory"));
        COURFeeVault vault = COURFeeVault(vm.parseJsonAddress(dep, ".feeVault"));

        uint256 pk = vm.envUint("DEPLOYER_PK");
        vm.startBroadcast(pk);
        factory.setLaunchParams(4_000, 60_000, Constants.DEFAULT_MIN_REF_LIQ_USD, 0);
        vault.setMinBuybackUsd(Constants.DEFAULT_MIN_BUYBACK_USD);
        vm.stopBroadcast();

        require(factory.startMcUsd() == 4_000 && factory.gradMcUsd() == 60_000, "params not restored");
        require(vault.minBuybackUsd() == Constants.DEFAULT_MIN_BUYBACK_USD, "minBuyback not restored");
        require(factory.launchAllowlistEnabled(), "allowlist must stay enabled");
        console2.log("Restored launch params 4000/60000 + minBuybackUsd 50; allowlist still enabled");
    }
}
