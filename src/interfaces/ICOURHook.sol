// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title ICOURHook
/// @notice COUR Uniswap v4 hook: captures the creator fee on pool swaps (in stock) and maintains a
///         per-pool tick accumulator providing a short-window TWAP for the buyback guard.
interface ICOURHook {
    /// @notice Time-weighted arithmetic-mean tick for `poolId` over the last `secondsAgo` seconds.
    function consult(bytes32 poolId, uint32 secondsAgo) external view returns (int24 arithmeticMeanTick);

    /// @notice Pool spot price (stock per token, 1e18) and TWAP price for the buyback deviation guard.
    function priceInfo(address token) external view returns (uint256 spotX18, uint256 twapX18);

    /// @notice Best-effort stock-side reserve of the graduated full-range pool (for the 2% buyback cap).
    function poolStockReserve(address token, address stock) external view returns (uint256);

    /// @notice True once the observed TWAP window spans at least HOOK_TWAP_WINDOW seconds, i.e. the TWAP
    ///         used by the buyback deviation guard is backed by a full window of observations (L-2).
    function twapWindowFull(address token) external view returns (bool);
}
