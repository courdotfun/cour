// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {BaseTest} from "../utils/BaseTest.sol";
import {MockStock} from "../mocks/MockStock.sol";
import {MockERC20} from "../mocks/MockERC20.sol";
import {CreatorMode} from "../../src/types/CreatorMode.sol";
import {ICOURCurve} from "../../src/interfaces/ICOURCurve.sol";
import {Constants} from "../../src/libraries/Constants.sol";

/// @notice End-to-end proof WITHOUT a fork: launch -> buy to graduation (refund) -> v4 pool swaps
///         (hook fees) -> claims. Exercises the riskiest paths (pool init, full-range LP, hook deltas).
contract LaunchToGraduationTest is BaseTest {
    MockStock internal stock;
    address internal token;
    address internal curve;

    function setUp() public {
        _deploySystem();
        stock = _newStock(18, 100e18); // $100
        (token, curve) = _launch(stock, 500, CreatorMode.CREATOR, 0);
    }

    function test_graduates_with_refund_and_opens_pool() public {
        // Buy way more than needed to cross the stop point; expect a refund and graduation in one tx.
        uint256 bigIn = 1_000e18; // ~$100k gross, stop needs ~$13k
        stock.mint(alice, bigIn);
        vm.startPrank(alice);
        stock.approve(curve, bigIn);
        uint256 balBefore = stock.balanceOf(alice);
        (uint256 tokensOut, uint256 used) = ICOURCurve(curve).buy(bigIn, 0, alice, block.timestamp);
        vm.stopPrank();

        assertTrue(ICOURCurve(curve).graduated(), "graduated");
        assertLt(used, bigIn, "some stock refunded");
        assertEq(stock.balanceOf(alice), balBefore - used, "refund correct");
        assertGt(tokensOut, 0);

        // Curve trading is closed post-graduation.
        stock.mint(alice, 1e18);
        vm.startPrank(alice);
        stock.approve(curve, 1e18);
        vm.expectRevert();
        ICOURCurve(curve).buy(1e18, 0, alice, block.timestamp);
        vm.stopPrank();

        // The pool now holds liquidity: a pool buy via the router delivers tokens and charges a stock fee.
        uint256 feeBefore = vault.creatorOwed(token);
        uint256 poolIn = 50e18;
        stock.mint(bob, poolIn);
        vm.startPrank(bob);
        stock.approve(address(router), poolIn);
        uint256 got = router.buy(token, poolIn, 0, block.timestamp);
        vm.stopPrank();
        assertGt(got, 0, "pool buy delivered tokens");
        assertGt(vault.creatorOwed(token), feeBefore, "hook charged a stock fee on pool buy");
        assertEq(MockERC20(token).balanceOf(address(router)), 0, "router holds no token");
        assertEq(stock.balanceOf(address(router)), 0, "router holds no stock");

        // Pool sell via the router returns stock and charges a fee.
        uint256 feeBefore2 = vault.creatorOwed(token);
        vm.startPrank(bob);
        MockERC20(token).approve(address(router), got);
        uint256 stockBack = router.sell(token, got, 0, block.timestamp);
        vm.stopPrank();
        assertGt(stockBack, 0, "pool sell returned stock");
        assertGt(vault.creatorOwed(token), feeBefore2, "hook charged a fee on pool sell");

        // Creator can claim the accrued stock fees; platform bucket is non-empty.
        uint256 owed = vault.creatorOwed(token);
        vm.prank(creator);
        uint256 claimed = vault.claim(token);
        assertEq(claimed, owed);
        assertEq(stock.balanceOf(creator), claimed);
        assertGt(vault.platformOwed(address(stock)), 0, "platform accrued 20%");
    }

    function test_graduation_conserves_supply() public {
        uint256 bigIn = 1_000e18;
        stock.mint(alice, bigIn);
        vm.startPrank(alice);
        stock.approve(curve, bigIn);
        ICOURCurve(curve).buy(bigIn, 0, alice, block.timestamp);
        vm.stopPrank();
        assertEq(MockERC20(token).totalSupply(), Constants.TOTAL_SUPPLY, "supply constant");
        // No tokens stranded on the curve after graduation (swept to pool/DEAD).
        assertEq(MockERC20(token).balanceOf(curve), 0, "curve emptied of tokens");
    }
}
