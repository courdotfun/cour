// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { COURFactory } from "../src/COURFactory.sol";
import { COURPriceReader } from "../src/COURPriceReader.sol";
import { ICOURPriceReader } from "../src/interfaces/ICOURPriceReader.sol";
import { Script, console2 } from "forge-std/Script.sol";

/// @notice Allowlist stock tokens and bump v3 observation cardinality so TWAPs are available.
///         Requires COUR_FACTORY and COUR_PRICE_READER in the environment (from 01_DeployCore output).
contract ConfigureStocks is Script {
    function run() external {
        string memory cfg = vm.readFile("script/config/rh-mainnet.json");
        address nvda = vm.parseJsonAddress(cfg, ".nvda");
        address nvdaPool = vm.parseJsonAddress(cfg, ".nvdaUsdgPool");
        address wethUsdgPool = vm.parseJsonAddress(cfg, ".wethUsdgPool");

        COURFactory factory = COURFactory(vm.envAddress("COUR_FACTORY"));
        COURPriceReader reader = COURPriceReader(vm.envAddress("COUR_PRICE_READER"));

        uint256 pk = vm.envUint("DEPLOYER_PK");
        vm.startBroadcast(pk);

        // Grow cardinality so the 1800s TWAP is available (idempotent; call ahead of launches).
        reader.bumpCardinality(nvdaPool, 600);
        if (wethUsdgPool != address(0)) {
            reader.bumpCardinality(wethUsdgPool, 600);
            reader.setWethUsdgPool(wethUsdgPool);
        }
        // Allowlist NVDA with its direct USDG reference pool.
        factory.setStock(nvda, true, nvdaPool, ICOURPriceReader.RefKind.USDG);

        vm.stopBroadcast();
        console2.log("Configured NVDA stock + cardinality bump");
    }
}
