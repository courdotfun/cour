// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { TimelockController } from "@openzeppelin/contracts/governance/TimelockController.sol";
import { Script, console2 } from "forge-std/Script.sol";

/// @notice Hand admin ownership of factory / price reader / fee-vault to a 48h TimelockController whose
///         proposer & executor is the MULTISIG from .env. If no Safe exists on Robinhood Chain yet, the
///         human deploys one first (noted in docs/DEPLOY.md) and sets MULTISIG accordingly.
contract HandOver is Script {
    function run() external {
        address factory = vm.envAddress("COUR_FACTORY");
        address priceReader = vm.envAddress("COUR_PRICE_READER");
        address feeVault = vm.envAddress("COUR_FEE_VAULT");
        address multisig = vm.envAddress("MULTISIG");
        uint256 pk = vm.envUint("DEPLOYER_PK");

        vm.startBroadcast(pk);

        address[] memory proposers = new address[](1);
        proposers[0] = multisig;
        address[] memory executors = new address[](1);
        executors[0] = multisig;
        TimelockController timelock = new TimelockController(48 hours, proposers, executors, address(0));

        // Ownable2Step: begin transfer; the timelock must acceptOwnership() in a scheduled op.
        Ownable2Step(factory).transferOwnership(address(timelock));
        Ownable2Step(priceReader).transferOwnership(address(timelock));
        Ownable2Step(feeVault).transferOwnership(address(timelock));

        vm.stopBroadcast();
        console2.log("timelock", address(timelock));
        console2.log("Ownership transfer initiated; timelock must acceptOwnership() via the multisig.");
    }
}
