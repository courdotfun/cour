// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { Script, console2 } from "forge-std/Script.sol";

/// @notice Create a 2-of-3 Safe{Wallet} on Robinhood Chain (4663) using the CANONICAL
///         Safe v1.4.1 contracts already deployed on-chain (verified present:
///         SafeProxyFactory 0x4e1D…ec67, SafeL2 singleton 0x29fc…C762, fallback 0xfd07…Ec99).
///         No Safe contracts are deployed here — only a new proxy (your multisig).
///
///         Owners are read from env OWNER_1 / OWNER_2 / OWNER_3 (3 distinct signer
///         addresses). Threshold = 2. The resulting proxy address is your MULTISIG;
///         put it in `.env` as MULTISIG=0x… then run 04_HandOver.
///
///         Run:
///           OWNER_1=0x.. OWNER_2=0x.. OWNER_3=0x.. \
///           forge script script/07_DeploySafe.s.sol:DeploySafe --rpc-url $RH_RPC_URL --broadcast --slow
interface ISafeProxyFactory {
    function createProxyWithNonce(address singleton, bytes memory initializer, uint256 saltNonce)
        external
        returns (address proxy);
}

interface ISafe {
    function setup(
        address[] calldata owners,
        uint256 threshold,
        address to,
        bytes calldata data,
        address fallbackHandler,
        address paymentToken,
        uint256 payment,
        address payable paymentReceiver
    ) external;
}

contract DeploySafe is Script {
    // Canonical Safe v1.4.1 addresses (same across chains; verified live on 4663).
    address constant SAFE_PROXY_FACTORY = 0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67;
    address constant SAFE_L2_SINGLETON = 0x29fcB43b46531BcA003ddC8FCB67FFE91900C762;
    address constant FALLBACK_HANDLER = 0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99;

    function run() external {
        address o1 = vm.envAddress("OWNER_1");
        address o2 = vm.envAddress("OWNER_2");
        address o3 = vm.envAddress("OWNER_3");
        require(o1 != address(0) && o2 != address(0) && o3 != address(0), "owner zero");
        require(o1 != o2 && o1 != o3 && o2 != o3, "owners must be distinct");
        uint256 saltNonce = vm.envOr("SAFE_SALT", uint256(4663));
        uint256 pk = vm.envUint("DEPLOYER_PK");

        address[] memory owners = new address[](3);
        owners[0] = o1;
        owners[1] = o2;
        owners[2] = o3;

        bytes memory initializer = abi.encodeCall(
            ISafe.setup,
            (owners, 2, address(0), "", FALLBACK_HANDLER, address(0), 0, payable(address(0)))
        );

        vm.startBroadcast(pk);
        address safe = ISafeProxyFactory(SAFE_PROXY_FACTORY).createProxyWithNonce(
            SAFE_L2_SINGLETON, initializer, saltNonce
        );
        vm.stopBroadcast();

        console2.log("SAFE (2-of-3) deployed:", safe);
        console2.log("owners:", o1, o2, o3);
        console2.log("threshold: 2  saltNonce:", saltNonce);
        console2.log("NEXT: set MULTISIG=%s in .env, then run script/04_HandOver.s.sol", safe);
    }
}
