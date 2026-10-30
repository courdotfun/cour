// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { GraduationImpl } from "../../src/GraduationImpl.sol";
import { ICOURCurve } from "../../src/interfaces/ICOURCurve.sol";
import { Constants } from "../../src/libraries/Constants.sol";
import { Errors } from "../../src/libraries/Errors.sol";
import { CreatorMode } from "../../src/types/CreatorMode.sol";
import { MockERC20 } from "../mocks/MockERC20.sol";
import { MockStock } from "../mocks/MockStock.sol";
import { BaseTest } from "../utils/BaseTest.sol";

/// @notice Extra branch coverage for the audit-hardened paths and a few reachable guard branches.
contract BranchCoverage2Test is BaseTest {
    MockStock internal stock;

    function setUp() public {
        _deploySystem();
        stock = _newStock(18, 100e18);
    }

    /// I-1: a DIRECT (non-delegatecall) call to GraduationImpl.graduate reverts OnlyDelegatecall.
    function test_graduation_impl_direct_call_reverts() public {
        GraduationImpl gi = new GraduationImpl();
        GraduationImpl.Params memory p = GraduationImpl.Params({
            token: address(stock),
            stock: address(stock),
            hook: address(hook),
            poolManager: address(pm),
            positionManager: address(posm),
            feeVault: address(vault),
            stockRaised: 1,
            tokenLeftover: 1
        });
        vm.expectRevert(Errors.OnlyDelegatecall.selector);
        gi.graduate(p);
    }

    /// HOLDERS: a transfer from an eligible holder to an EXCLUDED address (DEAD) hits the fe && !te branch
    /// in beforeBalanceChange (eligibleSupply decreases).
    function test_holders_transfer_to_excluded_decreases_eligible_supply() public {
        (address token, address curve) = _launch(stock, 500, CreatorMode.HOLDERS, 0);
        uint256 got = _buyCurve(curve, stock, alice, 10e18);
        uint256 supplyBefore = vault.eligibleSupply(token);
        assertGt(supplyBefore, 0);

        vm.prank(alice);
        MockERC20(token).transfer(Constants.DEAD, got / 2); // to an excluded address
        assertEq(vault.eligibleSupply(token), supplyBefore - got / 2, "eligibleSupply drops by transfer to excluded");
    }

    /// Router post-graduation slippage reverts on both buy and sell.
    function test_router_postgrad_slippage() public {
        (address token, address curve) = _launch(stock, 500, CreatorMode.CREATOR, 0);
        uint256 big = 2_000e18;
        stock.mint(alice, big);
        vm.startPrank(alice);
        stock.approve(curve, big);
        ICOURCurve(curve).buy(big, 0, alice, block.timestamp); // graduate
        vm.stopPrank();

        stock.mint(bob, 10e18);
        vm.startPrank(bob);
        stock.approve(address(router), 10e18);
        vm.expectRevert(Errors.Slippage.selector);
        router.buy(token, 10e18, type(uint256).max, block.timestamp);
        vm.stopPrank();
    }
}
