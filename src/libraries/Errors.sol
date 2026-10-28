// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title Errors
/// @notice Custom errors shared across COUR contracts (no revert strings anywhere).
library Errors {
    // --- access / lifecycle ---
    error OnlyFactory();
    error OnlyCurve();
    error OnlyHook();
    error OnlyCreator();
    error OnlyHookOrCurve();
    error AlreadyInitialized();
    error ZeroAddress();

    // --- factory / launch ---
    error StockNotAllowed();
    error ThinReferencePool();
    error FeeOutOfRange();
    error WrongLaunchFee();
    error LaunchesPaused();
    error InitialBuyTooLarge();
    error WrongMode();
    error NotAllowlisted();

    // --- trading ---
    error Slippage();
    error Expired();
    error Graduated();
    error NotGraduated();
    error ZeroAmount();
    error BadPoolKey();
    error ExactOutputNotSupported();

    // --- pricing ---
    error TwapNotReady();

    // --- buyback ---
    error BuybackTooSmall();
    error BuybackTooLarge();
    error PriceDeviation();

    // --- router ---
    error RouterHasFunds();
}
