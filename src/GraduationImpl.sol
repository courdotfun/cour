// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { FixedPointMathLib } from "solady/utils/FixedPointMathLib.sol";

import { IAllowanceTransfer } from "permit2/src/interfaces/IAllowanceTransfer.sol";
import { IPoolManager } from "v4-core/interfaces/IPoolManager.sol";
import { TickMath } from "v4-core/libraries/TickMath.sol";
import { Currency } from "v4-core/types/Currency.sol";
import { PoolKey } from "v4-core/types/PoolKey.sol";
import { IPositionManager } from "v4-periphery/src/interfaces/IPositionManager.sol";
import { Actions } from "v4-periphery/src/libraries/Actions.sol";
import { LiquidityAmounts } from "v4-periphery/src/libraries/LiquidityAmounts.sol";

import { ICOURFeeVault } from "./interfaces/ICOURFeeVault.sol";
import { Constants } from "./libraries/Constants.sol";
import { Errors } from "./libraries/Errors.sol";
import { PoolKeyLib } from "./libraries/PoolKeyLib.sol";

/// @title GraduationImpl
/// @notice Stateless implementation of the graduation pool-init + LP mint, executed by COURFactory via
///         DELEGATECALL so the heavy Uniswap v4 / Permit2 code lives OUTSIDE the factory bytecode (keeping
///         the factory under the EIP-170 24,576-byte limit). Because it runs in the factory's context,
///         `address(this)` is the factory: it initializes the pool as the factory (so the hook's
///         `beforeInitialize` sees `sender == factory`), spends the factory's token/stock balances, and
///         mints the full-range position NFT to DEAD. MUST declare NO storage variables.
contract GraduationImpl {
    using SafeERC20 for IERC20;

    /// @dev The impl's own deployed address, baked into its bytecode. Under a delegatecall `address(this)`
    ///      is the FACTORY (!= __self); a direct call has `address(this) == __self`. Lets graduate() reject
    ///      direct calls (defense-in-depth; a direct call is already inert — hook rejects non-factory init).
    address private immutable __self = address(this);

    struct Params {
        address token;
        address stock;
        address hook;
        address poolManager;
        address positionManager;
        address feeVault;
        uint256 stockRaised;
        uint256 tokenLeftover;
    }

    /// @dev Delegatecalled by the factory. Returns (positionId, tokenIntoPool, stockIntoPool) for the event.
    function graduate(Params calldata p)
        external
        returns (uint256 positionId, uint256 tokenLeftoverNet, uint256 stockRaisedNet)
    {
        if (address(this) == __self) revert Errors.OnlyDelegatecall(); // reject direct (non-delegatecall) calls
        (PoolKey memory key, bool tokenIsZero) = PoolKeyLib.build(p.token, p.stock, p.hook);
        (uint256 amount0, uint256 amount1) =
            tokenIsZero ? (p.tokenLeftover, p.stockRaised) : (p.stockRaised, p.tokenLeftover);

        // Initialize the pool at the reserve ratio (= graduation price). X128 encoding avoids the X192
        // overflow for low-decimal stock vs an 18-decimal token.
        uint256 ratioX128 = FixedPointMathLib.fullMulDiv(amount1, 1 << 128, amount0);
        uint160 sqrtPriceX96 = uint160(FixedPointMathLib.sqrt(ratioX128) << 32);
        IPoolManager(p.poolManager).initialize(key, sqrtPriceX96);

        // forge-lint: disable-next-line(divide-before-multiply)
        int24 tickLower = (TickMath.MIN_TICK / Constants.POOL_TICK_SPACING) * Constants.POOL_TICK_SPACING;
        // forge-lint: disable-next-line(divide-before-multiply)
        int24 tickUpper = (TickMath.MAX_TICK / Constants.POOL_TICK_SPACING) * Constants.POOL_TICK_SPACING;
        uint128 liq = LiquidityAmounts.getLiquidityForAmounts(
            sqrtPriceX96,
            TickMath.getSqrtPriceAtTick(tickLower),
            TickMath.getSqrtPriceAtTick(tickUpper),
            amount0,
            amount1
        );

        // Mint the full-range position NFT to DEAD via the PositionManager (paying via Permit2).
        positionId = IPositionManager(p.positionManager).nextTokenId();
        _permit2Approve(key.currency0, uint160(amount0), p.positionManager);
        _permit2Approve(key.currency1, uint160(amount1), p.positionManager);
        {
            bytes memory actions = abi.encodePacked(uint8(Actions.MINT_POSITION), uint8(Actions.SETTLE_PAIR));
            bytes[] memory params = new bytes[](2);
            params[0] = abi.encode(
                key, tickLower, tickUpper, uint256(liq), uint128(amount0), uint128(amount1), Constants.DEAD, bytes("")
            );
            params[1] = abi.encode(key.currency0, key.currency1);
            IPositionManager(p.positionManager).modifyLiquidities(abi.encode(actions, params), block.timestamp);
        }
        _permit2Approve(key.currency0, 0, p.positionManager);
        _permit2Approve(key.currency1, 0, p.positionManager);

        // Sweep the rounding dust: tokens -> DEAD, stock -> platform bucket.
        uint256 tokenDust = IERC20(p.token).balanceOf(address(this));
        uint256 stockDust = IERC20(p.stock).balanceOf(address(this));
        if (tokenDust > 0) IERC20(p.token).safeTransfer(Constants.DEAD, tokenDust);
        if (stockDust > 0) {
            IERC20(p.stock).safeTransfer(p.feeVault, stockDust);
            ICOURFeeVault(p.feeVault).creditPlatform(p.stock, stockDust);
        }
        tokenLeftoverNet = p.tokenLeftover - tokenDust;
        stockRaisedNet = p.stockRaised - stockDust;
    }

    function _permit2Approve(Currency currency, uint160 amount, address posm) private {
        address t = Currency.unwrap(currency);
        IERC20(t).forceApprove(Constants.PERMIT2, amount);
        IAllowanceTransfer(Constants.PERMIT2).approve(t, posm, amount, uint48(block.timestamp + 1));
    }
}
