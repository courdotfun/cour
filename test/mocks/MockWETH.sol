// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Minimal WETH9 mock (deposit/withdraw + ERC20) for exercising COURRouter.buyWithETH locally.
contract MockWETH is ERC20 {
    constructor() ERC20("Wrapped ETH", "WETH") { }

    function deposit() external payable {
        _mint(msg.sender, msg.value);
    }

    function withdraw(uint256 amount) external {
        _burn(msg.sender, amount);
        (bool ok,) = msg.sender.call{ value: amount }("");
        require(ok, "withdraw");
    }

    receive() external payable {
        _mint(msg.sender, msg.value);
    }
}
