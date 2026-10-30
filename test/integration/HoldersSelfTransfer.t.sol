// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { ICOURCurve } from "../../src/interfaces/ICOURCurve.sol";
import { CreatorMode } from "../../src/types/CreatorMode.sol";
import { MockERC20 } from "../mocks/MockERC20.sol";
import { MockStock } from "../mocks/MockStock.sol";
import { BaseTest } from "../utils/BaseTest.sol";

/// @notice Regression test for the audit CRITICAL: a HOLDERS-mode holder self-transferring tokens used to
///         double-credit pending dividends in COURFeeVault.beforeBalanceChange (both the from- and to-side
///         settle ran on the same address off one stale pre-move balance), letting them drain the vault's
///         shared stock balance. Fix: beforeBalanceChange returns early when from == to. These tests assert
///         self-transfers never inflate pending dividends and the vault stays solvent.
contract HoldersSelfTransferTest is BaseTest {
    MockStock internal stock;
    address internal token;
    address internal curve;

    function setUp() public {
        _deploySystem();
        stock = _newStock(18, 100e18);
        (token, curve) = _launch(stock, 1000, CreatorMode.HOLDERS, 0); // 10% fee
        // Alice becomes an eligible holder; Bob's buy generates fees that accrue to holders.
        _buyCurve(curve, stock, alice, 50e18);
        _buyCurve(curve, stock, bob, 50e18);
    }

    function _totalClaimable() internal view returns (uint256) {
        return vault.pendingHolder(token, alice) + vault.pendingHolder(token, bob) + vault.creatorOwed(token)
            + vault.platformOwed(address(stock));
    }

    function test_self_transfer_does_not_inflate_pending() public {
        uint256 before = vault.pendingHolder(token, alice);
        assertGt(before, 0, "alice has legit pending");

        uint256 bal = MockERC20(token).balanceOf(alice);
        for (uint256 i; i < 10; i++) {
            vm.prank(alice);
            MockERC20(token).transfer(alice, bal); // self-transfer, nets zero
        }

        // Post-fix: pending is unchanged by self-transfers.
        assertEq(vault.pendingHolder(token, alice), before, "self-transfer must not inflate pending");
        assertEq(MockERC20(token).balanceOf(alice), bal, "balance unchanged");
    }

    function test_vault_stays_solvent_after_self_transfer_spam() public {
        uint256 bal = MockERC20(token).balanceOf(alice);
        for (uint256 i; i < 20; i++) {
            vm.prank(alice);
            MockERC20(token).transfer(alice, bal);
        }
        // Everyone claims everything; the vault must have enough stock to cover it (no phantom dividends).
        uint256 claimable = _totalClaimable();
        uint256 vaultBal = stock.balanceOf(address(vault));
        assertLe(claimable, vaultBal, "total claimable must be backed by vault stock (solvency)");

        vm.prank(alice);
        uint256 got = vault.claimHolder(token);
        // Alice cannot extract more than her legitimate pending (which did not grow from self-transfers).
        assertLe(got, vaultBal, "alice claim bounded by vault balance");
        assertEq(stock.balanceOf(address(vault)) + got, vaultBal, "claim conserves vault balance");
    }
}
