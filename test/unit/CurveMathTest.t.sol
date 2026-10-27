// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { Constants } from "../../src/libraries/Constants.sol";
import { CurveMath } from "../../src/libraries/CurveMath.sol";
import { Test } from "forge-std/Test.sol";

contract CurveMathTest is Test {
    function test_launchParams_defaults() public pure {
        CurveMath.LaunchParams memory p = CurveMath.computeLaunchParams(100e18, 18, 4_000, 60_000);
        // T0 = supply * 15/14
        assertEq(p.vT0, (Constants.TOTAL_SUPPLY * 15) / 14, "T0");
        // vS0 = 4000*1e18*1e18*15/(14*100e18) = 42.857...e18
        assertApproxEqRel(p.vS0, 42.857142857e18, 1e12);
        // vTStop = sqrt(V*T0), V = T0 - supply
        uint256 V = p.vT0 - Constants.TOTAL_SUPPLY;
        assertEq(p.vTStop, _sqrt(V * p.vT0), "vTStop");
        assertEq(p.k, p.vS0 * p.vT0, "k");
    }

    /// @notice The core identity: leftover tokens valued at the graduation price EXACTLY equal the
    ///         raised stock, so the full-range LP add is balanced.
    function test_balanced_graduation_identity() public pure {
        CurveMath.LaunchParams memory p = CurveMath.computeLaunchParams(100e18, 18, 4_000, 60_000);
        uint256 vsStop = p.k / p.vTStop;
        uint256 stockRaised = vsStop - p.vS0;
        uint256 tokenLeftover = p.vTStop - (p.vT0 - Constants.TOTAL_SUPPLY); // vTStop - V
        // token value in stock at stop price = tokenLeftover * (vsStop/vTStop)
        uint256 tokenValueInStock = (tokenLeftover * vsStop) / p.vTStop;
        assertApproxEqRel(tokenValueInStock, stockRaised, 1e12, "balanced");
    }

    function test_price_grows_15x_at_stop() public pure {
        CurveMath.LaunchParams memory p = CurveMath.computeLaunchParams(100e18, 18, 4_000, 60_000);
        uint256 p0 = CurveMath.priceX18(p.vS0, p.vT0);
        uint256 vsStop = p.k / p.vTStop;
        uint256 pStop = CurveMath.priceX18(vsStop, p.vTStop);
        assertApproxEqRel(pStop, p0 * 15, 1e12, "15x");
    }

    function test_buy_caps_at_stop_and_reports_graduation() public pure {
        CurveMath.LaunchParams memory p = CurveMath.computeLaunchParams(100e18, 18, 4_000, 60_000);
        // Huge net; must cap at stop and use less than provided.
        uint256 hugeNet = 1e30;
        CurveMath.BuyResult memory r = CurveMath.buy(p.vS0, p.vT0, p.k, p.vTStop, hugeNet);
        assertTrue(r.graduates);
        assertEq(r.newVT, p.vTStop);
        assertLt(r.stockUsed, hugeNet);
        // tokens out == tokens sold at stop
        assertEq(r.tokensOut, p.vT0 - p.vTStop);
    }

    function test_buy_rounds_against_user() public pure {
        CurveMath.LaunchParams memory p = CurveMath.computeLaunchParams(100e18, 18, 4_000, 60_000);
        CurveMath.BuyResult memory r = CurveMath.buy(p.vS0, p.vT0, p.k, p.vTStop, 1e18);
        // Reconstruct: newVT * newVS >= k (curve-favouring rounding keeps product >= k)
        assertGe(r.newVT * r.newVS, p.k);
    }

    function _sqrt(uint256 x) internal pure returns (uint256 z) {
        if (x == 0) return 0;
        z = (x + 1) / 2;
        uint256 y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
    }
}
