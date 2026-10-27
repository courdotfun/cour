// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IPoolManager } from "v4-core/interfaces/IPoolManager.sol";
import { IUnlockCallback } from "v4-core/interfaces/callback/IUnlockCallback.sol";
import { TickMath } from "v4-core/libraries/TickMath.sol";
import { BalanceDelta } from "v4-core/types/BalanceDelta.sol";
import { Currency } from "v4-core/types/Currency.sol";
import { PoolKey } from "v4-core/types/PoolKey.sol";
import { SwapParams } from "v4-core/types/PoolOperation.sol";

/// @title PoolManagerSwapper
/// @notice Abstract base giving a contract the ability to perform exact-input swaps directly against
///         the Uniswap v4 PoolManager via the `unlock` callback (NOT via the Robinhood Universal
///         Router, whose forked v4 struct has an extra field that breaks standard calldata).
/// @dev Input tokens must already sit in this contract before the swap. Output is `take`n to `recipient`.
abstract contract PoolManagerSwapper is IUnlockCallback {
    using SafeERC20 for IERC20;

    IPoolManager internal immutable _pm;

    struct SwapData {
        PoolKey key;
        bool zeroForOne;
        uint256 amountIn;
        address recipient;
    }

    constructor(address poolManager_) {
        _pm = IPoolManager(poolManager_);
    }

    /// @notice Exact-input swap. Returns the output amount delivered to `recipient`.
    function _swapExactInput(PoolKey memory key, bool zeroForOne, uint256 amountIn, address recipient)
        internal
        returns (uint256 amountOut)
    {
        bytes memory res = _pm.unlock(abi.encode(SwapData(key, zeroForOne, amountIn, recipient)));
        amountOut = abi.decode(res, (uint256));
    }

    /// @inheritdoc IUnlockCallback
    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        require(msg.sender == address(_pm), "PM");
        SwapData memory d = abi.decode(data, (SwapData));

        uint160 limit = d.zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1;
        BalanceDelta delta = _pm.swap(
            d.key,
            SwapParams({ zeroForOne: d.zeroForOne, amountSpecified: -int256(d.amountIn), sqrtPriceLimitX96: limit }),
            ""
        );

        int128 a0 = delta.amount0();
        int128 a1 = delta.amount1();

        // Pay everything we owe (negative deltas); collect everything we are owed (positive deltas).
        if (a0 < 0) _pay(d.key.currency0, uint256(uint128(-a0)));
        if (a1 < 0) _pay(d.key.currency1, uint256(uint128(-a1)));

        uint256 out;
        if (a0 > 0) {
            out = uint256(uint128(a0));
            _pm.take(d.key.currency0, d.recipient, out);
        }
        if (a1 > 0) {
            out = uint256(uint128(a1));
            _pm.take(d.key.currency1, d.recipient, out);
        }
        return abi.encode(out);
    }

    function _pay(Currency currency, uint256 amount) private {
        _pm.sync(currency);
        IERC20(Currency.unwrap(currency)).safeTransfer(address(_pm), amount);
        _pm.settle();
    }
}
