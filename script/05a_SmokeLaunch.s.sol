// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { COURFactory } from "../src/COURFactory.sol";
import { ICOURFactory } from "../src/interfaces/ICOURFactory.sol";
import { IV3SwapRouter, IWETH } from "../src/interfaces/IExternal.sol";
import { CreatorMode } from "../src/types/CreatorMode.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Script, console2 } from "forge-std/Script.sol";

/// @notice Mainnet smoke test, phase A (docs §7.3 steps 1-2): the deployer swaps ETH -> USDG -> NVDA via
///         SwapRouter02, then launches two test tokens with tax-free initial buys:
///         CTEST (5% fee, BUYBACK_BURN) and CTEST2 (2% fee, HOLDERS). Writes deployments/smoke.json.
///         Run phase B (05b_SmokeTrade) AFTER a >5s gap so trades are past the anti-snipe window.
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
        // ETH to spend acquiring NVDA (~$190 at the observed ~$2.3k ETH; headroom above the ~$123 raise).
        // Override with SMOKE_ETH_WEI.
        uint256 ethIn = vm.envOr("SMOKE_ETH_WEI", uint256(0.08 ether));

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
        require(nvdaOut > 0, "no NVDA acquired");

        // Split the NVDA: small initial buys now; the rest is spent in phase B.
        uint256 initBuy1 = nvdaOut / 20; // ~5% for CTEST initial buy
        uint256 initBuy2 = nvdaOut / 20; // ~5% for CTEST2 initial buy

        // 2. Launch CTEST (5% fee, BUYBACK_BURN) with a tax-free initial buy.
        IERC20(nvda).approve(address(factory), initBuy1);
        (address t1, address c1) = factory.createToken(
            ICOURFactory.CreateParams({
                name: "COUR Test",
                symbol: "CTEST",
                metadataURI: "ipfs://smoke-ctest",
                stock: nvda,
                creatorFeeBps: 500,
                creatorMode: uint8(CreatorMode.BUYBACK_BURN),
                feeRecipient: me,
                initialBuyStock: initBuy1,
                minInitialTokens: 0,
                salt: keccak256("CTEST-smoke")
            })
        );

        // Launch CTEST2 (2% fee, HOLDERS) with a tax-free initial buy.
        IERC20(nvda).approve(address(factory), initBuy2);
        (address t2, address c2) = factory.createToken(
            ICOURFactory.CreateParams({
                name: "COUR Test 2",
                symbol: "CTEST2",
                metadataURI: "ipfs://smoke-ctest2",
                stock: nvda,
                creatorFeeBps: 200,
                creatorMode: uint8(CreatorMode.HOLDERS),
                feeRecipient: me,
                initialBuyStock: initBuy2,
                minInitialTokens: 0,
                salt: keccak256("CTEST2-smoke")
            })
        );

        vm.stopBroadcast();

        string memory o = "smoke";
        vm.serializeAddress(o, "nvda", nvda);
        vm.serializeAddress(o, "ctest", t1);
        vm.serializeAddress(o, "ctestCurve", c1);
        vm.serializeAddress(o, "ctest2", t2);
        string memory out = vm.serializeAddress(o, "ctest2Curve", c2);
        vm.writeJson(out, "deployments/smoke.json");
        console2.log("CTEST", t1);
        console2.log("CTEST2", t2);
        console2.log("Wrote deployments/smoke.json; run 05b after a >5s gap");
    }
}
