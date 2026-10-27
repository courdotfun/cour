// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {ICOURToken} from "./interfaces/ICOURToken.sol";
import {ICOURFeeVault} from "./interfaces/ICOURFeeVault.sol";
import {Constants} from "./libraries/Constants.sol";

/// @title COURToken
/// @notice Fixed-supply (1e9, 18 decimals) ERC-20 + Permit launched by the COUR factory. The entire
///         supply is minted once to the bonding curve. No mint, no burn, no owner, no blacklist,
///         no pause, no transfer tax.
/// @dev In HOLDERS mode, `holderRewards` is the FeeVault and every balance change notifies it BEFORE
///      balances move so the dividend accounting settles correctly. The vault keys that accounting by
///      msg.sender (this token), so it is safe even for the initial mint and needs no pre-registration.
contract COURToken is ERC20, ERC20Permit, ICOURToken {
    address public immutable factory;
    address public immutable curve;
    address public immutable stock;
    address public immutable creator;
    /// @inheritdoc ICOURToken
    address public immutable holderRewards; // FeeVault in HOLDERS mode, else address(0)

    string internal _metadataURI;

    /// @param holderRewards_ FeeVault address if mode == HOLDERS, else address(0).
    constructor(
        string memory name_,
        string memory symbol_,
        string memory metadataURI_,
        address curve_,
        address stock_,
        address creator_,
        address holderRewards_
    ) ERC20(name_, symbol_) ERC20Permit(name_) {
        factory = msg.sender;
        curve = curve_;
        stock = stock_;
        creator = creator_;
        holderRewards = holderRewards_;
        _metadataURI = metadataURI_;
        _mint(curve_, Constants.TOTAL_SUPPLY);
    }

    /// @inheritdoc ICOURToken
    function metadataURI() external view returns (string memory) {
        return _metadataURI;
    }

    /// @dev Notify the dividend vault before every balance change (HOLDERS mode only). The vault
    ///      function is O(1) and MUST NOT revert for normal transfers.
    function _update(address from, address to, uint256 value) internal override {
        address hr = holderRewards;
        if (hr != address(0)) {
            ICOURFeeVault(hr).beforeBalanceChange(from, to, value);
        }
        super._update(from, to, value);
    }
}
