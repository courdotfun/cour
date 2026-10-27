// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { TokenConfig } from "../types/TokenConfig.sol";
import { ICOURPriceReader } from "./ICOURPriceReader.sol";

/// @title ICOURFactory
/// @notice Launches COUR tokens and graduates them into Uniswap v4 pools with the COUR hook.
interface ICOURFactory {
    struct CreateParams {
        string name;
        string symbol;
        string metadataURI;
        address stock; // must be allowlisted
        uint16 creatorFeeBps; // 100..1000
        uint8 creatorMode; // 0..3
        address feeRecipient; // creator-side recipient; defaults to msg.sender if zero
        uint256 initialBuyStock; // optional tax-free launch buy; capped at 50% supply
        uint256 minInitialTokens; // slippage bound for the initial buy
        bytes32 salt; // CREATE2 salt for a deterministic token address
    }

    function createToken(CreateParams calldata p) external payable returns (address token, address curve);

    /// @notice Build the graduation pool, add full-range liquidity, burn the position. Only the token's curve.
    function graduate(address token) external;

    // --- views used by curve / hook / vault ---
    function tokenConfig(address token) external view returns (TokenConfig memory);
    function curveOf(address token) external view returns (address);
    function isCOURToken(address token) external view returns (bool);
    function poolIdOf(address token) external view returns (bytes32);
    function hook() external view returns (address);
    function feeVault() external view returns (address);
    function priceReader() external view returns (ICOURPriceReader);
    function poolManager() external view returns (address);

    // --- admin ---
    function setStock(address stock, bool allowed, address refPool, ICOURPriceReader.RefKind kind) external;
    function setLaunchParams(uint256 startMcUsd, uint256 gradMcUsd, uint256 minRefLiqUsd, uint256 launchFee) external;
    function setLaunchesPaused(bool paused) external;
    function stockAllowed(address stock) external view returns (bool);
}
