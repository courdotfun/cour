// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Constants} from "./Constants.sol";

/// @title LaunchTax
/// @notice Pons-style anti-snipe tax that decays over the first 5 seconds. Buys only; creator exempt.
/// @dev taxBps(dt) = 9900 * (5 - dt)^6 / 5^6, for whole-second dt in [0,5); 0 at dt >= 5.
///      dt=0 -> 99.00% ; dt=1 -> ~25.95% ; dt=2 -> ~4.62% ; dt=3 -> ~0.41% ; dt=4 -> ~0.0063%.
///      Robinhood Chain has sub-second blocks, so time logic MUST use block.timestamp, never block numbers.
library LaunchTax {
    uint256 private constant POW = 6;
    uint256 private constant DEN = 15_625; // 5^6

    /// @notice Current launch-tax rate in bps given seconds elapsed since launch.
    function taxBps(uint256 launchedAt, uint256 nowTs) internal pure returns (uint256) {
        if (nowTs <= launchedAt) {
            // Same-second or clock skew: maximum tax.
            return Constants.LAUNCH_TAX_START_BPS;
        }
        uint256 dt = nowTs - launchedAt;
        if (dt >= Constants.LAUNCH_TAX_WINDOW) return 0;
        uint256 base = Constants.LAUNCH_TAX_WINDOW - dt; // (5 - dt)
        uint256 p = base * base * base * base * base * base; // base^6
        return (Constants.LAUNCH_TAX_START_BPS * p) / DEN;
    }

    /// @notice Tax amount on a gross stock-in, rounding up (against the buyer).
    function taxOn(uint256 gross, uint256 launchedAt, uint256 nowTs) internal pure returns (uint256) {
        uint256 bps = taxBps(launchedAt, nowTs);
        if (bps == 0) return 0;
        // ceil(gross * bps / 10000)
        return (gross * bps + Constants.BPS - 1) / Constants.BPS;
    }
}
