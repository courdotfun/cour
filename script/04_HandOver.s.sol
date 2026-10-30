// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { TimelockController } from "@openzeppelin/contracts/governance/TimelockController.sol";
import { Script, console2 } from "forge-std/Script.sol";

/// @notice Hand admin ownership of ALL Ownable COUR contracts (factory, price reader, fee vault, router)
///         to a 48h TimelockController whose proposer & executor is the MULTISIG from .env. Addresses are
///         read from deployments/4663.json. If no Safe exists on Robinhood Chain yet, the human deploys one
///         first (see docs/GO_LIVE.md) and sets MULTISIG accordingly.
contract HandOver is Script {
    function run() external {
        string memory dep = vm.readFile("deployments/4663.json");
        address factory = vm.parseJsonAddress(dep, ".factory");
        address priceReader = vm.parseJsonAddress(dep, ".priceReader");
        address feeVault = vm.parseJsonAddress(dep, ".feeVault");
        address router = vm.parseJsonAddress(dep, ".router");
        address multisig = vm.envAddress("MULTISIG");
        uint256 pk = vm.envUint("DEPLOYER_PK");

        vm.startBroadcast(pk);

        address[] memory proposers = new address[](1);
        proposers[0] = multisig;
        address[] memory executors = new address[](1);
        executors[0] = multisig;
        TimelockController timelock = new TimelockController(48 hours, proposers, executors, address(0));

        // Ownable2Step: begin transfer; the timelock must acceptOwnership() in a scheduled op per contract.
        Ownable2Step(factory).transferOwnership(address(timelock));
        Ownable2Step(priceReader).transferOwnership(address(timelock));
        Ownable2Step(feeVault).transferOwnership(address(timelock));
        Ownable2Step(router).transferOwnership(address(timelock));

        vm.stopBroadcast();
        console2.log("timelock", address(timelock));
        console2.log("Ownership transfer initiated for factory/priceReader/feeVault/router;");
        console2.log("the timelock must acceptOwnership() on EACH via a scheduled multisig op.");
    }
}
