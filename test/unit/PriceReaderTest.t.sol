// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { COURPriceReader } from "../../src/COURPriceReader.sol";
import { ICOURPriceReader } from "../../src/interfaces/ICOURPriceReader.sol";
import { Errors } from "../../src/libraries/Errors.sol";
import { MockERC20 } from "../mocks/MockERC20.sol";
import { MockStock } from "../mocks/MockStock.sol";
import { MockV3Pool } from "../mocks/MockV3Pool.sol";
import { Test } from "forge-std/Test.sol";

contract PriceReaderTest is Test {
    COURPriceReader internal reader;
    MockERC20 internal usdg;
    MockERC20 internal weth;

    function setUp() public {
        usdg = new MockERC20("USDG", "USDG", 18);
        weth = new MockERC20("WETH", "WETH", 18);
        reader = new COURPriceReader(address(this), address(usdg), address(weth));
        vm.warp(1_000_000); // past the 1800s TWAP window so observe() does not underflow
    }

    function test_usdg_route_tick0_is_one_dollar() public {
        MockStock stock = new MockStock("NV", "NV", 18);
        MockV3Pool pool = new MockV3Pool(address(stock), address(usdg), 0);
        reader.setRefPool(address(stock), address(pool), ICOURPriceReader.RefKind.USDG);
        (uint256 price, uint8 src) = reader.stockUsd(address(stock));
        assertEq(src, 1);
        assertApproxEqRel(price, 1e18, 1e12); // ~$1
    }

    function test_usdg_route_decimals_6_and_8_paths() public {
        for (uint8 d = 6; d <= 8; d += 2) {
            MockStock stock = new MockStock("NV", "NV", d);
            // tick so 1 whole stock ~ 1 whole USDG despite decimal gap: 1.0001^tick = 10^(18-d).
            // tick = (18-d) * ln(10)/ln(1.0001) ~= (18-d) * 23027. Sign flips with token ordering.
            int24 tick = int24(int256((uint256(18) - d) * 23027));
            MockV3Pool pool =
                new MockV3Pool(address(stock), address(usdg), address(stock) < address(usdg) ? tick : -tick);
            reader.setRefPool(address(stock), address(pool), ICOURPriceReader.RefKind.USDG);
            (uint256 price, uint8 src) = reader.stockUsd(address(stock));
            assertEq(src, 1);
            assertApproxEqRel(price, 1e18, 1e16); // ~$1 within 1%
        }
    }

    function test_weth_route() public {
        MockStock stock = new MockStock("NV", "NV", 18);
        MockV3Pool wethUsdg = new MockV3Pool(address(weth), address(usdg), 0); // 1 WETH = $1
        MockV3Pool stockWeth = new MockV3Pool(address(stock), address(weth), 0); // 1 stock = 1 WETH
        reader.setWethUsdgPool(address(wethUsdg));
        reader.setRefPool(address(stock), address(stockWeth), ICOURPriceReader.RefKind.WETH);
        (uint256 price, uint8 src) = reader.stockUsd(address(stock));
        assertEq(src, 2);
        assertApproxEqRel(price, 1e18, 1e12);
    }

    function test_twap_not_ready() public {
        MockStock stock = new MockStock("NV", "NV", 18);
        MockV3Pool pool = new MockV3Pool(address(stock), address(usdg), 0);
        pool.setRevertObserve(true);
        reader.setRefPool(address(stock), address(pool), ICOURPriceReader.RefKind.USDG);
        vm.expectRevert(Errors.TwapNotReady.selector);
        reader.stockUsd(address(stock));
    }

    function test_unconfigured_reverts() public {
        vm.expectRevert(Errors.StockNotAllowed.selector);
        reader.stockUsd(address(0xdead));
    }

    function test_refLiquidityUsd_usdg() public {
        MockStock stock = new MockStock("NV", "NV", 18);
        MockV3Pool pool = new MockV3Pool(address(stock), address(usdg), 0);
        reader.setRefPool(address(stock), address(pool), ICOURPriceReader.RefKind.USDG);
        // At tick 0 (price 1) the in-range reserve equals the active liquidity L on each side.
        pool.setLiquidity(500_000e18);
        assertEq(reader.refLiquidityUsd(address(stock)), 1_000_000); // 2x reserve
    }

    /// L-3 regression: a donation (raw balanceOf transfer) must NOT inflate the reference-liquidity floor.
    function test_refLiquidityUsd_ignores_donations() public {
        MockStock stock = new MockStock("NV", "NV", 18);
        MockV3Pool pool = new MockV3Pool(address(stock), address(usdg), 0);
        reader.setRefPool(address(stock), address(pool), ICOURPriceReader.RefKind.USDG);
        pool.setLiquidity(500_000e18);
        uint256 before = reader.refLiquidityUsd(address(stock));
        // Donate 10M USDG straight into the pool: old balanceOf logic would have reported ~20M.
        usdg.mint(address(pool), 10_000_000e18);
        assertEq(reader.refLiquidityUsd(address(stock)), before); // unchanged — floor is donation-proof
    }

    /// A pool with no active in-range liquidity reports a zero floor (fails ThinReferencePool at launch).
    function test_refLiquidityUsd_zero_when_no_liquidity() public {
        MockStock stock = new MockStock("NV", "NV", 18);
        MockV3Pool pool = new MockV3Pool(address(stock), address(usdg), 0);
        reader.setRefPool(address(stock), address(pool), ICOURPriceReader.RefKind.USDG);
        pool.setLiquidity(0);
        usdg.mint(address(pool), 10_000_000e18); // donation cannot rescue an empty pool
        assertEq(reader.refLiquidityUsd(address(stock)), 0);
    }

    function test_setRefPool_only_owner_or_setter() public {
        MockStock stock = new MockStock("NV", "NV", 18);
        vm.prank(address(0xBEEF));
        vm.expectRevert(Errors.OnlyFactory.selector);
        reader.setRefPool(address(stock), address(0x1), ICOURPriceReader.RefKind.USDG);
    }

    function test_admin_paths() public {
        reader.setTwapWindow(600);
        assertEq(reader.twapWindow(), 600);
        reader.setAuthorizedSetter(address(0xF00));
        assertEq(reader.authorizedSetter(), address(0xF00));
        MockV3Pool pool = new MockV3Pool(address(1), address(2), 0);
        reader.bumpCardinality(address(pool), 500);
        assertEq(pool.cardinalityNext(), 500);
        vm.expectRevert();
        reader.setTwapWindow(10); // < 60
    }

    function test_weth_route_without_pool_reverts() public {
        MockStock s = new MockStock("NV", "NV", 18);
        MockV3Pool stockWeth = new MockV3Pool(address(s), address(weth), 0);
        reader.setRefPool(address(s), address(stockWeth), ICOURPriceReader.RefKind.WETH);
        // wethUsdgPool not set -> TwapNotReady
        vm.expectRevert(Errors.TwapNotReady.selector);
        reader.stockUsd(address(s));
    }

    function test_refLiquidityUsd_weth_and_zero() public {
        MockStock s = new MockStock("NV", "NV", 18);
        assertEq(reader.refLiquidityUsd(address(s)), 0); // unconfigured
        MockV3Pool wethUsdg = new MockV3Pool(address(weth), address(usdg), 0);
        MockV3Pool stockWeth = new MockV3Pool(address(s), address(weth), 0);
        reader.setWethUsdgPool(address(wethUsdg));
        reader.setRefPool(address(s), address(stockWeth), ICOURPriceReader.RefKind.WETH);
        // In-range reserve comes from active liquidity, not a donated balance.
        stockWeth.setLiquidity(100e18);
        uint256 withLiq = reader.refLiquidityUsd(address(s));
        assertGt(withLiq, 0);
        weth.mint(address(stockWeth), 1_000e18); // donation ignored
        assertEq(reader.refLiquidityUsd(address(s)), withLiq);
    }

    function test_uiMultiplier_passthrough_and_default() public {
        MockStock stock = new MockStock("NV", "NV", 18);
        stock.setUiMultiplier(2e18);
        assertEq(reader.uiMultiplier(address(stock)), 2e18);
        assertEq(reader.uiMultiplier(address(usdg)), 1e18); // non-8056 -> default
    }
}
