// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { Script, console2 } from "forge-std/Script.sol";

/// @notice Option (a): hand admin ownership of ALL Ownable COUR contracts
///         (factory, priceReader, feeVault, router) DIRECTLY to the Safe 2-of-3
///         (MULTISIG) — NOT to a Timelock. This gives the Safe fast (no-delay)
///         incident response during the closed allowlist beta. A 48h Timelock is
///         installed later (04_HandOver), as the final step before opening public
///         launches.
///
///         Ownable2Step: this only BEGINS the transfer (sets pendingOwner = Safe).
///         The Safe must acceptOwnership() on each contract to finalize — see the
///         generated Transaction-Builder JSON (deployments/safe-accept-ownership.json).
///
///         Run:
///           MULTISIG=0x.. forge script script/09_TransferOwnershipToSafe.s.sol:TransferOwnershipToSafe \
///             --rpc-url <rpc> --broadcast --slow
contract TransferOwnershipToSafe is Script {
    function run() external {
        string memory dep = vm.readFile("deployments/4663.json");
        address factory = vm.parseJsonAddress(dep, ".factory");
        address priceReader = vm.parseJsonAddress(dep, ".priceReader");
        address feeVault = vm.parseJsonAddress(dep, ".feeVault");
        address router = vm.parseJsonAddress(dep, ".router");
        address safe = vm.envAddress("MULTISIG");
        require(safe != address(0), "MULTISIG unset");
        uint256 pk = vm.envUint("DEPLOYER_PK");

        vm.startBroadcast(pk);
        Ownable2Step(factory).transferOwnership(safe);
        Ownable2Step(priceReader).transferOwnership(safe);
        Ownable2Step(feeVault).transferOwnership(safe);
        Ownable2Step(router).transferOwnership(safe);
        vm.stopBroadcast();

        console2.log("transfer initiated -> Safe:", safe);
        console2.log("pendingOwner(factory):", Ownable2Step(factory).pendingOwner());
        console2.log("pendingOwner(priceReader):", Ownable2Step(priceReader).pendingOwner());
        console2.log("pendingOwner(feeVault):", Ownable2Step(feeVault).pendingOwner());
        console2.log("pendingOwner(router):", Ownable2Step(router).pendingOwner());
        console2.log("NEXT: Safe must acceptOwnership() on each (2-of-3) - see safe-accept-ownership.json");
    }
}
