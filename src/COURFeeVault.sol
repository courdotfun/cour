// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {PoolManagerSwapper} from "./libraries/PoolManagerSwapper.sol";
import {ICOURFeeVault} from "./interfaces/ICOURFeeVault.sol";
import {ICOURFactory} from "./interfaces/ICOURFactory.sol";
import {ICOURCurve} from "./interfaces/ICOURCurve.sol";
import {ICOURPriceReader} from "./interfaces/ICOURPriceReader.sol";
import {ICOURHook} from "./interfaces/ICOURHook.sol";
import {CreatorMode} from "./types/CreatorMode.sol";
import {Constants} from "./libraries/Constants.sol";
import {Errors} from "./libraries/Errors.sol";
import {Events} from "./libraries/Events.sol";
import {PoolKeyLib} from "./libraries/PoolKeyLib.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";

/// @title COURFeeVault
/// @notice Custodies and routes the creator fee (always taken in the stock token) for every launched
///         token, per the immutable 80% creator-side / 20% platform split and the per-token creator mode.
/// @dev Resilient to a paused stock token: a failed stock transfer reverts only that claim; accrual
///      bookkeeping (notify) never moves stock and so never corrupts. Buyback funds can only ever be
///      spent buying that token. Admin can never touch another party's owed balance.
contract COURFeeVault is ICOURFeeVault, Ownable2Step, ReentrancyGuardTransient, PoolManagerSwapper {
    using SafeERC20 for IERC20;

    struct TokenData {
        address stock;
        address creator;
        address curve;
        address feeRecipient;
        address pendingRecipient;
        CreatorMode mode;
        uint8 stockDecimals;
        bool registered;
        uint256 creatorOwed;
        uint256 buybackOwed;
        uint256 accPerShare; // scaled 1e36
        uint256 eligibleSupply;
    }

    ICOURFactory public factory;
    address public hook;
    address public router;
    address public override treasury;
    ICOURPriceReader public priceReader;
    bool internal _wired;

    uint256 public minBuybackUsd = Constants.DEFAULT_MIN_BUYBACK_USD;

    mapping(address => TokenData) internal _td;
    mapping(address => uint256) public override platformOwed; // stock => amount
    mapping(address => mapping(address => uint256)) internal _debt; // token => holder => balance*acc/1e36
    mapping(address => mapping(address => uint256)) internal _pending; // token => holder => stock owed

    constructor(address owner_, address treasury_, address poolManager_)
        Ownable(owner_)
        PoolManagerSwapper(poolManager_)
    {
        if (treasury_ == address(0)) revert Errors.ZeroAddress();
        treasury = treasury_;
    }

    // --------------------------------------------------------------- wiring / admin

    /// @notice One-time wiring of factory/hook/router/priceReader (they deploy after the vault).
    function wire(address factory_, address hook_, address router_, address priceReader_) external onlyOwner {
        if (_wired) revert Errors.AlreadyInitialized();
        if (factory_ == address(0) || hook_ == address(0) || priceReader_ == address(0)) revert Errors.ZeroAddress();
        factory = ICOURFactory(factory_);
        hook = hook_;
        router = router_;
        priceReader = ICOURPriceReader(priceReader_);
        _wired = true;
    }

    function setTreasury(address t) external onlyOwner {
        if (t == address(0)) revert Errors.ZeroAddress();
        treasury = t;
        emit Events.TreasurySet(t);
    }

    function setMinBuybackUsd(uint256 v) external onlyOwner {
        minBuybackUsd = v;
    }

    // --------------------------------------------------------------- registration

    /// @inheritdoc ICOURFeeVault
    function registerToken(
        address token,
        address stock,
        address creator,
        uint16, /* creatorFeeBps (enforced by factory; fee amounts arrive pre-computed via notify) */
        CreatorMode mode,
        address feeRecipient
    ) external {
        if (msg.sender != address(factory)) revert Errors.OnlyFactory();
        TokenData storage t = _td[token];
        if (t.registered) revert Errors.AlreadyInitialized();
        t.registered = true;
        t.stock = stock;
        t.creator = creator;
        t.curve = factory.curveOf(token);
        t.feeRecipient = feeRecipient == address(0) ? creator : feeRecipient;
        t.mode = mode;
        t.stockDecimals = IERC20Metadata(stock).decimals();
    }

    // --------------------------------------------------------------- notify (accrual)

    /// @inheritdoc ICOURFeeVault
    /// @dev Caller (hook or curve) has already transferred `amount` stock to this vault.
    function notify(address token, uint256 amount) external {
        TokenData storage t = _td[token];
        if (!t.registered) revert Errors.OnlyHookOrCurve();
        if (msg.sender != hook && msg.sender != t.curve) revert Errors.OnlyHookOrCurve();
        if (amount == 0) return;

        uint256 plat = (amount * Constants.PLATFORM_SHARE_BPS) / Constants.BPS; // floor(20%)
        uint256 creatorSide = amount - plat; // remainder (>= 80%)
        platformOwed[t.stock] += plat;

        if (t.mode == CreatorMode.CREATOR) {
            t.creatorOwed += creatorSide;
        } else if (t.mode == CreatorMode.HOLDERS) {
            if (t.eligibleSupply > 0) {
                t.accPerShare += (creatorSide * Constants.ACC_PRECISION) / t.eligibleSupply;
            } else {
                // No eligible holders yet: fall back to the creator bucket (claimable by feeRecipient).
                t.creatorOwed += creatorSide;
            }
        } else {
            // BUYBACK / BUYBACK_BURN
            t.buybackOwed += creatorSide;
        }

        emit Events.FeeTaken(token, msg.sender, amount, creatorSide, plat);
    }

    // --------------------------------------------------------------- holder accounting

    /// @inheritdoc ICOURFeeVault
    function beforeBalanceChange(address from, address to, uint256 amount) external {
        address token = msg.sender; // the token reports about itself
        TokenData storage t = _td[token];
        if (!t.registered || t.mode != CreatorMode.HOLDERS) return;

        uint256 acc = t.accPerShare;
        bool fe = _eligible(t, from);
        bool te = _eligible(t, to);

        if (fe) _settleToNewBalance(token, from, IERC20(token).balanceOf(from) - amount, acc);
        if (te) _settleToNewBalance(token, to, IERC20(token).balanceOf(to) + amount, acc);

        if (fe && !te) t.eligibleSupply -= amount;
        else if (!fe && te) t.eligibleSupply += amount;
    }

    /// @dev Settle `holder` pending using its OLD balance, then set debt to its NEW balance.
    function _settleToNewBalance(address token, address holder, uint256 newBal, uint256 acc) internal {
        uint256 oldBal = IERC20(token).balanceOf(holder);
        uint256 accumulated = (oldBal * acc) / Constants.ACC_PRECISION;
        uint256 d = _debt[token][holder];
        if (accumulated > d) _pending[token][holder] += accumulated - d;
        _debt[token][holder] = (newBal * acc) / Constants.ACC_PRECISION;
    }

    function _accrue(address token, address holder) internal {
        uint256 acc = _td[token].accPerShare;
        uint256 bal = IERC20(token).balanceOf(holder);
        uint256 accumulated = (bal * acc) / Constants.ACC_PRECISION;
        uint256 d = _debt[token][holder];
        if (accumulated > d) _pending[token][holder] += accumulated - d;
        _debt[token][holder] = accumulated;
    }

    function _eligible(TokenData storage t, address a) internal view returns (bool) {
        return a != address(0) && a != Constants.DEAD && a != address(this) && a != router
            && a != address(_pm) && a != t.curve;
    }

    // --------------------------------------------------------------- claims

    /// @inheritdoc ICOURFeeVault
    function claim(address token) external nonReentrant returns (uint256 amount) {
        TokenData storage t = _td[token];
        if (msg.sender != t.feeRecipient) revert Errors.OnlyCreator();
        amount = t.creatorOwed;
        if (amount == 0) return 0;
        t.creatorOwed = 0;
        IERC20(t.stock).safeTransfer(t.feeRecipient, amount);
        emit Events.FeeClaimed(token, t.feeRecipient, amount);
    }

    /// @inheritdoc ICOURFeeVault
    function claimHolder(address token) external nonReentrant returns (uint256 amount) {
        TokenData storage t = _td[token];
        if (t.mode != CreatorMode.HOLDERS) revert Errors.WrongMode();
        _accrue(token, msg.sender);
        amount = _pending[token][msg.sender];
        if (amount == 0) return 0;
        _pending[token][msg.sender] = 0;
        IERC20(t.stock).safeTransfer(msg.sender, amount);
        emit Events.HolderClaimed(token, msg.sender, amount);
    }

    /// @inheritdoc ICOURFeeVault
    function claimPlatform(address stock) external nonReentrant returns (uint256 amount) {
        amount = platformOwed[stock];
        if (amount == 0) return 0;
        platformOwed[stock] = 0;
        IERC20(stock).safeTransfer(treasury, amount);
        emit Events.PlatformClaimed(stock, treasury, amount);
    }

    // --------------------------------------------------------------- recipient transfer

    /// @inheritdoc ICOURFeeVault
    function setFeeRecipient(address token, address newRecipient) external {
        TokenData storage t = _td[token];
        if (msg.sender != t.feeRecipient) revert Errors.OnlyCreator();
        if (newRecipient == address(0)) revert Errors.ZeroAddress();
        t.pendingRecipient = newRecipient;
    }

    /// @inheritdoc ICOURFeeVault
    function acceptFeeRecipient(address token) external {
        TokenData storage t = _td[token];
        if (msg.sender != t.pendingRecipient) revert Errors.OnlyCreator();
        address old = t.feeRecipient;
        t.feeRecipient = msg.sender;
        t.pendingRecipient = address(0);
        emit Events.FeeRecipientChanged(token, old, msg.sender);
    }

    // --------------------------------------------------------------- buyback

    /// @inheritdoc ICOURFeeVault
    function executeBuyback(address token, uint256 maxStockIn, uint256 minTokensOut)
        external
        nonReentrant
        returns (uint256 stockIn, uint256 tokensOut)
    {
        TokenData storage t = _td[token];
        if (t.mode != CreatorMode.BUYBACK && t.mode != CreatorMode.BUYBACK_BURN) revert Errors.WrongMode();
        if (msg.sender != t.feeRecipient) revert Errors.OnlyCreator();

        uint256 owed = t.buybackOwed;
        stockIn = maxStockIn < owed ? maxStockIn : owed;
        if (stockIn == 0) revert Errors.BuybackTooSmall();

        // Min USD notional guard.
        (uint256 priceX18,) = priceReader.stockUsd(t.stock);
        uint256 usd = (stockIn * priceX18) / Constants.PRICE_PRECISION / (10 ** uint256(t.stockDecimals));
        if (usd < minBuybackUsd) revert Errors.BuybackTooSmall();

        address recipient = t.mode == CreatorMode.BUYBACK ? t.feeRecipient : Constants.DEAD;
        bool burned = t.mode == CreatorMode.BUYBACK_BURN;

        if (!ICOURCurve(t.curve).graduated()) {
            // Pre-graduation: buy on the curve (no fee, since msg.sender == vault). Cap 2% of curve stock.
            uint256 poolStock = IERC20(t.stock).balanceOf(t.curve);
            if (stockIn > (poolStock * Constants.BUYBACK_MAX_POOL_BPS) / Constants.BPS && poolStock > 0) {
                revert Errors.BuybackTooLarge();
            }
            IERC20(t.stock).forceApprove(t.curve, stockIn);
            (tokensOut, stockIn) = ICOURCurve(t.curve).buy(stockIn, minTokensOut, recipient, block.timestamp);
            IERC20(t.stock).forceApprove(t.curve, 0);
        } else {
            // Post-graduation: swap on the v4 pool. Deviation + 2%-of-reserve guards.
            _checkDeviation(token);
            uint256 reserve = _poolStockReserve(token, t.stock);
            if (reserve > 0 && stockIn > (reserve * Constants.BUYBACK_MAX_POOL_BPS) / Constants.BPS) {
                revert Errors.BuybackTooLarge();
            }
            (PoolKey memory key, bool tokenIsZero) = PoolKeyLib.build(token, t.stock, hook);
            bool zeroForOne = !tokenIsZero; // paying stock (currency0 iff stock < token)
            tokensOut = _swapExactInput(key, zeroForOne, stockIn, recipient);
            if (tokensOut < minTokensOut) revert Errors.Slippage();
        }

        t.buybackOwed = owed - stockIn;
        emit Events.BuybackExecuted(token, stockIn, tokensOut, burned);
    }

    function _checkDeviation(address token) internal view {
        (uint256 spotX18, uint256 twapX18) = ICOURHook(hook).priceInfo(token);
        if (twapX18 == 0) revert Errors.TwapNotReady();
        uint256 diff = spotX18 > twapX18 ? spotX18 - twapX18 : twapX18 - spotX18;
        if (diff * Constants.BPS > twapX18 * Constants.BUYBACK_MAX_DEVIATION_BPS) revert Errors.PriceDeviation();
    }

    /// @dev Best-effort stock-side reserve of the graduated full-range pool (see RISKS.md).
    function _poolStockReserve(address token, address stock) internal view returns (uint256) {
        return ICOURHook(hook).poolStockReserve(token, stock);
    }

    // --------------------------------------------------------------- views

    function creatorOwed(address token) external view returns (uint256) {
        return _td[token].creatorOwed;
    }

    function buybackOwed(address token) external view returns (uint256) {
        return _td[token].buybackOwed;
    }

    function feeRecipient(address token) external view returns (address) {
        return _td[token].feeRecipient;
    }

    function eligibleSupply(address token) external view returns (uint256) {
        return _td[token].eligibleSupply;
    }

    function modeOf(address token) external view returns (CreatorMode) {
        return _td[token].mode;
    }

    /// @inheritdoc ICOURFeeVault
    function pendingHolder(address token, address holder) external view returns (uint256) {
        TokenData storage t = _td[token];
        if (t.mode != CreatorMode.HOLDERS) return 0;
        uint256 accumulated = (IERC20(token).balanceOf(holder) * t.accPerShare) / Constants.ACC_PRECISION;
        uint256 d = _debt[token][holder];
        uint256 extra = accumulated > d ? accumulated - d : 0;
        return _pending[token][holder] + extra;
    }
}
