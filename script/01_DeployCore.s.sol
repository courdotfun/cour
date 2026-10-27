// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { CourDeployer } from "./DeployCore.s.sol";

/// @notice Deploy the full COUR core to Robinhood Chain (reads addresses from script/config/rh-mainnet.json
///         and secrets from .env). Run WITHOUT --broadcast first to dry-run; add --broadcast to deploy.
contract DeployCore is CourDeployer {
    function run() external {
        string memory cfg = vm.readFile("script/config/rh-mainnet.json");
        address poolManager = vm.parseJsonAddress(cfg, ".poolManager");
        address positionManager = vm.parseJsonAddress(cfg, ".positionManager");
        address v3Router = vm.parseJsonAddress(cfg, ".v3SwapRouter02");
        address weth = vm.parseJsonAddress(cfg, ".weth");
        address usdg = vm.parseJsonAddress(cfg, ".usdg");

        uint256 pk = vm.envUint("DEPLOYER_PK");
        address treasury = vm.envAddress("TREASURY");
        address deployer = vm.addr(pk);

        vm.startBroadcast(pk);
        _deployCore(deployer, poolManager, positionManager, v3Router, weth, usdg, treasury);
        vm.stopBroadcast();
    }
}
