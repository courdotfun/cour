// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { Constants } from "./Constants.sol";
import { IHooks } from "v4-core/interfaces/IHooks.sol";
import { Currency } from "v4-core/types/Currency.sol";
import { PoolKey } from "v4-core/types/PoolKey.sol";

/// @title PoolKeyLib
/// @notice Canonical construction of the one legitimate COUR pool key for a (token, stock) pair:
///         fee = 0, tickSpacing = 60, hooks = COURHook, currencies sorted ascending.
library PoolKeyLib {
    function build(address token, address stock, address hook)
        internal
        pure
        returns (PoolKey memory key, bool tokenIsZero)
    {
        (address c0, address c1) = token < stock ? (token, stock) : (stock, token);
        tokenIsZero = token < stock;
        key = PoolKey({
            currency0: Currency.wrap(c0),
            currency1: Currency.wrap(c1),
            fee: Constants.POOL_LP_FEE,
            tickSpacing: Constants.POOL_TICK_SPACING,
            hooks: IHooks(hook)
        });
    }
}
