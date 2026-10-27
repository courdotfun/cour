// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title Events
/// @notice All protocol events, carrying enough data for an indexer (Ponder/Envio) to rebuild
///         every chart, holder list and fee dashboard without extra RPC calls.
library Events {
    /// @param startPriceX stock-per-token price at launch, scaled by 1e18.
    event TokenLaunched(
        address indexed token,
        address indexed curve,
        address indexed creator,
        address stock,
        uint16 creatorFeeBps,
        uint8 creatorMode,
        address feeRecipient,
        uint256 startPriceX,
        string metadataURI
    );

    /// @param isBuy true for buy (stock in), false for sell (tokens in).
    event CurveTrade(
        address indexed token,
        address indexed trader,
        bool isBuy,
        uint256 stockAmount,
        uint256 tokenAmount,
        uint256 fee,
        uint256 tax,
        uint256 vS,
        uint256 vT
    );

    event Graduated(
        address indexed token,
        bytes32 indexed poolId,
        uint256 tokenLiquidity,
        uint256 stockLiquidity,
        uint256 positionId
    );

    /// @param toCreatorSide amount routed to the creator-side bucket (per mode).
    /// @param toPlatform amount routed to the platform bucket.
    event FeeTaken(address indexed token, address indexed payer, uint256 stockFee, uint256 toCreatorSide, uint256 toPlatform);

    event FeeClaimed(address indexed token, address indexed recipient, uint256 amount);
    event HolderClaimed(address indexed token, address indexed holder, uint256 amount);
    event PlatformClaimed(address indexed stock, address indexed treasury, uint256 amount);
    event BuybackExecuted(address indexed token, uint256 stockIn, uint256 tokensOut, bool burned);
    event FeeRecipientChanged(address indexed token, address indexed oldRecipient, address indexed newRecipient);

    // --- admin ---
    event StockSet(address indexed stock, bool allowed, address refPool, uint8 refKind);
    event LaunchParamsSet(uint256 startMcUsd, uint256 gradMcUsd, uint256 minRefLiqUsd, uint256 launchFee);
    event LaunchesPausedSet(bool paused);
    event TreasurySet(address indexed treasury);
}
