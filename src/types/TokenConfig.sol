// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {CreatorMode} from "./CreatorMode.sol";

/// @notice Per-token launch configuration, snapshotted immutably at creation.
/// @dev Curve params (vS0, vT0, k, vTStop) are computed once from the launch stock price so
///      graduation is defined by sell-out in *stock units*, never by re-reading price later.
struct TokenConfig {
    address token; // COUR token address
    address stock; // paired Robinhood stock token
    address creator; // launcher
    uint16 creatorFeeBps; // 100..1000 (1%..10%), immutable
    CreatorMode mode; // fee routing mode, immutable
    uint8 stockDecimals; // cached stock decimals (never assume 18)
    uint64 launchedAt; // block.timestamp of launch (for anti-snipe tax)
    uint256 vS0; // initial virtual stock reserve (raw stock units)
    uint256 vT0; // initial virtual token reserve (== T0, raw token units)
    uint256 k; // constant product vS0 * vT0
    uint256 vTStop; // graduation stop point for vT (raw token units)
}
