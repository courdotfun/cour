// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { IStockToken8056 } from "../../src/interfaces/IStockToken8056.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

/// @notice Mock Robinhood stock token: configurable decimals, ERC-8056 multiplier, and a pause switch
///         that makes transfers revert (simulating an issuer corporate-action pause).
contract MockStock is ERC20, IStockToken8056 {
    uint8 private immutable _dec;
    uint256 private _uiMultiplier = 1e18;
    uint256 private _newUiMultiplier = 1e18;
    uint256 private _effectiveAt;
    bool public paused;

    constructor(string memory n, string memory s, uint8 d) ERC20(n, s) {
        _dec = d;
    }

    function decimals() public view override(ERC20, IERC20Metadata) returns (uint8) {
        return _dec;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setPaused(bool p) external {
        paused = p;
    }

    function setUiMultiplier(uint256 m) external {
        _uiMultiplier = m;
    }

    function setSplit(uint256 newMult, uint256 effectiveAt_) external {
        _newUiMultiplier = newMult;
        _effectiveAt = effectiveAt_;
    }

    function uiMultiplier() external view returns (uint256) {
        return _uiMultiplier;
    }

    function newUIMultiplier() external view returns (uint256) {
        return _newUiMultiplier;
    }

    function effectiveAt() external view returns (uint256) {
        return _effectiveAt;
    }

    function balanceOfUI(address a) external view returns (uint256) {
        return (balanceOf(a) * _uiMultiplier) / 1e18;
    }

    function _update(address from, address to, uint256 value) internal override {
        require(!paused, "STOCK_PAUSED");
        super._update(from, to, value);
    }
}
