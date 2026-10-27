// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {CreatorMode} from "../types/CreatorMode.sol";

/// @title ICOURFeeVault
/// @notice Holds and routes the creator fee (taken in the stock token) per the 80/20 split and the
///         per-token creator mode. Resilient to a paused stock token: claims revert, accounting never corrupts.
interface ICOURFeeVault {
    /// @notice Register a token's fee config. Called once by the factory at launch.
    function registerToken(
        address token,
        address stock,
        address creator,
        uint16 creatorFeeBps,
        CreatorMode mode,
        address feeRecipient
    ) external;

    /// @notice Notify the vault that `amount` of stock fee arrived for `token`. Only hook or curve.
    /// @dev The stock is assumed already transferred to the vault by the caller (hook `take`, curve transfer).
    function notify(address token, uint256 amount) external;

    /// @notice CREATOR mode: creator claims the accrued creator-side fees.
    function claim(address token) external returns (uint256 amount);

    /// @notice HOLDERS mode: caller claims their pro-rata dividend.
    function claimHolder(address token) external returns (uint256 amount);

    /// @notice Hook on token balance changes (HOLDERS mode only). Only the token may call.
    function beforeBalanceChange(address from, address to, uint256 amount) external;

    /// @notice BUYBACK / BUYBACK_BURN: creator spends accrued buyback funds buying the token.
    function executeBuyback(address token, uint256 maxStockIn, uint256 minTokensOut)
        external
        returns (uint256 stockIn, uint256 tokensOut);

    /// @notice Send accrued platform fees for a stock to the treasury. Anyone may call.
    function claimPlatform(address stock) external returns (uint256 amount);

    /// @notice Two-step creator-recipient transfer.
    function setFeeRecipient(address token, address newRecipient) external;
    function acceptFeeRecipient(address token) external;

    // --- views ---
    function creatorOwed(address token) external view returns (uint256);
    function buybackOwed(address token) external view returns (uint256);
    function platformOwed(address stock) external view returns (uint256);
    function pendingHolder(address token, address holder) external view returns (uint256);
    function feeRecipient(address token) external view returns (address);
    function treasury() external view returns (address);
}
