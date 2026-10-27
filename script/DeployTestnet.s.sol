// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { ICOURPriceReader } from "../src/interfaces/ICOURPriceReader.sol";
import { MockERC20 } from "../test/mocks/MockERC20.sol";
import { MockStock } from "../test/mocks/MockStock.sol";
import { MockV3Pool } from "../test/mocks/MockV3Pool.sol";
import { CourDeployer } from "./DeployCore.s.sol";
import { console2 } from "forge-std/Script.sol";
import { PoolManager } from "v4-core/PoolManager.sol";

/// @notice Testnet (chainId 46630) / local deploy using a FRESH v4 PoolManager, a mock stock token, and a
///         mock v3 reference pool, since the testnet is expected to lack real stock tokens/liquidity.
///         Dry-run: `forge script script/DeployTestnet.s.sol`. No keys are broadcast.
contract DeployTestnet is CourDeployer {
    function run() external {
        address deployer = address(this);

        PoolManager pm = new PoolManager(deployer);
        MockERC20 weth = new MockERC20("WETH", "WETH", 18);
        MockERC20 usdg = new MockERC20("USDG", "USDG", 18);

        Deployed memory d =
            _deployCore(deployer, address(pm), address(0), address(0), address(weth), address(usdg), deployer);

        // Mock stock + mock reference pool (tick 0 => ~$1).
        MockStock stock = new MockStock("Mock NVDA", "mNVDA", 18);
        MockV3Pool pool = new MockV3Pool(address(stock), address(usdg), 0);
        usdg.mint(address(pool), 1_000_000e18); // ref liquidity above the floor
        vm.warp(block.timestamp + 2_000); // ensure the mock TWAP window is satisfied

        d.factory.setStock(address(stock), true, address(pool), ICOURPriceReader.RefKind.USDG);

        console2.log("testnet poolManager", address(pm));
        console2.log("mock stock", address(stock));
        console2.log("factory", address(d.factory));
        console2.log("Ready: call factory.createToken(...) to launch a mock-paired token.");
    }
}
