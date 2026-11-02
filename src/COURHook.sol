// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { FixedPointMathLib } from "solady/utils/FixedPointMathLib.sol";
import { IHooks } from "v4-core/interfaces/IHooks.sol";
import { IPoolManager } from "v4-core/interfaces/IPoolManager.sol";
import { Hooks } from "v4-core/libraries/Hooks.sol";
import { SqrtPriceMath } from "v4-core/libraries/SqrtPriceMath.sol";
import { StateLibrary } from "v4-core/libraries/StateLibrary.sol";
import { TickMath } from "v4-core/libraries/TickMath.sol";
import { BalanceDelta } from "v4-core/types/BalanceDelta.sol";
import { BeforeSwapDelta, toBeforeSwapDelta } from "v4-core/types/BeforeSwapDelta.sol";
import { Currency } from "v4-core/types/Currency.sol";
import { PoolId, PoolIdLibrary } from "v4-core/types/PoolId.sol";
import { PoolKey } from "v4-core/types/PoolKey.sol";
import { ModifyLiquidityParams, SwapParams } from "v4-core/types/PoolOperation.sol";

import { ICOURFactory } from "./interfaces/ICOURFactory.sol";
import { ICOURFeeVault } from "./interfaces/ICOURFeeVault.sol";
import { ICOURHook } from "./interfaces/ICOURHook.sol";
import { Constants } from "./libraries/Constants.sol";
import { Errors } from "./libraries/Errors.sol";
import { Events } from "./libraries/Events.sol";
import { LaunchTax } from "./libraries/LaunchTax.sol";
import { TokenConfig } from "./types/TokenConfig.sol";

/// @title COURHook
/// @notice Uniswap v4 hook that captures the COUR creator fee (always in the stock token) on pool
///         swaps and maintains a per-pool tick accumulator giving a short-window TWAP for the buyback
///         guard. Pools carrying this hook can be initialized ONLY by the COUR factory, with fee 0 and
///         tickSpacing 60. Exact-output swaps are rejected in Phase 1.
contract COURHook is IHooks, ICOURHook {
    using StateLibrary for IPoolManager;
    using PoolIdLibrary for PoolKey;

    /// @dev Stretch-goal exact-output fee handling is disabled by default (see docs/DECISIONS.md).
    bool internal constant EXACT_OUTPUT_ENABLED = false;

    IPoolManager public immutable poolManager;
    ICOURFactory public immutable factory;
    address public immutable feeVault;

    struct PoolInfo {
        address token;
        address stock;
        uint16 feeBps;
        uint64 launchedAt;
        bool tokenIsZero;
        bool set;
    }

    struct Obs {
        uint32 lastTs;
        int24 lastTick;
        int56 cum; // cumulative tick-seconds
        uint32 anchorTs;
        int56 anchorCum;
        uint32 prevAnchorTs;
        int56 prevAnchorCum;
    }

    mapping(PoolId => PoolInfo) internal _pool;
    mapping(PoolId => Obs) internal _obs;

    modifier onlyPoolManager() {
        if (msg.sender != address(poolManager)) revert Errors.OnlyHook();
        _;
    }

    constructor(address poolManager_, address factory_, address feeVault_) {
        poolManager = IPoolManager(poolManager_);
        factory = ICOURFactory(factory_);
        feeVault = feeVault_;
        // Sanity: this address must carry exactly the permission bits we implement.
        uint160 flags = uint160(
            Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG
                | Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG | Hooks.AFTER_SWAP_RETURNS_DELTA_FLAG
        );
        if ((uint160(address(this)) & Hooks.ALL_HOOK_MASK) != flags) revert Errors.BadPoolKey();
    }

    /// @notice Permissions (also used by HookMiner to find a valid salt).
    function getHookPermissions() public pure returns (Hooks.Permissions memory p) {
        p.beforeInitialize = true;
        p.beforeSwap = true;
        p.afterSwap = true;
        p.beforeSwapReturnDelta = true;
        p.afterSwapReturnDelta = true;
    }

    // --------------------------------------------------------------- beforeInitialize

    /// @inheritdoc IHooks
    function beforeInitialize(address sender, PoolKey calldata key, uint160 sqrtPriceX96)
        external
        onlyPoolManager
        returns (bytes4)
    {
        if (sender != address(factory)) revert Errors.OnlyFactory();
        if (key.fee != Constants.POOL_LP_FEE || key.tickSpacing != Constants.POOL_TICK_SPACING) {
            revert Errors.BadPoolKey();
        }

        address c0 = Currency.unwrap(key.currency0);
        address c1 = Currency.unwrap(key.currency1);
        address tok;
        address stk;
        bool tokenIsZero;
        if (factory.isCOURToken(c0)) {
            (tok, stk, tokenIsZero) = (c0, c1, true);
        } else if (factory.isCOURToken(c1)) {
            (tok, stk, tokenIsZero) = (c1, c0, false);
        } else {
            revert Errors.BadPoolKey();
        }
        TokenConfig memory cfg = factory.tokenConfig(tok);
        if (cfg.stock != stk) revert Errors.BadPoolKey();

        PoolId id = key.toId();
        _pool[id] = PoolInfo({
            token: tok,
            stock: stk,
            feeBps: cfg.creatorFeeBps,
            launchedAt: cfg.launchedAt,
            tokenIsZero: tokenIsZero,
            set: true
        });

        Obs storage o = _obs[id];
        o.lastTs = uint32(block.timestamp);
        o.lastTick = TickMath.getTickAtSqrtPrice(sqrtPriceX96);
        o.anchorTs = uint32(block.timestamp);
        return IHooks.beforeInitialize.selector;
    }

    // --------------------------------------------------------------- beforeSwap (buy fee)

    /// @inheritdoc IHooks
    function beforeSwap(address sender, PoolKey calldata key, SwapParams calldata params, bytes calldata)
        external
        onlyPoolManager
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        PoolId id = key.toId();
        PoolInfo memory info = _pool[id];
        if (!info.set) revert Errors.BadPoolKey();

        if (!EXACT_OUTPUT_ENABLED && params.amountSpecified > 0) revert Errors.ExactOutputNotSupported();

        _updateObs(id);

        // Buyback swaps from the vault are exempt.
        if (sender == feeVault) return (IHooks.beforeSwap.selector, toBeforeSwapDelta(0, 0), 0);

        bool inputIsStock = params.zeroForOne ? !info.tokenIsZero : info.tokenIsZero;
        if (!inputIsStock) {
            // Sell (input = token): fee is taken from the stock output in afterSwap.
            return (IHooks.beforeSwap.selector, toBeforeSwapDelta(0, 0), 0);
        }

        // Buy (input = stock, exact-input): take fee (+ launch tax if in-window) from the input.
        uint256 amountIn = uint256(-params.amountSpecified);
        uint256 fee = FixedPointMathLib.mulDivUp(amountIn, info.feeBps, Constants.BPS);
        fee += LaunchTax.taxOn(amountIn, info.launchedAt, block.timestamp);
        if (fee == 0) return (IHooks.beforeSwap.selector, toBeforeSwapDelta(0, 0), 0);

        Currency stockCurrency = info.tokenIsZero ? key.currency1 : key.currency0;
        poolManager.take(stockCurrency, feeVault, fee);
        _notify(info.token, info.stock, sender, fee);

        return (IHooks.beforeSwap.selector, toBeforeSwapDelta(int128(int256(fee)), 0), 0);
    }

    // --------------------------------------------------------------- afterSwap (sell fee)

    /// @inheritdoc IHooks
    function afterSwap(
        address sender,
        PoolKey calldata key,
        SwapParams calldata params,
        BalanceDelta delta,
        bytes calldata
    ) external onlyPoolManager returns (bytes4, int128) {
        PoolId id = key.toId();
        PoolInfo memory info = _pool[id];
        if (!info.set) revert Errors.BadPoolKey();
        if (sender == feeVault) return (IHooks.afterSwap.selector, 0);

        bool inputIsStock = params.zeroForOne ? !info.tokenIsZero : info.tokenIsZero;
        if (inputIsStock) return (IHooks.afterSwap.selector, 0); // buy: fee already taken in beforeSwap

        // Sell: output is stock (the unspecified currency). Fee = stockOut * bps.
        int128 stockDelta = info.tokenIsZero ? delta.amount1() : delta.amount0();
        if (stockDelta <= 0) return (IHooks.afterSwap.selector, 0);
        uint256 stockOut = uint256(uint128(stockDelta));
        uint256 fee = FixedPointMathLib.mulDivUp(stockOut, info.feeBps, Constants.BPS);
        if (fee == 0) return (IHooks.afterSwap.selector, 0);

        Currency stockCurrency = info.tokenIsZero ? key.currency1 : key.currency0;
        poolManager.take(stockCurrency, feeVault, fee);
        _notify(info.token, info.stock, sender, fee);

        return (IHooks.afterSwap.selector, int128(int256(fee)));
    }

    function _notify(
        address token,
        address,
        /*stock*/
        address payer,
        uint256 fee
    )
        internal
    {
        uint256 plat = (fee * Constants.PLATFORM_SHARE_BPS) / Constants.BPS;
        ICOURFeeVault(feeVault).notify(token, fee);
        emit Events.FeeTaken(token, payer, fee, fee - plat, plat);
    }

    // --------------------------------------------------------------- unused hook stubs

    function afterInitialize(address, PoolKey calldata, uint160, int24) external pure returns (bytes4) {
        revert Errors.OnlyHook();
    }

    function beforeAddLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        revert Errors.OnlyHook();
    }

    function afterAddLiquidity(
        address,
        PoolKey calldata,
        ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external pure returns (bytes4, BalanceDelta) {
        revert Errors.OnlyHook();
    }

    function beforeRemoveLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        revert Errors.OnlyHook();
    }

    function afterRemoveLiquidity(
        address,
        PoolKey calldata,
        ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external pure returns (bytes4, BalanceDelta) {
        revert Errors.OnlyHook();
    }

    function beforeDonate(address, PoolKey calldata, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        revert Errors.OnlyHook();
    }

    function afterDonate(address, PoolKey calldata, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        revert Errors.OnlyHook();
    }

    // --------------------------------------------------------------- TWAP accumulator

    function _updateObs(PoolId id) internal {
        Obs storage o = _obs[id];
        uint32 nowTs = uint32(block.timestamp);
        if (nowTs > o.lastTs) {
            o.cum += int56(o.lastTick) * int56(uint56(nowTs - o.lastTs));
            o.lastTs = nowTs;
            if (nowTs - o.anchorTs >= Constants.HOOK_TWAP_WINDOW) {
                o.prevAnchorTs = o.anchorTs;
                o.prevAnchorCum = o.anchorCum;
                o.anchorTs = nowTs;
                o.anchorCum = o.cum;
            }
        }
        (, int24 tick,,) = poolManager.getSlot0(id);
        o.lastTick = tick;
    }

    /// @inheritdoc ICOURHook
    function consult(bytes32 poolId, uint32) external view returns (int24 arithmeticMeanTick) {
        PoolId id = PoolId.wrap(poolId);
        Obs memory o = _obs[id];
        uint32 nowTs = uint32(block.timestamp);
        int56 cumNow = o.cum + int56(o.lastTick) * int56(uint56(nowTs > o.lastTs ? nowTs - o.lastTs : 0));
        // Reference the oldest anchor that is at least ~window old, else the current anchor.
        uint32 refTs = o.prevAnchorTs != 0 ? o.prevAnchorTs : o.anchorTs;
        int56 refCum = o.prevAnchorTs != 0 ? o.prevAnchorCum : o.anchorCum;
        uint32 span = nowTs > refTs ? nowTs - refTs : 0;
        if (span == 0) return o.lastTick;
        arithmeticMeanTick = int24((cumNow - refCum) / int56(uint56(span)));
    }

    /// @inheritdoc ICOURHook
    function priceInfo(address token) external view returns (uint256 spotX18, uint256 twapX18) {
        PoolId id = PoolId.wrap(factory.poolIdOf(token));
        PoolInfo memory info = _pool[id];
        if (!info.set) revert Errors.BadPoolKey();
        (uint160 sqrtP,,,) = poolManager.getSlot0(id);
        spotX18 = _spotX18(sqrtP, info.tokenIsZero);

        Obs memory o = _obs[id];
        uint32 nowTs = uint32(block.timestamp);
        int56 cumNow = o.cum + int56(o.lastTick) * int56(uint56(nowTs > o.lastTs ? nowTs - o.lastTs : 0));
        uint32 refTs = o.prevAnchorTs != 0 ? o.prevAnchorTs : o.anchorTs;
        int56 refCum = o.prevAnchorTs != 0 ? o.prevAnchorCum : o.anchorCum;
        uint32 span = nowTs > refTs ? nowTs - refTs : 0;
        int24 meanTick = span == 0 ? o.lastTick : int24((cumNow - refCum) / int56(uint56(span)));
        twapX18 = _spotX18(TickMath.getSqrtPriceAtTick(meanTick), info.tokenIsZero);
    }

    /// @inheritdoc ICOURHook
    function twapWindowFull(address token) external view returns (bool) {
        PoolId id = PoolId.wrap(factory.poolIdOf(token));
        if (!_pool[id].set) return false;
        Obs memory o = _obs[id];
        uint32 nowTs = uint32(block.timestamp);
        // Reference the oldest anchor the TWAP integrates from (same selection as priceInfo/consult). The
        // window is "full" once that anchor is at least HOOK_TWAP_WINDOW seconds old.
        uint32 refTs = o.prevAnchorTs != 0 ? o.prevAnchorTs : o.anchorTs;
        if (refTs == 0) return false;
        uint32 span = nowTs > refTs ? nowTs - refTs : 0;
        return span >= Constants.HOOK_TWAP_WINDOW;
    }

    /// @inheritdoc ICOURHook
    function poolStockReserve(
        address token,
        address /*stock*/
    )
        external
        view
        returns (uint256)
    {
        PoolId id = PoolId.wrap(factory.poolIdOf(token));
        PoolInfo memory info = _pool[id];
        if (!info.set) return 0;
        (uint160 sqrtP,,,) = poolManager.getSlot0(id);
        uint128 L = poolManager.getLiquidity(id);
        if (L == 0) return 0;

        // forge-lint: disable-next-line(divide-before-multiply)
        int24 minT = (TickMath.MIN_TICK / Constants.POOL_TICK_SPACING) * Constants.POOL_TICK_SPACING;
        // forge-lint: disable-next-line(divide-before-multiply)
        int24 maxT = (TickMath.MAX_TICK / Constants.POOL_TICK_SPACING) * Constants.POOL_TICK_SPACING;
        uint160 sqrtA = TickMath.getSqrtPriceAtTick(minT);
        uint160 sqrtB = TickMath.getSqrtPriceAtTick(maxT);

        bool stockIsZero = !info.tokenIsZero;
        if (stockIsZero) {
            // currency0 reserve
            return SqrtPriceMath.getAmount0Delta(sqrtP, sqrtB, L, false);
        } else {
            // currency1 reserve
            return SqrtPriceMath.getAmount1Delta(sqrtA, sqrtP, L, false);
        }
        // `stock` arg kept for interface symmetry; pool identity already fixes the stock currency.
    }

    /// @dev stock-per-token price (1e18) from a sqrtPriceX96, respecting token ordering. 512-bit safe.
    function _spotX18(uint160 sqrtP, bool tokenIsZero) internal pure returns (uint256) {
        if (tokenIsZero) {
            // token = currency0 => price(1/0) = stock per token = sqrtP^2 / 2^192
            uint256 half = FixedPointMathLib.fullMulDiv(uint256(sqrtP), uint256(sqrtP), 1 << 96);
            return FixedPointMathLib.fullMulDiv(half, Constants.PRICE_PRECISION, 1 << 96);
        } else {
            // token = currency1 => stock per token = 1 / price(1/0) = 2^192 / sqrtP^2
            uint256 a = FixedPointMathLib.fullMulDiv(Constants.PRICE_PRECISION, 1 << 96, sqrtP);
            return FixedPointMathLib.fullMulDiv(a, 1 << 96, sqrtP);
        }
    }
}
