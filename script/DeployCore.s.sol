// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { Script, console2 } from "forge-std/Script.sol";
import { Hooks } from "v4-core/libraries/Hooks.sol";
import { HookMiner } from "v4-periphery/test/shared/HookMiner.sol";

import { COURCurve } from "../src/COURCurve.sol";
import { COURFactory } from "../src/COURFactory.sol";
import { COURFeeVault } from "../src/COURFeeVault.sol";
import { COURHook } from "../src/COURHook.sol";
import { COURPriceReader } from "../src/COURPriceReader.sol";
import { COURRouter } from "../src/COURRouter.sol";
import { GraduationImpl } from "../src/GraduationImpl.sol";

/// @notice Shared deployment logic (used by 01_DeployCore and 03_LaunchRehearsal).
/// @dev Deploy order per docs/DEPLOY.md §11. The factory address is predicted via the deployer's CREATE
///      nonce so it can be baked into the curve implementation and the (CREATE2-mined) hook, breaking the
///      hook <-> factory <-> curveImpl dependency cycle.
abstract contract CourDeployer is Script {
    address internal constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;

    struct Deployed {
        COURPriceReader priceReader;
        COURFeeVault feeVault;
        COURCurve curveImpl;
        COURHook hook;
        COURFactory factory;
        COURRouter router;
    }

    /// @param deployer EOA that will send the deploy txs (owner of all admin roles until hand-over).
    function _deployCore(
        address deployer,
        address poolManager,
        address positionManager,
        address v3Router,
        address weth,
        address usdg,
        address treasury
    ) internal returns (Deployed memory d) {
        uint160 flags = uint160(
            Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG
                | Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG | Hooks.AFTER_SWAP_RETURNS_DELTA_FLAG
        );

        // Predict the factory CREATE address. Sequence of deployer txs before the factory:
        // [0] priceReader, [1] feeVault, [2] curveImpl, [3] graduationImpl, [4] hook(CREATE2) -> factory is [5].
        uint64 startNonce = vm.getNonce(deployer);
        address predictedFactory = vm.computeCreateAddress(deployer, startNonce + 5);

        d.priceReader = new COURPriceReader(deployer, usdg, weth); // [0]
        d.feeVault = new COURFeeVault(deployer, treasury, poolManager); // [1]
        d.curveImpl = new COURCurve(predictedFactory, address(d.feeVault)); // [2]
        GraduationImpl gradImpl = new GraduationImpl(); // [3]

        bytes memory hookArgs = abi.encode(poolManager, predictedFactory, address(d.feeVault));
        (address hookAddr, bytes32 salt) =
            HookMiner.find(CREATE2_DEPLOYER, flags, type(COURHook).creationCode, hookArgs);
        d.hook = new COURHook{ salt: salt }(poolManager, predictedFactory, address(d.feeVault)); // [4] CREATE2
        require(address(d.hook) == hookAddr, "hook addr mismatch");

        d.factory = new COURFactory(
            deployer,
            poolManager,
            positionManager,
            hookAddr,
            address(d.feeVault),
            address(d.priceReader),
            address(d.curveImpl),
            address(gradImpl)
        ); // [5]
        require(address(d.factory) == predictedFactory, "factory predict mismatch");

        d.router = new COURRouter(deployer, poolManager, address(d.factory), v3Router, weth);

        // Wire permissions (post-deploy; does not affect the factory's CREATE address).
        d.feeVault.wire(address(d.factory), hookAddr, address(d.router), address(d.priceReader));
        d.priceReader.setAuthorizedSetter(address(d.factory));

        console2.log("priceReader", address(d.priceReader));
        console2.log("feeVault   ", address(d.feeVault));
        console2.log("curveImpl  ", address(d.curveImpl));
        console2.log("hook       ", address(d.hook));
        console2.log("factory    ", address(d.factory));
        console2.log("router     ", address(d.router));
    }
}
