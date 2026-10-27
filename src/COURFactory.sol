// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { Ownable, Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuardTransient } from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import { FixedPointMathLib } from "solady/utils/FixedPointMathLib.sol";
import { LibClone } from "solady/utils/LibClone.sol";

import { IPoolManager } from "v4-core/interfaces/IPoolManager.sol";
import { IUnlockCallback } from "v4-core/interfaces/callback/IUnlockCallback.sol";
import { TickMath } from "v4-core/libraries/TickMath.sol";
import { BalanceDelta } from "v4-core/types/BalanceDelta.sol";
import { Currency } from "v4-core/types/Currency.sol";
import { PoolId, PoolIdLibrary } from "v4-core/types/PoolId.sol";
import { PoolKey } from "v4-core/types/PoolKey.sol";
import { ModifyLiquidityParams } from "v4-core/types/PoolOperation.sol";
import { LiquidityAmounts } from "v4-periphery/src/libraries/LiquidityAmounts.sol";

import { COURToken } from "./COURToken.sol";
import { ICOURCurve } from "./interfaces/ICOURCurve.sol";
import { ICOURFactory } from "./interfaces/ICOURFactory.sol";
import { ICOURFeeVault } from "./interfaces/ICOURFeeVault.sol";
import { ICOURPriceReader } from "./interfaces/ICOURPriceReader.sol";
import { Constants } from "./libraries/Constants.sol";
import { CurveMath } from "./libraries/CurveMath.sol";
import { Errors } from "./libraries/Errors.sol";
import { Events } from "./libraries/Events.sol";
import { PoolKeyLib } from "./libraries/PoolKeyLib.sol";
import { CREATOR_MODE_MAX, CreatorMode } from "./types/CreatorMode.sol";
import { TokenConfig } from "./types/TokenConfig.sol";

/// @title COURFactory
/// @notice Launches COUR tokens on the bonding curve and graduates them into Uniswap v4 pools with the
///         COUR hook. Admin (Ownable2Step, later a 48h Timelock behind a multisig) can only gate FUTURE
///         launches; it can never touch an existing token's fee, mode, recipient, balances, or trading.
contract COURFactory is ICOURFactory, Ownable2Step, ReentrancyGuardTransient, IUnlockCallback {
    using SafeERC20 for IERC20;
    using PoolIdLibrary for PoolKey;

    IPoolManager public immutable poolManagerC;
    address public immutable positionManager; // reserved for future use; graduation uses modifyLiquidity directly
    address public immutable hookC;
    ICOURFeeVault public immutable feeVaultC;
    ICOURPriceReader public immutable priceReaderC;
    address public immutable curveImpl;

    // launch params (affect FUTURE launches only)
    uint256 public startMcUsd = Constants.START_MC_USD;
    uint256 public gradMcUsd = Constants.GRAD_MC_USD;
    uint256 public minRefLiqUsd = Constants.DEFAULT_MIN_REF_LIQ_USD;
    uint256 public launchFee = Constants.LAUNCH_FEE;
    bool public launchesPaused;

    mapping(address => bool) public override stockAllowed;
    mapping(address => bool) public override isCOURToken;
    mapping(address => address) public override curveOf;
    mapping(address => TokenConfig) internal _config;
    mapping(address => bytes32) internal _poolId;

    struct GradCallback {
        PoolKey key;
        int24 tickLower;
        int24 tickUpper;
        int256 liquidity;
    }

    constructor(
        address owner_,
        address poolManager_,
        address positionManager_,
        address hook_,
        address feeVault_,
        address priceReader_,
        address curveImpl_
    ) Ownable(owner_) {
        if (
            poolManager_ == address(0) || hook_ == address(0) || feeVault_ == address(0) || priceReader_ == address(0)
                || curveImpl_ == address(0)
        ) revert Errors.ZeroAddress();
        poolManagerC = IPoolManager(poolManager_);
        positionManager = positionManager_;
        hookC = hook_;
        feeVaultC = ICOURFeeVault(feeVault_);
        priceReaderC = ICOURPriceReader(priceReader_);
        curveImpl = curveImpl_;
    }

    // --------------------------------------------------------------- launch

    /// @inheritdoc ICOURFactory
    function createToken(CreateParams calldata p) external payable nonReentrant returns (address token, address curve) {
        if (msg.value != launchFee) revert Errors.WrongLaunchFee();
        if (launchesPaused) revert Errors.LaunchesPaused();
        if (!stockAllowed[p.stock]) revert Errors.StockNotAllowed();
        if (p.creatorFeeBps < Constants.CREATOR_FEE_MIN_BPS || p.creatorFeeBps > Constants.CREATOR_FEE_MAX_BPS) {
            revert Errors.FeeOutOfRange();
        }
        if (p.creatorMode > CREATOR_MODE_MAX) revert Errors.WrongMode();
        if (priceReaderC.refLiquidityUsd(p.stock) < minRefLiqUsd) revert Errors.ThinReferencePool();

        (uint256 priceX18,) = priceReaderC.stockUsd(p.stock);
        uint8 stockDec = IERC20Metadata(p.stock).decimals();
        CreatorMode mode = CreatorMode(p.creatorMode);
        address feeRecipient = p.feeRecipient == address(0) ? msg.sender : p.feeRecipient;

        // Deploy the curve clone first (its address is needed by the token).
        curve = LibClone.clone(curveImpl);

        // Deploy the token (CREATE2, deterministic via salt). HOLDERS mode wires the dividend vault.
        address holderRewards = mode == CreatorMode.HOLDERS ? address(feeVaultC) : address(0);
        token = address(
            new COURToken{ salt: p.salt }(p.name, p.symbol, p.metadataURI, curve, p.stock, msg.sender, holderRewards)
        );

        CurveMath.LaunchParams memory lp = CurveMath.computeLaunchParams(priceX18, stockDec, startMcUsd, gradMcUsd);
        TokenConfig memory cfg = TokenConfig({
            token: token,
            stock: p.stock,
            creator: msg.sender,
            creatorFeeBps: p.creatorFeeBps,
            mode: mode,
            stockDecimals: stockDec,
            launchedAt: uint64(block.timestamp),
            vS0: lp.vS0,
            vT0: lp.vT0,
            k: lp.k,
            vTStop: lp.vTStop
        });

        isCOURToken[token] = true;
        curveOf[token] = curve;
        _config[token] = cfg;
        (PoolKey memory key,) = PoolKeyLib.build(token, p.stock, hookC);
        _poolId[token] = PoolId.unwrap(key.toId());

        ICOURCurve(curve).initialize(cfg);
        feeVaultC.registerToken(token, p.stock, msg.sender, p.creatorFeeBps, mode, feeRecipient);

        if (p.initialBuyStock > 0) {
            IERC20(p.stock).safeTransferFrom(msg.sender, address(this), p.initialBuyStock);
            IERC20(p.stock).forceApprove(curve, p.initialBuyStock);
            (uint256 tokensOut, uint256 used) =
                ICOURCurve(curve).initialBuy(p.initialBuyStock, p.minInitialTokens, feeRecipient);
            IERC20(p.stock).forceApprove(curve, 0);
            if (tokensOut > Constants.MAX_INITIAL_BUY_TOKENS) revert Errors.InitialBuyTooLarge();
            // No graduation possible on an initial buy (<=50% supply), so `used` must equal the input.
            if (used != p.initialBuyStock) revert Errors.InitialBuyTooLarge();
        }

        emit Events.TokenLaunched(
            token,
            curve,
            msg.sender,
            p.stock,
            p.creatorFeeBps,
            p.creatorMode,
            feeRecipient,
            CurveMath.priceX18(lp.vS0, lp.vT0),
            p.metadataURI
        );
    }

    // --------------------------------------------------------------- graduation

    /// @inheritdoc ICOURFactory
    function graduate(address token) external nonReentrant {
        if (msg.sender != curveOf[token]) revert Errors.OnlyCurve();
        TokenConfig memory cfg = _config[token];
        address stock = cfg.stock;
        (PoolKey memory key, bool tokenIsZero) = PoolKeyLib.build(token, stock, hookC);

        // Pull the raised stock and the unsold tokens from the curve (it pre-approved us).
        uint256 stockRaised = IERC20(stock).balanceOf(msg.sender);
        uint256 tokenLeftover = IERC20(token).balanceOf(msg.sender);
        IERC20(stock).safeTransferFrom(msg.sender, address(this), stockRaised);
        IERC20(token).safeTransferFrom(msg.sender, address(this), tokenLeftover);

        (uint256 amount0, uint256 amount1) = tokenIsZero ? (tokenLeftover, stockRaised) : (stockRaised, tokenLeftover);

        // Initialize the pool at exactly the reserve ratio (= graduation price).
        uint160 sqrtPriceX96 = uint160(FixedPointMathLib.sqrt(FixedPointMathLib.fullMulDiv(amount1, 1 << 192, amount0)));
        poolManagerC.initialize(key, sqrtPriceX96);

        // Full-range liquidity.
        // forge-lint: disable-next-line(divide-before-multiply)
        int24 tickLower = (TickMath.MIN_TICK / Constants.POOL_TICK_SPACING) * Constants.POOL_TICK_SPACING;
        // forge-lint: disable-next-line(divide-before-multiply)
        int24 tickUpper = (TickMath.MAX_TICK / Constants.POOL_TICK_SPACING) * Constants.POOL_TICK_SPACING;
        uint128 L = LiquidityAmounts.getLiquidityForAmounts(
            sqrtPriceX96,
            TickMath.getSqrtPriceAtTick(tickLower),
            TickMath.getSqrtPriceAtTick(tickUpper),
            amount0,
            amount1
        );

        poolManagerC.unlock(abi.encode(GradCallback(key, tickLower, tickUpper, int256(uint256(L)))));

        // Burn: the liquidity is owned by this factory, which has NO removeLiquidity path -> permanently locked.
        // Sweep dust: tokens -> DEAD, stock -> platform bucket.
        uint256 tokenDust = IERC20(token).balanceOf(address(this));
        uint256 stockDust = IERC20(stock).balanceOf(address(this));
        if (tokenDust > 0) IERC20(token).safeTransfer(Constants.DEAD, tokenDust);
        if (stockDust > 0) {
            IERC20(stock).safeTransfer(address(feeVaultC), stockDust);
            feeVaultC.creditPlatform(stock, stockDust);
        }

        emit Events.Graduated(token, _poolId[token], tokenLeftover - tokenDust, stockRaised - stockDust, 0);
    }

    /// @inheritdoc IUnlockCallback
    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(poolManagerC)) revert Errors.OnlyFactory();
        GradCallback memory g = abi.decode(data, (GradCallback));
        (BalanceDelta delta,) = poolManagerC.modifyLiquidity(
            g.key,
            ModifyLiquidityParams({
                tickLower: g.tickLower, tickUpper: g.tickUpper, liquidityDelta: g.liquidity, salt: bytes32(0)
            }),
            ""
        );
        int128 a0 = delta.amount0();
        int128 a1 = delta.amount1();
        if (a0 < 0) _pay(g.key.currency0, uint256(uint128(-a0)));
        if (a1 < 0) _pay(g.key.currency1, uint256(uint128(-a1)));
        return "";
    }

    function _pay(Currency currency, uint256 amount) private {
        poolManagerC.sync(currency);
        IERC20(Currency.unwrap(currency)).safeTransfer(address(poolManagerC), amount);
        poolManagerC.settle();
    }

    // --------------------------------------------------------------- admin

    /// @inheritdoc ICOURFactory
    function setStock(address stock, bool allowed, address refPool, ICOURPriceReader.RefKind kind) external onlyOwner {
        stockAllowed[stock] = allowed;
        if (allowed && refPool != address(0)) priceReaderC.setRefPool(stock, refPool, kind);
        emit Events.StockSet(stock, allowed, refPool, uint8(kind));
    }

    /// @inheritdoc ICOURFactory
    function setLaunchParams(uint256 startMcUsd_, uint256 gradMcUsd_, uint256 minRefLiqUsd_, uint256 launchFee_)
        external
        onlyOwner
    {
        if (gradMcUsd_ <= startMcUsd_ || startMcUsd_ == 0) revert Errors.FeeOutOfRange();
        startMcUsd = startMcUsd_;
        gradMcUsd = gradMcUsd_;
        minRefLiqUsd = minRefLiqUsd_;
        launchFee = launchFee_;
        emit Events.LaunchParamsSet(startMcUsd_, gradMcUsd_, minRefLiqUsd_, launchFee_);
    }

    /// @inheritdoc ICOURFactory
    function setLaunchesPaused(bool paused) external onlyOwner {
        launchesPaused = paused;
        emit Events.LaunchesPausedSet(paused);
    }

    // --------------------------------------------------------------- views

    function tokenConfig(address token) external view returns (TokenConfig memory) {
        return _config[token];
    }

    function poolIdOf(address token) external view returns (bytes32) {
        return _poolId[token];
    }

    function hook() external view returns (address) {
        return hookC;
    }

    function feeVault() external view returns (address) {
        return address(feeVaultC);
    }

    function priceReader() external view returns (ICOURPriceReader) {
        return priceReaderC;
    }

    function poolManager() external view returns (address) {
        return address(poolManagerC);
    }
}
