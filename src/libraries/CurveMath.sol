// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { Constants } from "./Constants.sol";
import { FixedPointMathLib } from "solady/utils/FixedPointMathLib.sol";

/// @title CurveMath
/// @notice Virtual constant-product (x*y=k) bonding-curve math, priced in the stock token.
/// @dev x = vS (virtual stock reserve, raw stock units), y = vT (virtual token reserve, raw token units).
///
///      Launch derivation (per token, computed once, stored immutably):
///        Q   = gradMcUsd / startMcUsd                         (= 15 by default)
///        T0  = TOTAL_SUPPLY * Q / (Q - 1)                     (= supply * 15/14)
///        V   = T0 - TOTAL_SUPPLY                              (virtual tokens never sold)
///        vT0 = T0
///        vS0 = startMcUsd * 1e18 * 10^stockDecimals / stockUsdX18 * T0 / TOTAL_SUPPLY
///        k   = vS0 * vT0
///        vTStop = sqrt(V * T0)   -> price(vTStop) = Q * price(vT0); mcap = gradMcUsd at launch price.
///
///      Key identity (proven in CurveMath.t.sol): leftover tokens for the pool, valued at the
///      graduation price, EXACTLY equal the real stock raised. So the full-range LP add is balanced.
///
///      Rounding rule: ALWAYS against the user / in favour of the curve. On buys, round tokensOut down
///      (newVT up). On sells, round stockOut down (newVS up). This preserves the solvency invariant
///      stockBalance >= vS - vS0 up to curve-favouring dust.
library CurveMath {
    using FixedPointMathLib for uint256;

    struct LaunchParams {
        uint256 vS0;
        uint256 vT0;
        uint256 k;
        uint256 vTStop;
    }

    /// @notice Compute immutable curve parameters at launch.
    /// @param stockUsdX18 USD per whole stock token, scaled by 1e18 (from the PriceReader TWAP).
    /// @param stockDecimals Decimals of the stock token (never assumed 18).
    /// @param startMcUsd Start market cap in whole USD.
    /// @param gradMcUsd Graduation market cap in whole USD (> startMcUsd).
    function computeLaunchParams(uint256 stockUsdX18, uint8 stockDecimals, uint256 startMcUsd, uint256 gradMcUsd)
        internal
        pure
        returns (LaunchParams memory p)
    {
        require(stockUsdX18 > 0 && gradMcUsd > startMcUsd && startMcUsd > 0);
        uint256 S = Constants.TOTAL_SUPPLY;

        // T0 = S * gradMc / (gradMc - startMc). Round down (fewer virtual tokens -> curve-favouring).
        uint256 T0 = FixedPointMathLib.fullMulDiv(S, gradMcUsd, gradMcUsd - startMcUsd);
        uint256 V = T0 - S;

        uint256 tenPowD = 10 ** uint256(stockDecimals);
        // inner = startMc * 1e18 * 10^d / stockUsdX18  (the 1e18 factor guarantees inner > 0 for all
        // realistic decimals/prices, so p0 never rounds to zero). Round down.
        uint256 inner = FixedPointMathLib.fullMulDiv(startMcUsd * Constants.PRICE_PRECISION, tenPowD, stockUsdX18);
        // vS0 = inner * T0 / S. Round down.
        uint256 vS0 = FixedPointMathLib.fullMulDiv(inner, T0, S);
        require(vS0 > 0);

        p.vT0 = T0;
        p.vS0 = vS0;
        p.k = vS0 * T0; // bounded well below 2^256 for all realistic launch params (see AUDIT_SCOPE)
        p.vTStop = FixedPointMathLib.sqrt(V * T0); // round down -> curve stops slightly later -> favours curve
    }

    /// @notice stock-per-token price scaled by 1e18, given reserves.
    function priceX18(uint256 vS, uint256 vT) internal pure returns (uint256) {
        return FixedPointMathLib.fullMulDiv(vS, Constants.PRICE_PRECISION, vT);
    }

    struct BuyResult {
        uint256 tokensOut; // tokens delivered to buyer
        uint256 stockUsed; // net stock actually consumed by the curve (<= net input)
        uint256 newVS;
        uint256 newVT;
        bool graduates; // true if this buy reaches the stop point
    }

    /// @notice Compute a buy given NET stock in (after fee and tax already removed).
    /// @dev If the buy would cross vTStop, it is capped exactly at the stop point and the unused net
    ///      stock is reported via stockUsed (< netIn) so the caller can refund the remainder.
    function buy(uint256 vS, uint256 vT, uint256 k, uint256 vTStop, uint256 netIn)
        internal
        pure
        returns (BuyResult memory r)
    {
        uint256 newVS = vS + netIn;
        // newVT = k / newVS, rounded UP so tokensOut is rounded down (curve-favouring).
        uint256 newVT = FixedPointMathLib.divUp(k, newVS);

        if (newVT <= vTStop) {
            // Crosses or reaches the stop point: cap exactly at vTStop.
            r.newVT = vTStop;
            // stock needed to reach the stop: newVS* = k / vTStop (round UP -> buyer pays slightly more).
            uint256 vsAtStop = FixedPointMathLib.divUp(k, vTStop);
            r.newVS = vsAtStop;
            r.stockUsed = vsAtStop - vS;
            r.tokensOut = vT - vTStop;
            r.graduates = true;
        } else {
            r.newVT = newVT;
            r.newVS = newVS;
            r.stockUsed = netIn;
            r.tokensOut = vT - newVT;
            r.graduates = false;
        }
    }

    /// @notice Compute a sell given tokens in. Returns gross stock out (before fee).
    /// @dev Reverts implicitly via underflow if tokensIn would push vT above vT0 (not possible in
    ///      normal flow because outstanding supply <= tokens sold).
    function sell(uint256 vS, uint256 vT, uint256 k, uint256 vT0, uint256 tokensIn)
        internal
        pure
        returns (uint256 stockOutGross, uint256 newVS, uint256 newVT)
    {
        newVT = vT + tokensIn;
        require(newVT <= vT0, "vT>vT0");
        // newVS = k / newVT, rounded UP so stockOut is rounded down (curve-favouring).
        newVS = FixedPointMathLib.divUp(k, newVT);
        stockOutGross = vS - newVS;
    }
}
