// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @notice Minimal WETH9 interface.
interface IWETH {
    function deposit() external payable;
    function withdraw(uint256) external;
    function approve(address, uint256) external returns (bool);
    function transfer(address, uint256) external returns (bool);
    function balanceOf(address) external view returns (uint256);
}

/// @notice Minimal Uniswap v3 SwapRouter02 subset used for ETH->stock convenience routing.
/// @dev SwapRouter02 (0xCaf6…5cb2) drops the per-call `deadline` from the params (the router enforces
///      its own deadline). `path` is the standard v3 encoded path: token(20) | fee(3) | token(20) | ...
interface IV3SwapRouter {
    struct ExactInputParams {
        bytes path;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
    }

    function exactInput(ExactInputParams calldata params) external payable returns (uint256 amountOut);
}
