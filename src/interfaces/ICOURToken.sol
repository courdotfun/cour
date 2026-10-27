// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title ICOURToken
/// @notice Minimal view surface of a launched COUR token.
interface ICOURToken is IERC20 {
    function factory() external view returns (address);
    function curve() external view returns (address);
    function stock() external view returns (address);
    function creator() external view returns (address);
    /// @notice FeeVault address wired for dividend bookkeeping; non-zero only in HOLDERS mode.
    function holderRewards() external view returns (address);
    function metadataURI() external view returns (string memory);
}
