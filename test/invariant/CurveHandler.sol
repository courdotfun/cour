// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { ICOURCurve } from "../../src/interfaces/ICOURCurve.sol";
import { MockERC20 } from "../mocks/MockERC20.sol";
import { MockStock } from "../mocks/MockStock.sol";
import { Test } from "forge-std/Test.sol";

/// @notice Drives random buys/sells against one launched (CREATOR-mode) token for invariant testing.
///         Stays pre-graduation by capping buy sizes; actions that revert are ignored (fail_on_revert=false).
contract CurveHandler is Test {
    ICOURCurve public curve;
    MockStock public stock;
    MockERC20 public token;

    address[] internal actors;
    uint256 public ghostStockIn; // total gross stock pulled into the curve by buys
    uint256 public ghostStockOut; // total stock paid out by sells (incl. fee portion leaving to vault)

    constructor(address curve_, address stock_, address token_) {
        curve = ICOURCurve(curve_);
        stock = MockStock(stock_);
        token = MockERC20(token_);
        actors.push(makeAddr("h1"));
        actors.push(makeAddr("h2"));
        actors.push(makeAddr("h3"));
    }

    function _actor(uint256 s) internal view returns (address) {
        return actors[s % actors.length];
    }

    function buy(uint256 actorSeed, uint256 amtSeed) external {
        if (curve.graduated()) return;
        address a = _actor(actorSeed);
        uint256 amt = bound(amtSeed, 1e16, 5e18); // small: avoid graduation
        stock.mint(a, amt);
        vm.startPrank(a);
        stock.approve(address(curve), amt);
        try curve.buy(amt, 0, a, block.timestamp) {
            ghostStockIn += amt;
        } catch { }
        vm.stopPrank();
    }

    function sell(uint256 actorSeed, uint256 amtSeed) external {
        if (curve.graduated()) return;
        address a = _actor(actorSeed);
        uint256 bal = token.balanceOf(a);
        if (bal == 0) return;
        uint256 amt = bound(amtSeed, 1, bal);
        vm.startPrank(a);
        token.approve(address(curve), amt);
        try curve.sell(amt, 0, a, block.timestamp) { } catch { }
        vm.stopPrank();
    }
}
