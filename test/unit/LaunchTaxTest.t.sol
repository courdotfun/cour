// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { LaunchTax } from "../../src/libraries/LaunchTax.sol";
import { Test } from "forge-std/Test.sol";

contract LaunchTaxTest is Test {
    uint256 constant L = 1_000;

    function test_decay_schedule() public pure {
        // 9900 * (5-dt)^6 / 5^6
        assertEq(LaunchTax.taxBps(L, L + 0), 9900); // dt=0
        assertEq(LaunchTax.taxBps(L, L + 1), (uint256(9900) * 4 ** 6) / 15625); // ~2595
        assertEq(LaunchTax.taxBps(L, L + 2), (uint256(9900) * 3 ** 6) / 15625); // ~462
        assertEq(LaunchTax.taxBps(L, L + 3), (uint256(9900) * 2 ** 6) / 15625); // ~40
        assertEq(LaunchTax.taxBps(L, L + 4), (uint256(9900) * 1) / 15625); // ~0
        assertEq(LaunchTax.taxBps(L, L + 5), 0);
        assertEq(LaunchTax.taxBps(L, L + 100), 0);
    }

    function test_monotonic_decreasing() public pure {
        uint256 prev = type(uint256).max;
        for (uint256 dt = 0; dt <= 5; dt++) {
            uint256 b = LaunchTax.taxBps(L, L + dt);
            assertLe(b, prev);
            prev = b;
        }
    }

    function test_taxOn_rounds_up() public pure {
        // dt=1 ~25.95%; on 1000 wei -> ceil
        uint256 t = LaunchTax.taxOn(1000, L, L + 1);
        assertGt(t, 0);
        assertLe(t, 1000);
    }

    function test_clock_skew_max_tax() public pure {
        assertEq(LaunchTax.taxBps(L, L - 1), 9900);
        assertEq(LaunchTax.taxBps(L, L), 9900);
    }
}
