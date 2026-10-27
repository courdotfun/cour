// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

/// @title IStockToken8056
/// @notice Robinhood Stock Token: ERC-20 + ERC-8056 rebasing-by-multiplier interface.
/// @dev Raw balances never rebase; stock splits change `uiMultiplier`. ALL COUR accounting uses raw
///      amounts. The UI multiplier is surfaced only for display. Stock tokens may be paused by the
///      issuer during corporate actions, so transfers can revert transiently.
interface IStockToken8056 is IERC20, IERC20Metadata {
    /// @notice Current display multiplier (raw -> UI). 1e18-scaled by convention.
    function uiMultiplier() external view returns (uint256);

    /// @notice Balance expressed in UI units (raw * uiMultiplier).
    function balanceOfUI(address account) external view returns (uint256);

    /// @notice Pending multiplier that becomes active at `effectiveAt`.
    function newUIMultiplier() external view returns (uint256);

    /// @notice Timestamp at which `newUIMultiplier` takes effect.
    function effectiveAt() external view returns (uint256);
}
