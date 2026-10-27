// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title ICOURPriceReader
/// @notice Oracle-free USD pricing for stock tokens, sourced exclusively from Uniswap v3 pools on
///         Robinhood Chain. No third-party oracles anywhere.
interface ICOURPriceReader {
    /// @notice Reference-pool kind for a stock.
    enum RefKind {
        NONE,
        USDG, // direct STOCK/USDG pool
        WETH // STOCK/WETH pool priced via WETH/USDG

    }

    /// @notice USD per *whole* stock token, scaled by 1e18 (raw-unit aware), plus the source used.
    /// @return priceX18 USD price * 1e18.
    /// @return source 1 = STOCK/USDG, 2 = STOCK/WETH*WETH/USDG.
    function stockUsd(address stock) external view returns (uint256 priceX18, uint8 source);

    /// @notice Approximate USD liquidity of the stock's reference pool (for the ThinReferencePool check).
    function refLiquidityUsd(address stock) external view returns (uint256);

    /// @notice Current ERC-8056 UI multiplier of the stock (display only).
    function uiMultiplier(address stock) external view returns (uint256);

    /// @notice Permissionlessly grow a v3 pool's observation cardinality so TWAPs are available.
    function bumpCardinality(address pool, uint16 n) external;

    /// @notice Configure a stock's reference pool (admin only).
    function setRefPool(address stock, address refPool, RefKind kind) external;
}
