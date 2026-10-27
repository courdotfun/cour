// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuardTransient } from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import { FixedPointMathLib } from "solady/utils/FixedPointMathLib.sol";

import { ICOURCurve } from "./interfaces/ICOURCurve.sol";
import { ICOURFactory } from "./interfaces/ICOURFactory.sol";
import { ICOURFeeVault } from "./interfaces/ICOURFeeVault.sol";
import { Constants } from "./libraries/Constants.sol";
import { CurveMath } from "./libraries/CurveMath.sol";
import { Errors } from "./libraries/Errors.sol";
import { Events } from "./libraries/Events.sol";
import { LaunchTax } from "./libraries/LaunchTax.sol";
import { CreatorMode } from "./types/CreatorMode.sol";
import { TokenConfig } from "./types/TokenConfig.sol";

/// @title COURCurve
/// @notice Virtual constant-product bonding curve, one EIP-1167 clone per token, priced in the stock
///         token. Holds the entire token supply and the real stock raised. Graduates in-tx at sell-out.
/// @dev `factory` and `feeVault` are implementation immutables (identical for all clones). Per-token
///      state lives in storage, set once by `initialize`. All rounding favours the curve (§CurveMath).
contract COURCurve is ICOURCurve, ReentrancyGuardTransient {
    using SafeERC20 for IERC20;

    address public immutable factoryAddr;
    address public immutable feeVaultAddr;

    // per-clone storage
    bool internal _initialized;
    bool public graduated;
    address public token;
    address public stock;
    address public creator;
    uint16 internal _feeBps;
    uint64 internal _launchedAt;
    uint8 internal _stockDecimals;
    CreatorMode internal _mode;
    uint256 internal _vS;
    uint256 internal _vT;
    uint256 internal _k;
    uint256 internal _vTStop;
    uint256 internal _vS0;
    uint256 internal _vT0;

    constructor(address factory_, address feeVault_) {
        factoryAddr = factory_;
        feeVaultAddr = feeVault_;
        _initialized = true; // lock the implementation; clones start fresh
    }

    // --------------------------------------------------------------- init

    /// @inheritdoc ICOURCurve
    function initialize(TokenConfig calldata cfg) external {
        if (msg.sender != factoryAddr) revert Errors.OnlyFactory();
        if (_initialized) revert Errors.AlreadyInitialized();
        _initialized = true;
        token = cfg.token;
        stock = cfg.stock;
        creator = cfg.creator;
        _feeBps = cfg.creatorFeeBps;
        _launchedAt = cfg.launchedAt;
        _stockDecimals = cfg.stockDecimals;
        _mode = cfg.mode;
        _vS = cfg.vS0;
        _vT = cfg.vT0;
        _vS0 = cfg.vS0;
        _vT0 = cfg.vT0;
        _k = cfg.k;
        _vTStop = cfg.vTStop;
    }

    // --------------------------------------------------------------- trading

    /// @inheritdoc ICOURCurve
    function buy(uint256 stockIn, uint256 minTokensOut, address to, uint256 deadline)
        external
        nonReentrant
        returns (uint256 tokensOut, uint256 stockUsed)
    {
        bool privileged = msg.sender == feeVaultAddr; // buyback: no fee, no tax
        return _buy(stockIn, minTokensOut, to, deadline, !privileged, !privileged, true);
    }

    /// @inheritdoc ICOURCurve
    function initialBuy(uint256 stockIn, uint256 minTokensOut, address to)
        external
        nonReentrant
        returns (uint256 tokensOut, uint256 stockUsed)
    {
        if (msg.sender != factoryAddr) revert Errors.OnlyFactory();
        // Fee applies; launch tax does NOT (atomic creator buy inside createToken). Must not graduate.
        return _buy(stockIn, minTokensOut, to, block.timestamp, true, false, false);
    }

    function _buy(
        uint256 gross,
        uint256 minTokensOut,
        address to,
        uint256 deadline,
        bool chargeFee,
        bool chargeTax,
        bool allowGraduation
    ) internal returns (uint256 tokensOut, uint256 stockUsed) {
        if (block.timestamp > deadline) revert Errors.Expired();
        if (graduated) revert Errors.Graduated();
        if (gross == 0) revert Errors.ZeroAmount();

        uint256 tax = chargeTax ? LaunchTax.taxOn(gross, _launchedAt, block.timestamp) : 0;
        uint256 fee = chargeFee ? FixedPointMathLib.mulDivUp(gross, _feeBps, Constants.BPS) : 0;
        // In the first launch second the 99% tax + fee can exceed the gross; reject cleanly (anti-snipe).
        if (fee + tax >= gross) revert Errors.ZeroAmount();
        uint256 net = gross - fee - tax;

        CurveMath.BuyResult memory r = CurveMath.buy(_vS, _vT, _k, _vTStop, net);
        if (r.graduates && !allowGraduation) revert Errors.InitialBuyTooLarge();
        tokensOut = r.tokensOut;
        if (tokensOut < minTokensOut) revert Errors.Slippage();

        uint256 feeUsed = fee;
        uint256 taxUsed = tax;
        uint256 refund = 0;
        if (r.graduates) {
            // Only charge fee/tax on the portion of net actually consumed; refund the remainder.
            feeUsed = FixedPointMathLib.mulDivUp(fee, r.stockUsed, net);
            taxUsed = FixedPointMathLib.mulDivUp(tax, r.stockUsed, net);
            refund = gross - r.stockUsed - feeUsed - taxUsed;
        }
        stockUsed = r.stockUsed + feeUsed + taxUsed; // gross actually spent

        _vS = r.newVS;
        _vT = r.newVT;

        // Pull gross stock in from the payer.
        IERC20(stock).safeTransferFrom(msg.sender, address(this), gross);
        if (refund > 0) IERC20(stock).safeTransfer(msg.sender, refund);

        // Deliver tokens first so HOLDERS-mode buyers are eligible before the fee notify.
        IERC20(token).safeTransfer(to, tokensOut);

        uint256 feeTotal = feeUsed + taxUsed;
        if (feeTotal > 0) {
            IERC20(stock).safeTransfer(feeVaultAddr, feeTotal);
            ICOURFeeVault(feeVaultAddr).notify(token, feeTotal);
        }

        emit Events.CurveTrade(token, to, true, stockUsed, tokensOut, feeUsed, taxUsed, _vS, _vT);

        if (r.graduates) _graduate();
    }

    /// @inheritdoc ICOURCurve
    function sell(uint256 tokensIn, uint256 minStockOut, address to, uint256 deadline)
        external
        nonReentrant
        returns (uint256 stockOut)
    {
        if (block.timestamp > deadline) revert Errors.Expired();
        if (graduated) revert Errors.Graduated();
        if (tokensIn == 0) revert Errors.ZeroAmount();

        bool chargeFee = msg.sender != feeVaultAddr;

        (uint256 stockOutGross, uint256 newVS, uint256 newVT) = CurveMath.sell(_vS, _vT, _k, _vT0, tokensIn);
        uint256 fee = chargeFee ? FixedPointMathLib.mulDivUp(stockOutGross, _feeBps, Constants.BPS) : 0;
        stockOut = stockOutGross - fee;
        if (stockOut < minStockOut) revert Errors.Slippage();

        _vS = newVS;
        _vT = newVT;

        // Pull tokens in, pay stock out.
        IERC20(token).safeTransferFrom(msg.sender, address(this), tokensIn);
        if (fee > 0) {
            IERC20(stock).safeTransfer(feeVaultAddr, fee);
            ICOURFeeVault(feeVaultAddr).notify(token, fee);
        }
        IERC20(stock).safeTransfer(to, stockOut);

        emit Events.CurveTrade(token, to, false, stockOutGross, tokensIn, fee, 0, _vS, _vT);
    }

    // --------------------------------------------------------------- graduation

    function _graduate() internal {
        graduated = true;
        uint256 stockRaised = IERC20(stock).balanceOf(address(this)); // ~ vS - vS0 (real stock)
        uint256 tokenLeftover = IERC20(token).balanceOf(address(this)); // unsold tokens for the pool
        IERC20(stock).forceApprove(factoryAddr, stockRaised);
        IERC20(token).forceApprove(factoryAddr, tokenLeftover);
        ICOURFactory(factoryAddr).graduate(token);
    }

    // --------------------------------------------------------------- quotes

    /// @inheritdoc ICOURCurve
    function quoteBuy(uint256 stockIn) external view returns (uint256 tokensOut, uint256 fee, uint256 tax) {
        tax = LaunchTax.taxOn(stockIn, _launchedAt, block.timestamp);
        fee = FixedPointMathLib.mulDivUp(stockIn, _feeBps, Constants.BPS);
        uint256 net = stockIn - fee - tax;
        CurveMath.BuyResult memory r = CurveMath.buy(_vS, _vT, _k, _vTStop, net);
        tokensOut = r.tokensOut;
    }

    /// @inheritdoc ICOURCurve
    function quoteSell(uint256 tokensIn) external view returns (uint256 stockOut, uint256 fee) {
        (uint256 gross,,) = CurveMath.sell(_vS, _vT, _k, _vT0, tokensIn);
        fee = FixedPointMathLib.mulDivUp(gross, _feeBps, Constants.BPS);
        stockOut = gross - fee;
    }

    /// @inheritdoc ICOURCurve
    function quoteStockForTokens(uint256 tokensWanted) external view returns (uint256 stockIn) {
        // net stock to move vT down by tokensWanted: newVT = vT - tokensWanted; net = k/newVT - vS.
        uint256 newVT = _vT - tokensWanted;
        uint256 netNeeded = FixedPointMathLib.divUp(_k, newVT) - _vS;
        // gross = net / (1 - feeRate) (ignoring tax; quote is indicative). Round up.
        stockIn = FixedPointMathLib.mulDivUp(netNeeded, Constants.BPS, Constants.BPS - _feeBps);
    }

    // --------------------------------------------------------------- views

    /// @inheritdoc ICOURCurve
    function progressBps() external view returns (uint256) {
        uint256 soldAtStop = _vT0 - _vTStop;
        if (soldAtStop == 0) return 0;
        uint256 sold = _vT0 - _vT;
        uint256 bps = (sold * Constants.BPS) / soldAtStop;
        return bps > Constants.BPS ? Constants.BPS : bps;
    }

    function vS() external view returns (uint256) {
        return _vS;
    }

    function vT() external view returns (uint256) {
        return _vT;
    }

    /// @inheritdoc ICOURCurve
    function config() external view returns (TokenConfig memory c) {
        c = TokenConfig({
            token: token,
            stock: stock,
            creator: creator,
            creatorFeeBps: _feeBps,
            mode: _mode,
            stockDecimals: _stockDecimals,
            launchedAt: _launchedAt,
            vS0: _vS0,
            vT0: _vT0,
            k: _k,
            vTStop: _vTStop
        });
    }
}
