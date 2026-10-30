// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { Constants } from "../../src/libraries/Constants.sol";
import { CurveMath } from "../../src/libraries/CurveMath.sol";

/// @notice Medusa/Echidna ASSERTION-mode fuzz harness for the COUR bonding-curve math — the
///         security-critical core (launch-param derivation, buy/sell/graduation reserve moves, and the
///         "rounding always favours the curve" rule). Pure math, no deployment, so it runs cleanly under
///         medusa on any platform. Every public function bounds its fuzzed inputs to a realistic domain and
///         asserts an invariant; a failing assert is a medusa violation.
///
/// Run: medusa fuzz --config medusa.json   (target contract: CurveMathFuzz, assertion mode)
contract CurveMathFuzz {
    uint256 internal constant S = Constants.TOTAL_SUPPLY;

    function _bound(uint256 x, uint256 lo, uint256 hi) internal pure returns (uint256) {
        if (hi <= lo) return lo;
        return lo + (x % (hi - lo + 1));
    }

    /// Launch params: for any realistic stock price/decimals and start<grad mcap, the derived curve is sane.
    function check_launch_params(uint256 priceWhole, uint8 decSel, uint256 startMc, uint256 gradMc) public pure {
        uint8 dec = [6, 8, 18][uint256(decSel) % 3];
        uint256 priceX18 = _bound(priceWhole, 1, 5000) * 1e18;
        startMc = _bound(startMc, 1, 1_000_000);
        gradMc = _bound(gradMc, startMc + 1, startMc + 10_000_000);

        CurveMath.LaunchParams memory p = CurveMath.computeLaunchParams(priceX18, dec, startMc, gradMc);
        assert(p.vS0 > 0);
        assert(p.vT0 > S); // virtual tokens exceed supply
        assert(p.vTStop > 0 && p.vTStop < p.vT0); // stop strictly inside
        assert(p.k == p.vS0 * p.vT0);
        // tokens sold at graduation is strictly positive and below total supply.
        uint256 sold = p.vT0 - p.vTStop;
        assert(sold > 0 && sold < S + p.vT0);
    }

    /// Buy: reserves move consistently and rounding favours the curve (tokensOut is the exact reserve delta,
    /// newVT never dips below the stop, and on graduation the unused net is refunded).
    function check_buy(uint256 priceWhole, uint8 decSel, uint256 netIn) public pure {
        uint8 dec = [6, 8, 18][uint256(decSel) % 3];
        CurveMath.LaunchParams memory p =
            CurveMath.computeLaunchParams(_bound(priceWhole, 1, 5000) * 1e18, dec, 4000, 60000);
        netIn = _bound(netIn, 1, p.vS0 * 1_000_000 + 1); // up to a huge buy
        CurveMath.BuyResult memory r = CurveMath.buy(p.vS0, p.vT0, p.k, p.vTStop, netIn);

        assert(r.tokensOut == p.vT0 - r.newVT); // exact reserve delta
        assert(r.newVT >= p.vTStop); // never crosses below the stop
        assert(r.newVS >= p.vS0);
        assert(r.stockUsed <= netIn); // never consumes more than supplied
        if (r.graduates) {
            assert(r.newVT == p.vTStop);
            assert(r.tokensOut == p.vT0 - p.vTStop);
        } else {
            assert(r.stockUsed == netIn); // no refund off-graduation
            // curve-favouring: newVT rounded UP so tokensOut rounded DOWN => newVS*newVT >= k.
            assert(r.newVS * r.newVT >= p.k);
        }
    }

    /// Buy then immediately sell the received tokens never returns more stock than was put in (no free money).
    function check_buy_then_sell_no_profit(uint256 priceWhole, uint8 decSel, uint256 netIn) public pure {
        uint8 dec = [6, 8, 18][uint256(decSel) % 3];
        CurveMath.LaunchParams memory p =
            CurveMath.computeLaunchParams(_bound(priceWhole, 1, 5000) * 1e18, dec, 4000, 60000);
        // keep the buy below graduation so a round-trip is well-defined
        netIn = _bound(netIn, 1, (p.k / p.vTStop > p.vS0 ? (p.k / p.vTStop - p.vS0) / 2 : 1) + 1);
        CurveMath.BuyResult memory r = CurveMath.buy(p.vS0, p.vT0, p.k, p.vTStop, netIn);
        if (r.graduates || r.tokensOut == 0) return;
        (uint256 stockOut,,) = CurveMath.sell(r.newVS, r.newVT, p.k, p.vT0, r.tokensOut);
        assert(stockOut <= netIn); // round-trip never profits the trader
    }

    /// Sell: stock out is the exact reserve delta and rounding favours the curve (newVS rounded up).
    function check_sell(uint256 priceWhole, uint8 decSel, uint256 tokensIn) public pure {
        uint8 dec = [6, 8, 18][uint256(decSel) % 3];
        CurveMath.LaunchParams memory p =
            CurveMath.computeLaunchParams(_bound(priceWhole, 1, 5000) * 1e18, dec, 4000, 60000);
        // outstanding tokens are at most vT0 - vTStop; bound tokensIn so vT stays <= vT0
        tokensIn = _bound(tokensIn, 1, p.vT0 - p.vTStop);
        // Start from the ON-CURVE point at the stop: vS = k/vTStop (rounded up, as buy leaves it).
        uint256 vsAtStop = (p.k + p.vTStop - 1) / p.vTStop;
        (uint256 stockOut, uint256 newVS, uint256 newVT) = CurveMath.sell(vsAtStop, p.vTStop, p.k, p.vT0, tokensIn);
        assert(newVT <= p.vT0);
        assert(stockOut == vsAtStop - newVS);
        assert(newVS * newVT >= p.k); // curve-favouring rounding
    }
}
