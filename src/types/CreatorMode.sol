// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @notice How the creator-side 80% of the fee is routed. Chosen at launch, immutable.
/// @dev CREATOR: claimable by feeRecipient. HOLDERS: pro-rata dividend to token holders.
///      BUYBACK: accrues, creator triggers buyback, tokens to feeRecipient.
///      BUYBACK_BURN: same as BUYBACK but bought tokens sent to DEAD.
enum CreatorMode {
    CREATOR, // 0
    HOLDERS, // 1
    BUYBACK, // 2
    BUYBACK_BURN // 3

}

// Highest valid enum value, used for range validation on untrusted uint8 input.
uint8 constant CREATOR_MODE_MAX = 3;
