// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { CourDeployer } from "./DeployCore.s.sol";
import { console2 } from "forge-std/Script.sol";

/// @notice Deploy the full COUR core to Robinhood Chain (reads addresses from script/config/rh-mainnet.json
///         and secrets from .env). Run WITHOUT --broadcast first to dry-run; add --broadcast to deploy.
///         Writes all deployed addresses to deployments/4663.json.
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
        Deployed memory d = _deployCore(deployer, poolManager, positionManager, v3Router, weth, usdg, treasury);
        vm.stopBroadcast();

        // Persist addresses for the follow-up scripts + the record (deployments/4663.json).
        string memory o = "deploy";
        vm.serializeUint(o, "chainId", block.chainid);
        vm.serializeUint(o, "block", block.number);
        vm.serializeAddress(o, "deployer", deployer);
        vm.serializeAddress(o, "treasury", treasury);
        vm.serializeAddress(o, "poolManager", poolManager);
        vm.serializeAddress(o, "positionManager", positionManager);
        vm.serializeAddress(o, "priceReader", address(d.priceReader));
        vm.serializeAddress(o, "feeVault", address(d.feeVault));
        vm.serializeAddress(o, "curveImpl", address(d.curveImpl));
        vm.serializeAddress(o, "hook", address(d.hook));
        vm.serializeAddress(o, "factory", address(d.factory));
        string memory out = vm.serializeAddress(o, "router", address(d.router));
        vm.writeJson(out, "deployments/4663.json");
        console2.log("Wrote deployments/4663.json");
    }
}
