// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { IV3SwapRouter } from "../../src/interfaces/IExternal.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IMintable {
    function mint(address to, uint256 amount) external;
}

/// @notice Mock Uniswap v3 SwapRouter02: decodes the first/last token of an encoded path, pulls the
///         input token, and mints `amountIn * rate / 1e18` of the output token to the recipient. Only the
///         endpoints of the path matter for exercising COURRouter.buyWithETH routing/refund logic.
contract MockV3Router is IV3SwapRouter {
    uint256 public rate; // output units per input unit, scaled 1e18

    constructor(uint256 rate_) {
        rate = rate_;
    }

    function setRate(uint256 r) external {
        rate = r;
    }

    function exactInput(ExactInputParams calldata p) external payable returns (uint256 amountOut) {
        address tokenIn = _addr(p.path, 0);
        address tokenOut = _addr(p.path, p.path.length - 20);
        IERC20(tokenIn).transferFrom(msg.sender, address(this), p.amountIn);
        amountOut = (p.amountIn * rate) / 1e18;
        require(amountOut >= p.amountOutMinimum, "mock slippage");
        IMintable(tokenOut).mint(p.recipient, amountOut);
    }

    function _addr(bytes calldata path, uint256 offset) internal pure returns (address a) {
        a = address(bytes20(path[offset:offset + 20]));
    }
}
