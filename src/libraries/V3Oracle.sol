// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { IUniswapV3PoolMinimal } from "../interfaces/IUniswapV3PoolMinimal.sol";
import { FixedPointMathLib } from "solady/utils/FixedPointMathLib.sol";
import { TickMath } from "v4-core/libraries/TickMath.sol";

/// @title V3Oracle
/// @notice Minimal, 0.8-native port of Uniswap's OracleLibrary (consult + getQuoteAtTick). No oracle
///         dependencies: prices are derived purely from a v3 pool's observation accumulator.
library V3Oracle {
    /// @notice Time-weighted arithmetic-mean tick over `secondsAgo`. Reverts if the pool lacks history.
    function consult(address pool, uint32 secondsAgo) internal view returns (int24 arithmeticMeanTick) {
        require(secondsAgo != 0, "BP");
        uint32[] memory secondsAgos = new uint32[](2);
        secondsAgos[0] = secondsAgo;
        secondsAgos[1] = 0;

        (int56[] memory tickCumulatives,) = IUniswapV3PoolMinimal(pool).observe(secondsAgos);
        int56 delta = tickCumulatives[1] - tickCumulatives[0];

        arithmeticMeanTick = int24(delta / int56(uint56(secondsAgo)));
        // Always round to negative infinity (matches Uniswap OracleLibrary).
        if (delta < 0 && (delta % int56(uint56(secondsAgo)) != 0)) arithmeticMeanTick--;
    }

    /// @notice Quote `baseAmount` of base token in terms of quote token at a given tick.
    function getQuoteAtTick(int24 tick, uint256 baseAmount, address baseToken, address quoteToken)
        internal
        pure
        returns (uint256 quoteAmount)
    {
        uint160 sqrtPriceX96 = TickMath.getSqrtPriceAtTick(tick);
        if (sqrtPriceX96 <= type(uint128).max) {
            uint256 ratioX192 = uint256(sqrtPriceX96) * sqrtPriceX96;
            quoteAmount = baseToken < quoteToken
                ? FixedPointMathLib.fullMulDiv(ratioX192, baseAmount, 1 << 192)
                : FixedPointMathLib.fullMulDiv(1 << 192, baseAmount, ratioX192);
        } else {
            uint256 ratioX128 = FixedPointMathLib.fullMulDiv(sqrtPriceX96, sqrtPriceX96, 1 << 64);
            quoteAmount = baseToken < quoteToken
                ? FixedPointMathLib.fullMulDiv(ratioX128, baseAmount, 1 << 128)
                : FixedPointMathLib.fullMulDiv(1 << 128, baseAmount, ratioX128);
        }
    }
}
