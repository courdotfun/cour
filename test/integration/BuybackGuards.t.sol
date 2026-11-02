// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { ICOURCurve } from "../../src/interfaces/ICOURCurve.sol";
import { Constants } from "../../src/libraries/Constants.sol";
import { Errors } from "../../src/libraries/Errors.sol";
import { CreatorMode } from "../../src/types/CreatorMode.sol";
import { TokenConfig } from "../../src/types/TokenConfig.sol";
import { MockERC20 } from "../mocks/MockERC20.sol";
import { MockStock } from "../mocks/MockStock.sol";
import { BaseTest } from "../utils/BaseTest.sol";

/// @notice Proves the buyback guards (docs §2.2a) actually fire, PRE- and POST-graduation:
///         BuybackTooSmall (min-USD), BuybackTooLarge (2%-of-reserve), PriceDeviation (>3% vs TWAP),
///         plus WrongMode / OnlyCreator. This confirms executeBuyback really reaches _checkDeviation
///         and _poolStockReserve (slither flagged them as "dead code" -> false positive).
contract BuybackGuardsTest is BaseTest {
    MockStock internal stock;

    function setUp() public {
        _deploySystem();
        stock = _newStock(18, 100e18); // $100
    }

    function _launchBB(uint16 fee) internal returns (address token, address curve) {
        (token, curve) = _launch(stock, fee, CreatorMode.BUYBACK_BURN, 0); // _launch warps +6s past window
    }

    function _buy(address curve, address who, uint256 amt) internal {
        stock.mint(who, amt);
        vm.startPrank(who);
        stock.approve(curve, amt);
        ICOURCurve(curve).buy(amt, 0, who, block.timestamp);
        vm.stopPrank();
    }

    function _graduate(address curve) internal {
        TokenConfig memory cfg = ICOURCurve(curve).config();
        uint256 big = (cfg.k / cfg.vTStop - cfg.vS0) * 2;
        _buy(curve, alice, big);
        require(ICOURCurve(curve).graduated(), "did not graduate");
        // L-2: a post-graduation buyback requires a FULL TWAP window. Let it elapse so these guard tests
        // exercise the deviation/reserve/success paths (not the new TwapWindowNotReady gate).
        vm.warp(block.timestamp + Constants.HOOK_TWAP_WINDOW + 1);
    }

    // --------------------------------------------------------------- access / mode

    function test_buyback_wrong_mode() public {
        (address token,) = _launch(stock, 500, CreatorMode.CREATOR, 0);
        vm.prank(creator);
        vm.expectRevert(Errors.WrongMode.selector);
        vault.executeBuyback(token, 1e18, 0);
    }

    function test_buyback_only_creator() public {
        (address token,) = _launchBB(500);
        vm.prank(bob);
        vm.expectRevert(Errors.OnlyCreator.selector);
        vault.executeBuyback(token, 1e18, 0);
    }

    // --------------------------------------------------------------- BuybackTooSmall

    function test_buyback_too_small_when_nothing_owed() public {
        (address token,) = _launchBB(500);
        vm.prank(creator);
        vm.expectRevert(Errors.BuybackTooSmall.selector); // owed == 0 -> stockIn == 0
        vault.executeBuyback(token, 1e18, 0);
    }

    function test_buyback_too_small_below_min_usd() public {
        (address token, address curve) = _launchBB(1000);
        _buy(curve, bob, 100e18); // accrue buyback owed
        assertGt(vault.buybackOwed(token), 0);
        vm.prank(admin);
        vault.setMinBuybackUsd(1_000_000); // $1M floor
        vm.prank(creator);
        vm.expectRevert(Errors.BuybackTooSmall.selector);
        vault.executeBuyback(token, 1e15, 0); // tiny notional < $1M
    }

    // --------------------------------------------------------------- BuybackTooLarge (pre-grad)

    function test_buyback_too_large_pregrad() public {
        (address token, address curve) = _launchBB(1000); // 10% fee
        // A moderate buy (well below the ~123-NVDA graduation raise): owed ~= 0.8*0.1*G while curve
        // stock balance ~= 0.9*G -> owed > 2% of balance.
        _buy(curve, bob, 30e18);
        assertFalse(ICOURCurve(curve).graduated(), "still on curve");
        uint256 owed = vault.buybackOwed(token);
        uint256 curveStock = MockERC20(address(stock)).balanceOf(curve);
        assertGt(owed, (curveStock * Constants.BUYBACK_MAX_POOL_BPS) / Constants.BPS, "owed exceeds 2% cap");
        vm.prank(creator);
        vm.expectRevert(Errors.BuybackTooLarge.selector);
        vault.executeBuyback(token, type(uint256).max, 0);
    }

    // --------------------------------------------------------------- BuybackTooLarge (post-grad)

    function test_buyback_too_large_postgrad() public {
        (address token, address curve) = _launchBB(1000); // 10% fee: the graduating buy accrues owed > 2% reserve
        _graduate(curve);
        uint256 owed = vault.buybackOwed(token);
        uint256 reserve = hook.poolStockReserve(token, address(stock));
        assertGt(owed, (reserve * Constants.BUYBACK_MAX_POOL_BPS) / Constants.BPS, "owed exceeds 2% reserve");
        vm.prank(creator);
        vm.expectRevert(Errors.BuybackTooLarge.selector);
        vault.executeBuyback(token, type(uint256).max, 0);
    }

    // --------------------------------------------------------------- TwapWindowNotReady (L-2)

    /// POST-graduation: a buyback reverts until the hook TWAP window (HOOK_TWAP_WINDOW) is fully elapsed,
    /// then succeeds once the window is full.
    function test_buyback_reverts_until_twap_window_full_postgrad() public {
        (address token, address curve) = _launchBB(500);
        // Graduate WITHOUT the window-elapsing warp (_graduate warps; inline here to control timing).
        TokenConfig memory cfg = ICOURCurve(curve).config();
        _buy(curve, alice, (cfg.k / cfg.vTStop - cfg.vS0) * 2);
        require(ICOURCurve(curve).graduated(), "did not graduate");

        assertFalse(hook.twapWindowFull(token), "window not full right after graduation");
        uint256 reserve = hook.poolStockReserve(token, address(stock));
        uint256 amt = (reserve * 100) / Constants.BPS; // 1% reserve, under cap
        if (amt > vault.buybackOwed(token)) amt = vault.buybackOwed(token);

        // Window not full yet -> revert TwapWindowNotReady (before deviation/reserve checks).
        vm.prank(creator);
        vm.expectRevert(Errors.TwapWindowNotReady.selector);
        vault.executeBuyback(token, amt, 0);

        // Just under the window: still not ready.
        vm.warp(block.timestamp + Constants.HOOK_TWAP_WINDOW - 1);
        assertFalse(hook.twapWindowFull(token), "still not full 1s before window");
        vm.prank(creator);
        vm.expectRevert(Errors.TwapWindowNotReady.selector);
        vault.executeBuyback(token, amt, 0);

        // Cross the window boundary -> ready, buyback succeeds (no price move -> deviation passes).
        vm.warp(block.timestamp + 2);
        assertTrue(hook.twapWindowFull(token), "window full after HOOK_TWAP_WINDOW");
        vm.prank(creator);
        (uint256 stockIn, uint256 tokensOut) = vault.executeBuyback(token, amt, 0);
        assertGt(stockIn, 0);
        assertGt(tokensOut, 0);
    }

    /// PRE-graduation: the TWAP-window gate does NOT apply (the curve buy is deterministic, no pool/TWAP);
    /// a correctly-sized pre-grad buyback succeeds immediately with no window wait.
    function test_buyback_pregrad_ignores_twap_window() public {
        // 1% fee keeps the accrued owed (80% of fee) under the 2%-of-curve-stock cap; $100 buy clears the
        // $50 min-USD floor without reaching the ~123-NVDA graduation raise.
        (address token, address curve) = _launchBB(100);
        _buy(curve, bob, 100e18);
        assertFalse(ICOURCurve(curve).graduated(), "still on curve");
        assertFalse(hook.twapWindowFull(token), "no pool yet -> window not full");

        uint256 owed = vault.buybackOwed(token);
        assertGt(owed, 0);
        vm.prank(creator);
        // No TwapWindowNotReady despite the window being 'not full' — pre-grad path skips the gate.
        (uint256 stockIn, uint256 tokensOut) = vault.executeBuyback(token, owed, 0);
        assertGt(stockIn, 0);
        assertGt(tokensOut, 0);
    }

    // --------------------------------------------------------------- PriceDeviation (post-grad)

    function test_buyback_price_deviation_postgrad() public {
        (address token, address curve) = _launchBB(500);
        _graduate(curve);

        // Move the pool spot far from the lagging TWAP with a large pool buy.
        vm.warp(block.timestamp + 5);
        uint256 shove = 2_000e18;
        stock.mint(bob, shove);
        vm.startPrank(bob);
        stock.approve(address(router), shove);
        router.buy(token, shove, 0, block.timestamp);
        vm.stopPrank();

        // A small in-guard buyback now trips the >3% deviation guard (checked before the reserve cap).
        vm.prank(creator);
        vm.expectRevert(Errors.PriceDeviation.selector);
        vault.executeBuyback(token, 1e18, 0);
    }

    // --------------------------------------------------------------- happy path (post-grad)

    function test_buyback_success_postgrad_burns_to_dead() public {
        (address token, address curve) = _launchBB(500);
        _graduate(curve);
        uint256 deadBefore = MockERC20(token).balanceOf(Constants.DEAD);
        uint256 owed = vault.buybackOwed(token);
        // Stay under the 2% reserve cap and at/above the $50 min; no price move -> deviation passes.
        uint256 reserve = hook.poolStockReserve(token, address(stock));
        uint256 amt = (reserve * 100) / Constants.BPS; // 1% of reserve
        if (amt > owed) amt = owed;
        vm.prank(creator);
        (uint256 stockIn, uint256 tokensOut) = vault.executeBuyback(token, amt, 0);
        assertGt(stockIn, 0);
        assertGt(tokensOut, 0);
        assertEq(MockERC20(token).balanceOf(Constants.DEAD) - deadBefore, tokensOut, "burned to DEAD");
    }
}
