// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { COURFactory } from "../src/COURFactory.sol";
import { ICOURFactory } from "../src/interfaces/ICOURFactory.sol";
import { IV3SwapRouter, IWETH } from "../src/interfaces/IExternal.sol";
import { CreatorMode } from "../src/types/CreatorMode.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Script, console2 } from "forge-std/Script.sol";

/// @notice Mainnet smoke test, phase A (docs §7.3 steps 1-2): the deployer swaps ETH -> USDG -> NVDA via
///         SwapRouter02, then launches CTEST (5% fee, BUYBACK_BURN) and — only if SMOKE_HOLDERS=true —
///         CTEST2 (2% fee, HOLDERS), each with a TINY fixed initial buy (safe for the cheap test curve).
///         Writes deployments/smoke.json. Run phase B (05b) AFTER a >5s gap (past the anti-snipe window).
contract SmokeLaunch is Script {
    function run() external {
        string memory cfg = vm.readFile("script/config/rh-mainnet.json");
        address nvda = vm.parseJsonAddress(cfg, ".nvda");
        address usdg = vm.parseJsonAddress(cfg, ".usdg");
        address weth = vm.parseJsonAddress(cfg, ".weth");
        address v3Router = vm.parseJsonAddress(cfg, ".v3SwapRouter02");
        uint24 nvdaFee = uint24(vm.parseJsonUint(cfg, ".nvdaUsdgFee"));
        uint24 wethFee = uint24(vm.parseJsonUint(cfg, ".wethUsdgFee"));

        string memory dep = vm.readFile("deployments/4663.json");
        COURFactory factory = COURFactory(vm.parseJsonAddress(dep, ".factory"));

        uint256 pk = vm.envUint("DEPLOYER_PK");
        address me = vm.addr(pk);
        uint256 ethIn = vm.envOr("SMOKE_ETH_WEI", uint256(0.08 ether)); // fork default; mainnet overrides small
        bool holders = vm.envOr("SMOKE_HOLDERS", false);
        // Tiny fixed initial buy, safe for the $1/$15 curve (does not graduate, well under 50% supply).
        uint256 initBuy = vm.envOr("SMOKE_INIT_BUY_WEI", uint256(5e14)); // ~0.0005 NVDA

        vm.startBroadcast(pk);

        // 1. ETH -> WETH -> USDG -> NVDA via SwapRouter02 exactInput.
        IWETH(weth).deposit{ value: ethIn }();
        IWETH(weth).approve(v3Router, ethIn);
        bytes memory path = abi.encodePacked(weth, wethFee, usdg, nvdaFee, nvda);
        uint256 nvdaOut = IV3SwapRouter(v3Router)
            .exactInput(
                IV3SwapRouter.ExactInputParams({ path: path, recipient: me, amountIn: ethIn, amountOutMinimum: 0 })
            );
        console2.log("acquired NVDA (raw)", nvdaOut);
        require(nvdaOut > initBuy * 3, "insufficient NVDA acquired");

        // 2. Launch CTEST (5% fee, BUYBACK_BURN) with a tiny tax-free initial buy.
        IERC20(nvda).approve(address(factory), initBuy);
        (address t1, address c1) = factory.createToken(
            ICOURFactory.CreateParams({
                name: "COUR Test",
                symbol: "CTEST",
                metadataURI: "ipfs://smoke-ctest",
                stock: nvda,
                creatorFeeBps: 500,
                creatorMode: uint8(CreatorMode.BUYBACK_BURN),
                feeRecipient: me,
                initialBuyStock: initBuy,
                minInitialTokens: 0,
                salt: keccak256("CTEST-smoke")
            })
        );

        address t2 = address(0);
        address c2 = address(0);
        if (holders) {
            IERC20(nvda).approve(address(factory), initBuy);
            (t2, c2) = factory.createToken(
                ICOURFactory.CreateParams({
                    name: "COUR Test 2",
                    symbol: "CTEST2",
                    metadataURI: "ipfs://smoke-ctest2",
                    stock: nvda,
                    creatorFeeBps: 200,
                    creatorMode: uint8(CreatorMode.HOLDERS),
                    feeRecipient: me,
                    initialBuyStock: initBuy,
                    minInitialTokens: 0,
                    salt: keccak256("CTEST2-smoke")
                })
            );
        }

        vm.stopBroadcast();

        string memory o = "smoke";
        vm.serializeAddress(o, "nvda", nvda);
        vm.serializeAddress(o, "ctest", t1);
        vm.serializeAddress(o, "ctestCurve", c1);
        vm.serializeAddress(o, "ctest2", t2);
        string memory out = vm.serializeAddress(o, "ctest2Curve", c2);
        vm.writeJson(out, "deployments/smoke.json");
        console2.log("CTEST", t1);
        console2.log("CTEST2 (0x0 if skipped)", t2);
        console2.log("Wrote deployments/smoke.json; run 05b after a >5s gap");
    }
}
