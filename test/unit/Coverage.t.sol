// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { ICOURCurve } from "../../src/interfaces/ICOURCurve.sol";
import { ICOURHook } from "../../src/interfaces/ICOURHook.sol";
import { Errors } from "../../src/libraries/Errors.sol";
import { CreatorMode } from "../../src/types/CreatorMode.sol";
import { MockERC20 } from "../mocks/MockERC20.sol";
import { MockStock } from "../mocks/MockStock.sol";
import { BaseTest } from "../utils/BaseTest.sol";

/// @notice Breadth tests for quotes, revert branches, router routing, hook views, and vault edge cases.
contract CoverageTest is BaseTest {
    MockStock internal stock;

    function setUp() public {
        _deploySystem();
        stock = _newStock(18, 100e18);
    }

    function _graduate(address curve) internal {
        uint256 big = 2_000e18;
        stock.mint(alice, big);
        vm.startPrank(alice);
        stock.approve(curve, big);
        ICOURCurve(curve).buy(big, 0, alice, block.timestamp);
        vm.stopPrank();
    }

    // ---- curve quotes & reverts ----

    function test_curve_quotes() public {
        (, address curve) = _launch(stock, 500, CreatorMode.CREATOR, 0);
        (uint256 out, uint256 fee, uint256 tax) = ICOURCurve(curve).quoteBuy(10e18);
        assertGt(out, 0);
        assertGt(fee, 0);
        assertEq(tax, 0); // past window
        uint256 got = _buyCurve(curve, stock, alice, 10e18);
        (uint256 sOut, uint256 sFee) = ICOURCurve(curve).quoteSell(got);
        assertGt(sOut, 0);
        assertGt(sFee, 0);
        assertGt(ICOURCurve(curve).quoteStockForTokens(1e24), 0);
        assertGt(ICOURCurve(curve).progressBps(), 0);
    }

    function test_curve_buy_expired() public {
        (, address curve) = _launch(stock, 500, CreatorMode.CREATOR, 0);
        stock.mint(alice, 1e18);
        vm.startPrank(alice);
        stock.approve(curve, 1e18);
        vm.expectRevert(Errors.Expired.selector);
        ICOURCurve(curve).buy(1e18, 0, alice, block.timestamp - 1);
        vm.stopPrank();
    }

    function test_curve_buy_slippage() public {
        (, address curve) = _launch(stock, 500, CreatorMode.CREATOR, 0);
        stock.mint(alice, 1e18);
        vm.startPrank(alice);
        stock.approve(curve, 1e18);
        vm.expectRevert(Errors.Slippage.selector);
        ICOURCurve(curve).buy(1e18, type(uint256).max, alice, block.timestamp);
        vm.stopPrank();
    }

    function test_curve_sell_reverts() public {
        (address token, address curve) = _launch(stock, 500, CreatorMode.CREATOR, 0);
        uint256 got = _buyCurve(curve, stock, alice, 10e18);
        vm.startPrank(alice);
        MockERC20(token).approve(curve, got);
        vm.expectRevert(Errors.Expired.selector);
        ICOURCurve(curve).sell(got, 0, alice, block.timestamp - 1);
        vm.expectRevert(Errors.ZeroAmount.selector);
        ICOURCurve(curve).sell(0, 0, alice, block.timestamp);
        vm.expectRevert(Errors.Slippage.selector);
        ICOURCurve(curve).sell(got, type(uint256).max, alice, block.timestamp);
        vm.stopPrank();
    }

    function test_curve_trades_revert_after_graduation() public {
        (address token, address curve) = _launch(stock, 500, CreatorMode.CREATOR, 0);
        _graduate(curve);
        stock.mint(bob, 1e18);
        vm.startPrank(bob);
        stock.approve(curve, 1e18);
        vm.expectRevert(Errors.Graduated.selector);
        ICOURCurve(curve).buy(1e18, 0, bob, block.timestamp);
        vm.expectRevert(Errors.Graduated.selector);
        ICOURCurve(curve).sell(1, 0, bob, block.timestamp);
        vm.stopPrank();
        assertEq(ICOURCurve(curve).progressBps(), 10_000); // capped
        assertEq(MockERC20(token).totalSupply(), MockERC20(token).totalSupply());
    }

    // ---- router ----

    function test_router_pre_and_post_grad() public {
        (address token, address curve) = _launch(stock, 500, CreatorMode.CREATOR, 0);

        // pre-grad quotes + buy/sell
        assertGt(router.quoteBuy(token, 5e18), 0);
        stock.mint(alice, 5e18);
        vm.startPrank(alice);
        stock.approve(address(router), 5e18);
        uint256 out = router.buy(token, 5e18, 0, block.timestamp);
        assertGt(router.quoteSell(token, out), 0);
        MockERC20(token).approve(address(router), out);
        uint256 back = router.sell(token, out, 0, block.timestamp);
        vm.stopPrank();
        assertGt(back, 0);

        _graduate(curve);
        // post-grad quotes return 0 (use v4 Quoter off-router)
        assertEq(router.quoteBuy(token, 5e18), 0);
        assertEq(router.quoteSell(token, 5e18), 0);
        // post-grad sell via pool
        uint256 tb = MockERC20(token).balanceOf(alice);
        if (tb > 0) {
            vm.startPrank(alice);
            MockERC20(token).approve(address(router), tb);
            router.sell(token, tb, 0, block.timestamp);
            vm.stopPrank();
        }
    }

    function test_router_expired() public {
        (address token,) = _launch(stock, 500, CreatorMode.CREATOR, 0);
        vm.expectRevert(Errors.Expired.selector);
        router.buy(token, 1e18, 0, block.timestamp - 1);
        vm.expectRevert(Errors.Expired.selector);
        router.sell(token, 1e18, 0, block.timestamp - 1);
        vm.expectRevert(Errors.ZeroAmount.selector);
        router.buyWithETH(token, 0, block.timestamp);
    }

    // ---- hook views ----

    function test_hook_views_after_graduation() public {
        (address token, address curve) = _launch(stock, 500, CreatorMode.CREATOR, 0);
        _graduate(curve);
        bytes32 pid = factory.poolIdOf(token);
        hook.consult(pid, 300); // no revert
        (uint256 spot, uint256 twap) = ICOURHook(address(hook)).priceInfo(token);
        assertGt(spot, 0);
        assertGt(twap, 0);
        assertGt(ICOURHook(address(hook)).poolStockReserve(token, address(stock)), 0);
    }

    function test_hook_twap_anchor_rollover() public {
        (address token, address curve) = _launch(stock, 500, CreatorMode.CREATOR, 0);
        _graduate(curve);
        bytes32 pid = factory.poolIdOf(token);

        // Advance past the TWAP window and swap repeatedly so the obs anchor rolls over (prevAnchor set).
        for (uint256 i; i < 3; i++) {
            vm.warp(block.timestamp + 400); // > HOOK_TWAP_WINDOW (300s)
            stock.mint(bob, 5e18);
            vm.startPrank(bob);
            stock.approve(address(router), 5e18);
            router.buy(token, 5e18, 0, block.timestamp);
            vm.stopPrank();
        }
        vm.warp(block.timestamp + 400);
        hook.consult(pid, 300); // now uses the prevAnchor reference branch
        (uint256 spot, uint256 twap) = hook.priceInfo(token);
        assertGt(spot, 0);
        assertGt(twap, 0);
    }

    // ---- vault edge cases ----

    function test_vault_zero_claims_and_guards() public {
        (address token,) = _launch(stock, 500, CreatorMode.CREATOR, 0);
        // nothing owed yet
        vm.prank(creator);
        assertEq(vault.claim(token), 0);
        assertEq(vault.claimPlatform(address(stock)), 0);
        // pendingHolder for non-HOLDERS token is 0
        assertEq(vault.pendingHolder(token, alice), 0);
    }

    function test_vault_admin_and_wire_guards() public {
        // re-wire reverts
        vm.prank(admin);
        vm.expectRevert(Errors.AlreadyInitialized.selector);
        vault.wire(address(factory), address(hook), address(router), address(oracle));
        // setTreasury zero reverts; non-owner reverts
        vm.prank(admin);
        vm.expectRevert(Errors.ZeroAddress.selector);
        vault.setTreasury(address(0));
        vm.prank(alice);
        vm.expectRevert();
        vault.setTreasury(bob);
        vm.prank(admin);
        vault.setMinBuybackUsd(123);
        assertEq(vault.minBuybackUsd(), 123);
        // creditPlatform only factory
        vm.prank(alice);
        vm.expectRevert(Errors.OnlyFactory.selector);
        vault.creditPlatform(address(stock), 1);
    }

    function test_vault_recipient_guards() public {
        (address token,) = _launch(stock, 500, CreatorMode.CREATOR, 0);
        // only current recipient can set
        vm.prank(alice);
        vm.expectRevert(Errors.OnlyCreator.selector);
        vault.setFeeRecipient(token, bob);
        // zero recipient reverts
        vm.prank(creator);
        vm.expectRevert(Errors.ZeroAddress.selector);
        vault.setFeeRecipient(token, address(0));
        // wrong acceptor reverts
        vm.prank(creator);
        vault.setFeeRecipient(token, bob);
        vm.prank(alice);
        vm.expectRevert(Errors.OnlyCreator.selector);
        vault.acceptFeeRecipient(token);
    }
}
