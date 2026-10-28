// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title Constants
/// @notice Global immutable parameters for COUR Phase 1.
library Constants {
    /// @notice Fixed token supply: 1,000,000,000 with 18 decimals, minted once to the curve.
    uint256 internal constant TOTAL_SUPPLY = 1_000_000_000e18;

    /// @notice Default start market cap in whole USD (admin-configurable for *future* launches; snapshot per token).
    uint256 internal constant START_MC_USD = 4_000;

    /// @notice Default graduation market cap in whole USD.
    uint256 internal constant GRAD_MC_USD = 60_000;

    /// @notice Ratio Q = GRAD/START = 15. Curve multiplies price exactly Q at sell-out.
    uint256 internal constant Q_NUM = 15;
    uint256 internal constant Q_DEN = 1;

    /// @notice Creator fee bounds in basis points: 1%..10%.
    uint16 internal constant CREATOR_FEE_MIN_BPS = 100;
    uint16 internal constant CREATOR_FEE_MAX_BPS = 1000;

    /// @notice Split of the fee: 80% creator-side, 20% platform.
    uint256 internal constant CREATOR_SHARE_BPS = 8000;
    uint256 internal constant PLATFORM_SHARE_BPS = 2000;

    uint256 internal constant BPS = 10_000;

    /// @notice Max tokens a creator may buy in the launch tx: 50% of supply.
    uint256 internal constant MAX_INITIAL_BUY_TOKENS = TOTAL_SUPPLY / 2;

    /// @notice Anti-snipe launch tax window (seconds) and starting rate (bps).
    uint256 internal constant LAUNCH_TAX_WINDOW = 5;
    uint256 internal constant LAUNCH_TAX_START_BPS = 9900;

    /// @notice Graduation pool parameters.
    uint24 internal constant POOL_LP_FEE = 0;
    int24 internal constant POOL_TICK_SPACING = 60;

    /// @notice TWAP windows (seconds): stock USD price and token price for the buyback guard.
    uint32 internal constant TWAP_WINDOW = 1800;
    uint32 internal constant HOOK_TWAP_WINDOW = 300;

    /// @notice Hard floor for reference-pool USD liquidity below which launch reverts (admin-configurable).
    uint256 internal constant DEFAULT_MIN_REF_LIQ_USD = 50_000;

    /// @notice Launch fee is zero in Phase 1 (creator pays only gas).
    uint256 internal constant LAUNCH_FEE = 0;

    /// @notice LP burn sink; also used to exclude dust / burned tokens from dividend eligibility.
    address internal constant DEAD = 0x000000000000000000000000000000000000dEaD;

    /// @notice Canonical Permit2 singleton (identical on every chain). Used by the factory to let the
    ///         v4 PositionManager pull the graduation liquidity when minting the LP NFT to DEAD.
    address internal constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;

    /// @notice Precision used for the holder dividend accumulator (acc-per-share).
    uint256 internal constant ACC_PRECISION = 1e36;

    /// @notice Precision used for USD prices returned by the PriceReader (USD per whole stock * 1e18).
    uint256 internal constant PRICE_PRECISION = 1e18;

    /// @notice Buyback guards: min notional (USD), max fraction of pool stock per call, max price deviation.
    uint256 internal constant DEFAULT_MIN_BUYBACK_USD = 50;
    uint256 internal constant BUYBACK_MAX_POOL_BPS = 200; // 2% of pool stock liquidity per call
    uint256 internal constant BUYBACK_MAX_DEVIATION_BPS = 300; // 3% from TWAP
}
