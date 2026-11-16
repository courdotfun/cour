// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { Script, console2 } from "forge-std/Script.sol";

/// @notice Minimal Ownable2Step stand-ins for the signer.html end-to-end test ONLY.
///         Exposes exactly the surface signer.html drives: owner(), transferOwnership,
///         acceptOwnership() [selector 0x79ba5097], setLaunchesPaused(bool)
///         [selector 0x618701e5], launchesPaused(). NOT part of the production system.
contract MockOwnable2Step {
    address public owner;
    address public pendingOwner;
    bool public launchesPaused;

    error NotOwner();
    error NotPending();

    constructor() { owner = msg.sender; }

    function transferOwnership(address newOwner) external {
        if (msg.sender != owner) revert NotOwner();
        pendingOwner = newOwner;
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotPending();
        owner = pendingOwner;
        pendingOwner = address(0);
    }

    function setLaunchesPaused(bool v) external {
        if (msg.sender != owner) revert NotOwner();
        launchesPaused = v;
    }
}

/// Deploys 4 mocks and transfers each to SAFE (env), mirroring the real
/// Factory/PriceReader/FeeVault/Router pending-owner = Safe state.
contract DeployMocks is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PK");
        address safe = vm.envAddress("SAFE");
        vm.startBroadcast(pk);
        MockOwnable2Step factory     = new MockOwnable2Step();
        MockOwnable2Step priceReader = new MockOwnable2Step();
        MockOwnable2Step feeVault    = new MockOwnable2Step();
        MockOwnable2Step router      = new MockOwnable2Step();
        factory.transferOwnership(safe);
        priceReader.transferOwnership(safe);
        feeVault.transferOwnership(safe);
        router.transferOwnership(safe);
        vm.stopBroadcast();
        console2.log("MOCK_FACTORY=%s", address(factory));
        console2.log("MOCK_PRICEREADER=%s", address(priceReader));
        console2.log("MOCK_FEEVAULT=%s", address(feeVault));
        console2.log("MOCK_ROUTER=%s", address(router));
    }
}
