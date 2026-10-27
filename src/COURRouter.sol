// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuardTransient } from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";

import { PoolManagerSwapper } from "./libraries/PoolManagerSwapper.sol";
import { PoolKey } from "v4-core/types/PoolKey.sol";

import { ICOURCurve } from "./interfaces/ICOURCurve.sol";
import { ICOURFactory } from "./interfaces/ICOURFactory.sol";
import { IV3SwapRouter, IWETH } from "./interfaces/IExternal.sol";
import { Constants } from "./libraries/Constants.sol";
import { Errors } from "./libraries/Errors.sol";
import { PoolKeyLib } from "./libraries/PoolKeyLib.sol";
import { TokenConfig } from "./types/TokenConfig.sol";

/// @title COURRouter
/// @notice Single convenience entrypoint the frontend targets: buys/sells route to the bonding curve
///         before graduation and to the v4 pool after. Swaps hit the PoolManager directly via `unlock`
///         (never the forked Universal Router). The router custodies no funds between transactions.
contract COURRouter is ReentrancyGuardTransient, PoolManagerSwapper {
    using SafeERC20 for IERC20;

    /// @dev Default v3 fee tier assumed for ETH->stock convenience routing (validate per-stock on fork).
    uint24 public constant DEFAULT_V3_FEE = 3000;

    ICOURFactory public immutable factory;
    IV3SwapRouter public immutable v3Router;
    IWETH public immutable weth;

    constructor(address poolManager_, address factory_, address v3Router_, address weth_)
        PoolManagerSwapper(poolManager_)
    {
        if (factory_ == address(0)) revert Errors.ZeroAddress();
        factory = ICOURFactory(factory_);
        v3Router = IV3SwapRouter(v3Router_);
        weth = IWETH(weth_);
    }

    // --------------------------------------------------------------- buy / sell

    /// @notice Buy `token` with `stockIn` of its stock, routed to curve or pool.
    function buy(address token, uint256 stockIn, uint256 minOut, uint256 deadline)
        external
        nonReentrant
        returns (uint256 tokensOut)
    {
        if (block.timestamp > deadline) revert Errors.Expired();
        address stock = factory.tokenConfig(token).stock;
        IERC20(stock).safeTransferFrom(msg.sender, address(this), stockIn);
        tokensOut = _buy(token, stock, stockIn, minOut, deadline);
        _sweep(stock, msg.sender);
        _sweep(token, msg.sender);
    }

    /// @notice Sell `tokensIn` of `token` for its stock, routed to curve or pool.
    function sell(address token, uint256 tokensIn, uint256 minOut, uint256 deadline)
        external
        nonReentrant
        returns (uint256 stockOut)
    {
        if (block.timestamp > deadline) revert Errors.Expired();
        address stock = factory.tokenConfig(token).stock;
        IERC20(token).safeTransferFrom(msg.sender, address(this), tokensIn);
        stockOut = _sell(token, stock, tokensIn, minOut, deadline);
        _sweep(stock, msg.sender);
        _sweep(token, msg.sender);
    }

    /// @notice Buy `token` with native ETH: ETH -> WETH -> stock (v3) -> token.
    /// @dev Best-effort convenience path assuming a WETH/stock v3 pool at DEFAULT_V3_FEE exists; see RISKS.md.
    function buyWithETH(address token, uint256 minOut, uint256 deadline)
        external
        payable
        nonReentrant
        returns (uint256 tokensOut)
    {
        if (block.timestamp > deadline) revert Errors.Expired();
        if (msg.value == 0) revert Errors.ZeroAmount();
        address stock = factory.tokenConfig(token).stock;

        weth.deposit{ value: msg.value }();
        weth.approve(address(v3Router), msg.value);
        uint256 stockIn = v3Router.exactInputSingle(
            IV3SwapRouter.ExactInputSingleParams({
                tokenIn: address(weth),
                tokenOut: stock,
                fee: DEFAULT_V3_FEE,
                recipient: address(this),
                amountIn: msg.value,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0
            })
        );
        tokensOut = _buy(token, stock, stockIn, minOut, deadline);
        _sweep(stock, msg.sender);
        _sweep(token, msg.sender);
    }

    // --------------------------------------------------------------- quotes

    function quoteBuy(address token, uint256 stockIn) external view returns (uint256 tokensOut) {
        ICOURCurve curve = ICOURCurve(factory.curveOf(token));
        if (!curve.graduated()) {
            (tokensOut,,) = curve.quoteBuy(stockIn);
        } else {
            tokensOut = 0; // post-graduation: use the on-chain v4 Quoter off-router (see DECISIONS.md)
        }
    }

    function quoteSell(address token, uint256 tokensIn) external view returns (uint256 stockOut) {
        ICOURCurve curve = ICOURCurve(factory.curveOf(token));
        if (!curve.graduated()) {
            (stockOut,) = curve.quoteSell(tokensIn);
        } else {
            stockOut = 0;
        }
    }

    // --------------------------------------------------------------- internal

    function _buy(address token, address stock, uint256 stockIn, uint256 minOut, uint256 deadline)
        internal
        returns (uint256 tokensOut)
    {
        ICOURCurve curve = ICOURCurve(factory.curveOf(token));
        if (!curve.graduated()) {
            IERC20(stock).forceApprove(address(curve), stockIn);
            (tokensOut,) = curve.buy(stockIn, minOut, msg.sender, deadline);
            IERC20(stock).forceApprove(address(curve), 0);
        } else {
            (PoolKey memory key, bool tokenIsZero) = PoolKeyLib.build(token, stock, factory.hook());
            bool zeroForOne = !tokenIsZero; // stock is the input
            tokensOut = _swapExactInput(key, zeroForOne, stockIn, msg.sender);
            if (tokensOut < minOut) revert Errors.Slippage();
        }
    }

    function _sell(address token, address stock, uint256 tokensIn, uint256 minOut, uint256 deadline)
        internal
        returns (uint256 stockOut)
    {
        ICOURCurve curve = ICOURCurve(factory.curveOf(token));
        if (!curve.graduated()) {
            IERC20(token).forceApprove(address(curve), tokensIn);
            stockOut = curve.sell(tokensIn, minOut, msg.sender, deadline);
            IERC20(token).forceApprove(address(curve), 0);
        } else {
            (PoolKey memory key, bool tokenIsZero) = PoolKeyLib.build(token, stock, factory.hook());
            bool zeroForOne = tokenIsZero; // token is the input
            stockOut = _swapExactInput(key, zeroForOne, tokensIn, msg.sender);
            if (stockOut < minOut) revert Errors.Slippage();
        }
    }

    /// @dev Forward any residual balance to `to` so the router never custodies funds between txs.
    function _sweep(address erc20, address to) internal {
        uint256 bal = IERC20(erc20).balanceOf(address(this));
        if (bal > 0) IERC20(erc20).safeTransfer(to, bal);
    }

    receive() external payable { }
}
