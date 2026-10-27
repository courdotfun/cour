// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { ICOURCurve } from "../src/interfaces/ICOURCurve.sol";
import { ICOURFactory } from "../src/interfaces/ICOURFactory.sol";
import { ICOURPriceReader } from "../src/interfaces/ICOURPriceReader.sol";
import { CreatorMode } from "../src/types/CreatorMode.sol";
import { CourDeployer } from "./DeployCore.s.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { console2 } from "forge-std/Script.sol";
import { StdCheats } from "forge-std/StdCheats.sol";

/// @notice Launch rehearsal on an anvil fork of Robinhood Chain mainnet. Run WITHOUT --broadcast:
///         `anvil --fork-url $RH_RPC_URL --chain-id 4663` then
///         `forge script script/03_LaunchRehearsal.s.sol --rpc-url http://127.0.0.1:8545`.
///         Uses `deal` (simulation only) to fund NVDA; a live run would instead swap WETH->USDG->NVDA via v3.
///         A fork-free equivalent that always runs and writes docs/REHEARSAL_RESULT.md lives in
///         test/integration/Rehearsal.t.sol.
contract LaunchRehearsal is CourDeployer, StdCheats {
    function run() external {
        string memory cfg = vm.readFile("script/config/rh-mainnet.json");
        address poolManager = vm.parseJsonAddress(cfg, ".poolManager");
        address positionManager = vm.parseJsonAddress(cfg, ".positionManager");
        address v3Router = vm.parseJsonAddress(cfg, ".v3SwapRouter02");
        address weth = vm.parseJsonAddress(cfg, ".weth");
        address usdg = vm.parseJsonAddress(cfg, ".usdg");
        address nvda = vm.parseJsonAddress(cfg, ".nvda");
        address nvdaPool = vm.parseJsonAddress(cfg, ".nvdaUsdgPool");

        address deployer = address(this);
        Deployed memory d = _deployCore(deployer, poolManager, positionManager, v3Router, weth, usdg, deployer);

        d.factory.setStock(nvda, true, nvdaPool, ICOURPriceReader.RefKind.USDG);

        // Launch CTEST / NVDA, 5% fee, BUYBACK_BURN, 10% initial buy.
        uint256 initBuy = 100 * 10 ** IERC20Metadata(nvda).decimals();
        deal(nvda, deployer, initBuy * 50);
        IERC20(nvda).approve(address(d.factory), type(uint256).max);

        ICOURFactory.CreateParams memory p = ICOURFactory.CreateParams({
            name: "COUR Test",
            symbol: "CTEST",
            metadataURI: "ipfs://rehearsal",
            stock: nvda,
            creatorFeeBps: 500,
            creatorMode: uint8(CreatorMode.BUYBACK_BURN),
            feeRecipient: deployer,
            initialBuyStock: initBuy,
            minInitialTokens: 0,
            salt: bytes32(uint256(1))
        });
        (address token, address curve) = d.factory.createToken(p);
        console2.log("launched CTEST", token);
        console2.log("curve", curve);
        console2.log("progressBps", ICOURCurve(curve).progressBps());

        vm.writeFile(
            "docs/REHEARSAL_RESULT.md",
            string.concat(
                "# COUR Launch Rehearsal (fork)\n\nLaunched CTEST at ",
                vm.toString(token),
                "\nCurve: ",
                vm.toString(curve),
                "\nSee test/integration/Rehearsal.t.sol for the full, always-runnable scenario.\n"
            )
        );
    }
}

interface IERC20Metadata {
    function decimals() external view returns (uint8);
}
