// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { V3Oracle } from "../../src/libraries/V3Oracle.sol";
import { MockERC20 } from "../mocks/MockERC20.sol";
import { MockV3Pool } from "../mocks/MockV3Pool.sol";
import { Test } from "forge-std/Test.sol";

contract V3OracleTest is Test {
    function setUp() public {
        vm.warp(1_000_000);
    }

    function test_consult_returns_mean_tick() public {
        MockERC20 a = new MockERC20("A", "A", 18);
        MockERC20 b = new MockERC20("B", "B", 18);
        MockV3Pool pool = new MockV3Pool(address(a), address(b), 1000);
        assertEq(V3Oracle.consult(address(pool), 900), int24(1000));
    }

    function test_consult_negative_tick_rounds_to_neg_infinity() public {
        MockERC20 a = new MockERC20("A", "A", 18);
        MockERC20 b = new MockERC20("B", "B", 18);
        MockV3Pool pool = new MockV3Pool(address(a), address(b), -1000);
        assertEq(V3Oracle.consult(address(pool), 900), int24(-1000));
    }

    function test_getQuoteAtTick_tick0_is_unity() public {
        MockERC20 a = new MockERC20("A", "A", 18);
        MockERC20 b = new MockERC20("B", "B", 18);
        (address lo, address hi) = address(a) < address(b) ? (address(a), address(b)) : (address(b), address(a));
        assertEq(V3Oracle.getQuoteAtTick(0, 1e18, lo, hi), 1e18);
    }

    function test_getQuoteAtTick_large_tick_uses_x128_branch() public pure {
        // A very large tick pushes sqrtPriceX96 above uint128 max -> exercises the X128 branch.
        uint256 q = V3Oracle.getQuoteAtTick(800000, 1e18, address(1), address(2));
        assertGt(q, 0);
    }
}
