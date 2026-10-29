// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { COURFactory } from "../src/COURFactory.sol";
import { COURPriceReader } from "../src/COURPriceReader.sol";
import { COURRouter } from "../src/COURRouter.sol";
import { ICOURPriceReader } from "../src/interfaces/ICOURPriceReader.sol";
import { Script, console2 } from "forge-std/Script.sol";

/// @notice Configure the closed test phase: allowlist NVDA + its USDG reference pool, bump v3 observation
///         cardinality, set the ETH-in v3 path (WETH->USDG->NVDA), allowlist ONLY the deployer for
///         launches, and set CHEAP TEST launch params (start $40 / grad $600) so graduation is reachable
///         with little capital. Reads addresses from deployments/4663.json. Restore params to 4000/60000
///         after the smoke test (06_RestoreParams).
contract ConfigureStocks is Script {
    function run() external {
        string memory cfg = vm.readFile("script/config/rh-mainnet.json");
        address nvda = vm.parseJsonAddress(cfg, ".nvda");
        address usdg = vm.parseJsonAddress(cfg, ".usdg");
        address weth = vm.parseJsonAddress(cfg, ".weth");
        address nvdaPool = vm.parseJsonAddress(cfg, ".nvdaUsdgPool");
        address wethUsdgPool = vm.parseJsonAddress(cfg, ".wethUsdgPool");
        uint24 nvdaFee = uint24(vm.parseJsonUint(cfg, ".nvdaUsdgFee"));
        uint24 wethFee = uint24(vm.parseJsonUint(cfg, ".wethUsdgFee"));

        string memory dep = vm.readFile("deployments/4663.json");
        COURFactory factory = COURFactory(vm.parseJsonAddress(dep, ".factory"));
        COURPriceReader reader = COURPriceReader(vm.parseJsonAddress(dep, ".priceReader"));
        COURRouter router = COURRouter(payable(vm.parseJsonAddress(dep, ".router")));

        uint256 pk = vm.envUint("DEPLOYER_PK");
        address deployer = vm.addr(pk);

        vm.startBroadcast(pk);

        // Grow cardinality so the 1800s TWAP stays available (idempotent; the live pool is already mature).
        reader.bumpCardinality(nvdaPool, 600);
        if (wethUsdgPool != address(0)) {
            reader.bumpCardinality(wethUsdgPool, 600);
            reader.setWethUsdgPool(wethUsdgPool);
        }

        // Allowlist NVDA with its direct USDG reference pool.
        factory.setStock(nvda, true, nvdaPool, ICOURPriceReader.RefKind.USDG);

        // ETH-in route for NVDA: WETH -(wethFee)- USDG -(nvdaFee)- NVDA.
        bytes memory path = abi.encodePacked(weth, wethFee, usdg, nvdaFee, nvda);
        router.setEthInPath(nvda, path);

        // Closed test phase: allowlist ONLY the deployer; the allowlist ships enabled.
        factory.setLaunchAllowlist(deployer, true);

        // CHEAP TEST launch params (Q=15, same as prod) so graduation needs only ~$3 of NVDA — proven
        // safe for real NVDA decimals on a fork. Restore to 4000/60000 before opening to the public.
        factory.setLaunchParams(1, 15, 50_000, 0);

        vm.stopBroadcast();
        console2.log("Configured NVDA + test params (40/600) + allowlist(deployer) + ETH path");
    }
}
