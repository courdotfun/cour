// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { COURFactory } from "../src/COURFactory.sol";
import { ICOURFactory } from "../src/interfaces/ICOURFactory.sol";
import { CreatorMode } from "../src/types/CreatorMode.sol";
import { Script, console2 } from "forge-std/Script.sol";

/// @notice Minimal mainnet smoke for the FINAL deployment: launch one token with NO initial buy (so it needs
///         no stock capital) to prove createToken works end-to-end on the final factory and to give the
///         indexer/frontend a real on-chain token to index. Allowlist is enabled; only the deployer can launch.
///         Writes deployments/smoke-final.json. Does NOT buy/graduate.
contract SmokeLaunchNoBuy is Script {
    function run() external {
        string memory cfg = vm.readFile("script/config/rh-mainnet.json");
        address nvda = vm.parseJsonAddress(cfg, ".nvda");

        string memory dep = vm.readFile("deployments/4663.json");
        COURFactory factory = COURFactory(vm.parseJsonAddress(dep, ".factory"));

        uint256 pk = vm.envUint("DEPLOYER_PK");
        address me = vm.addr(pk);

        vm.startBroadcast(pk);
        (address token, address curve) = factory.createToken(
            ICOURFactory.CreateParams({
                name: "COUR Smoke",
                symbol: "CSMOKE",
                metadataURI: "ipfs://cour-smoke-final",
                stock: nvda,
                creatorFeeBps: 500,
                creatorMode: uint8(CreatorMode.BUYBACK_BURN),
                feeRecipient: me,
                initialBuyStock: 0,
                minInitialTokens: 0,
                salt: keccak256("CSMOKE-final")
            })
        );
        vm.stopBroadcast();

        string memory o = "smoke";
        vm.serializeAddress(o, "nvda", nvda);
        vm.serializeAddress(o, "token", token);
        string memory out = vm.serializeAddress(o, "curve", curve);
        vm.writeJson(out, "deployments/smoke-final.json");
        console2.log("CSMOKE token", token);
        console2.log("CSMOKE curve", curve);
    }
}
