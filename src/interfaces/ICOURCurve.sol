// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {TokenConfig} from "../types/TokenConfig.sol";

/// @title ICOURCurve
/// @notice Virtual constant-product bonding curve (one EIP-1167 clone per token), priced in stock.
interface ICOURCurve {
    /// @notice Initialize the clone. Only the factory, once.
    function initialize(TokenConfig calldata cfg) external;

    /// @notice Buy tokens with `stockIn` gross stock (fee + launch tax applied inside).
    /// @return tokensOut tokens delivered to `to`.
    /// @return stockUsed gross stock actually consumed (may be < stockIn if the buy graduates with a refund).
    function buy(uint256 stockIn, uint256 minTokensOut, address to, uint256 deadline)
        external
        returns (uint256 tokensOut, uint256 stockUsed);

    /// @notice Sell `tokensIn` tokens for stock (fee applied inside, no launch tax).
    function sell(uint256 tokensIn, uint256 minStockOut, address to, uint256 deadline)
        external
        returns (uint256 stockOut);

    // --- quotes (views) ---
    function quoteBuy(uint256 stockIn) external view returns (uint256 tokensOut, uint256 fee, uint256 tax);
    function quoteSell(uint256 tokensIn) external view returns (uint256 stockOut, uint256 fee);
    function quoteStockForTokens(uint256 tokensWanted) external view returns (uint256 stockIn);

    /// @notice Progress toward graduation in bps (sold / soldAtStop).
    function progressBps() external view returns (uint256);

    function graduated() external view returns (bool);
    function vS() external view returns (uint256);
    function vT() external view returns (uint256);
    function config() external view returns (TokenConfig memory);
}
