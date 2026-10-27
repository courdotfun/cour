// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { ICOURCurve } from "../../src/interfaces/ICOURCurve.sol";
import { Constants } from "../../src/libraries/Constants.sol";
import { Errors } from "../../src/libraries/Errors.sol";
import { CreatorMode } from "../../src/types/CreatorMode.sol";
import { MockERC20 } from "../mocks/MockERC20.sol";
import { MockStock } from "../mocks/MockStock.sol";
import { BaseTest } from "../utils/BaseTest.sol";

contract FeeModesTest is BaseTest {
    MockStock internal stock;

    function setUp() public {
        _deploySystem();
        stock = _newStock(18, 100e18);
    }

    // ----------------------------------------------------------------- CREATOR

    function test_creator_mode_split_80_20() public {
        (address token, address curve) = _launch(stock, 1000, CreatorMode.CREATOR, 0);
        _buyCurve(curve, stock, alice, 100e18); // 10% fee => 10 stock fee
        uint256 platform = vault.platformOwed(address(stock));
        uint256 creatorOwed = vault.creatorOwed(token);
        // platform == floor(20% of fee); creator == remainder; sum == total fee
        assertApproxEqAbs(creatorOwed, platform * 4, 2, "80/20");
    }

    // ----------------------------------------------------------------- HOLDERS

    function test_holders_mode_dividends() public {
        (address token, address curve) = _launch(stock, 500, CreatorMode.HOLDERS, 0);
        // Small buys so the curve does not graduate (~$12.3k to graduate at $100).
        uint256 aliceTokens = _buyCurve(curve, stock, alice, 10e18);
        uint256 bobTokens = _buyCurve(curve, stock, bob, 10e18);

        // A further buy by carol generates fees distributed to alice & bob pro-rata.
        _buyCurve(curve, stock, carol, 10e18);

        uint256 pa = vault.pendingHolder(token, alice);
        uint256 pb = vault.pendingHolder(token, bob);
        assertGt(pa, 0, "alice dividend");
        assertGt(pb, 0, "bob dividend");

        vm.prank(alice);
        uint256 ca = vault.claimHolder(token);
        assertEq(ca, pa);
        assertEq(stock.balanceOf(alice), ca);

        // carol also holds and can claim from later fees (none yet beyond her own buy effect)
        assertGt(aliceTokens, 0);
        assertGt(bobTokens, 0);
    }

    function test_holders_claim_wrong_mode_reverts() public {
        (address token,) = _launch(stock, 500, CreatorMode.CREATOR, 0);
        vm.expectRevert(Errors.WrongMode.selector);
        vault.claimHolder(token);
    }

    // ----------------------------------------------------------------- BUYBACK

    function test_buyback_mode_buys_to_creator() public {
        (address token, address curve) = _launch(stock, 500, CreatorMode.BUYBACK, 0);
        _buyCurve(curve, stock, alice, 100e18);
        uint256 owed = vault.buybackOwed(token);
        assertGt(owed, 0);

        uint256 creatorTokBefore = MockERC20(token).balanceOf(creator);
        vm.prank(creator);
        (uint256 stockIn, uint256 tokensOut) = vault.executeBuyback(token, 1e18, 0);
        assertGt(tokensOut, 0);
        assertEq(vault.buybackOwed(token), owed - stockIn);
        assertEq(MockERC20(token).balanceOf(creator) - creatorTokBefore, tokensOut, "tokens to creator");
    }

    function test_buyback_burn_mode_sends_to_dead() public {
        (address token, address curve) = _launch(stock, 500, CreatorMode.BUYBACK_BURN, 0);
        _buyCurve(curve, stock, alice, 100e18);
        uint256 deadBefore = MockERC20(token).balanceOf(Constants.DEAD);
        vm.prank(creator);
        (, uint256 tokensOut) = vault.executeBuyback(token, 1e18, 0);
        assertEq(MockERC20(token).balanceOf(Constants.DEAD) - deadBefore, tokensOut, "burned to DEAD");
    }

    function test_buyback_only_creator() public {
        (address token, address curve) = _launch(stock, 500, CreatorMode.BUYBACK, 0);
        _buyCurve(curve, stock, alice, 100e18);
        vm.prank(alice);
        vm.expectRevert(Errors.OnlyCreator.selector);
        vault.executeBuyback(token, 1e18, 0);
    }

    function test_buyback_wrong_mode_reverts() public {
        (address token, address curve) = _launch(stock, 500, CreatorMode.CREATOR, 0);
        _buyCurve(curve, stock, alice, 100e18);
        vm.prank(creator);
        vm.expectRevert(Errors.WrongMode.selector);
        vault.executeBuyback(token, 1e18, 0);
    }

    function test_buyback_cap_2pct() public {
        (address token, address curve) = _launch(stock, 500, CreatorMode.BUYBACK, 0);
        _buyCurve(curve, stock, alice, 100e18);
        // curve stock ~95e18; 2% ~1.9e18; request far above -> BuybackTooLarge
        vm.prank(creator);
        vm.expectRevert(Errors.BuybackTooLarge.selector);
        vault.executeBuyback(token, 50e18, 0);
    }

    // ----------------------------------------------------------------- platform + recipient

    function test_platform_claim_to_treasury() public {
        (, address curve) = _launch(stock, 500, CreatorMode.CREATOR, 0);
        _buyCurve(curve, stock, alice, 100e18);
        uint256 owed = vault.platformOwed(address(stock));
        assertGt(owed, 0);
        vault.claimPlatform(address(stock));
        assertEq(stock.balanceOf(treasury), owed);
        assertEq(vault.platformOwed(address(stock)), 0);
    }

    function test_two_step_recipient() public {
        (address token, address curve) = _launch(stock, 500, CreatorMode.CREATOR, 0);
        _buyCurve(curve, stock, alice, 100e18);

        vm.prank(creator);
        vault.setFeeRecipient(token, bob);
        // bob not yet recipient
        vm.prank(bob);
        vault.acceptFeeRecipient(token);
        assertEq(vault.feeRecipient(token), bob);

        uint256 owed = vault.creatorOwed(token);
        vm.prank(bob);
        uint256 c = vault.claim(token);
        assertEq(c, owed);
        assertEq(stock.balanceOf(bob), c);
    }
}
