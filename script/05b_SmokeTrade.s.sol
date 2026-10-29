// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { COURFeeVault } from "../src/COURFeeVault.sol";
import { COURRouter } from "../src/COURRouter.sol";
import { ICOURCurve } from "../src/interfaces/ICOURCurve.sol";
import { Constants } from "../src/libraries/Constants.sol";
import { TokenConfig } from "../src/types/TokenConfig.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { Script, console2 } from "forge-std/Script.sol";

/// @notice Mainnet smoke test, phase B (docs §7.3 steps 3-8). Run AFTER a >5s gap from phase A so trades
///         are past the anti-snipe window. Drives CTEST: small buys + sell -> graduating buy (asserts
///         Graduated + the LP NFT is owned by DEAD on the real PositionManager) -> pool swaps both ways ->
///         creator buyback (BUYBACK_BURN) -> claimPlatform. Then CTEST2 (HOLDERS): buys + claimHolder.
contract SmokeTrade is Script {
    function run() external {
        string memory cfg = vm.readFile("script/config/rh-mainnet.json");
        address nvda = vm.parseJsonAddress(cfg, ".nvda");
        address posm = vm.parseJsonAddress(cfg, ".positionManager");

        string memory dep = vm.readFile("deployments/4663.json");
        COURRouter router = COURRouter(payable(vm.parseJsonAddress(dep, ".router")));
        COURFeeVault vault = COURFeeVault(vm.parseJsonAddress(dep, ".feeVault"));

        string memory sm = vm.readFile("deployments/smoke.json");
        address ctest = vm.parseJsonAddress(sm, ".ctest");
        address c1 = vm.parseJsonAddress(sm, ".ctestCurve");
        address ctest2 = vm.parseJsonAddress(sm, ".ctest2");
        address c2 = vm.parseJsonAddress(sm, ".ctest2Curve");

        uint256 pk = vm.envUint("DEPLOYER_PK");
        address me = vm.addr(pk);

        vm.startBroadcast(pk);

        // 3. A couple of small curve buys + a sell on CTEST.
        _buy(c1, nvda, 1e16); // ~0.01 NVDA
        _buy(c1, nvda, 1e16);
        uint256 bal = IERC20(ctest).balanceOf(me);
        if (bal > 0) {
            IERC20(ctest).approve(c1, bal / 4);
            ICOURCurve(c1).sell(bal / 4, 0, me, block.timestamp);
        }

        // 4. Graduating buy: oversize the raise so it crosses the stop and refunds the remainder.
        TokenConfig memory k = ICOURCurve(c1).config();
        uint256 raise = k.k / k.vTStop - k.vS0;
        uint256 grad = raise * 3 / 2;
        uint256 have = IERC20(nvda).balanceOf(me);
        if (grad > have) grad = have;
        uint256 positionId = _nextTokenId(posm);
        IERC20(nvda).approve(c1, grad);
        ICOURCurve(c1).buy(grad, 0, me, block.timestamp);
        require(ICOURCurve(c1).graduated(), "CTEST did not graduate");
        require(IERC721(posm).ownerOf(positionId) == Constants.DEAD, "LP NFT not owned by DEAD");
        console2.log("CTEST graduated; LP positionId burned to DEAD:", positionId);

        // 6. Creator buyback (BUYBACK_BURN -> DEAD) FIRST, while pool spot still equals the TWAP anchor
        //    (a later price-moving pool swap would trip the 3% deviation guard). Lower the $ floor for the
        //    tiny test notional.
        vault.setMinBuybackUsd(0);
        uint256 owed = vault.buybackOwed(ctest);
        // Cap well under the 2%-of-reserve guard on the tiny test pool (~0.001 NVDA).
        uint256 req = owed < 1e15 ? owed : 1e15;
        if (req > 0) {
            (uint256 sin, uint256 tout) = vault.executeBuyback(ctest, req, 0);
            console2.log("buyback stockIn/tokensOut", sin, tout);
        }

        // 5. Pool swaps both ways via the router (moves the spot; done after the buyback).
        IERC20(nvda).approve(address(router), 1e16);
        uint256 poolBuy = router.buy(ctest, 1e16, 0, block.timestamp);
        if (poolBuy > 0) {
            IERC20(ctest).approve(address(router), poolBuy);
            router.sell(ctest, poolBuy, 0, block.timestamp);
        }

        // 7. Platform claim to treasury.
        uint256 plat = vault.platformOwed(nvda);
        if (plat > 0) vault.claimPlatform(nvda);
        console2.log("platform claimed (raw NVDA)", plat);

        // 8. CTEST2 (HOLDERS): a couple of buys + claimHolder (no graduation needed).
        _buy(c2, nvda, 2e16);
        _buy(c2, nvda, 2e16);
        uint256 h = vault.claimHolder(ctest2);
        console2.log("holder claimed (raw NVDA)", h);

        vm.stopBroadcast();
        console2.log("Smoke phase B complete");
    }

    function _buy(address curve, address nvda, uint256 amt) internal {
        IERC20(nvda).approve(curve, amt);
        ICOURCurve(curve).buy(amt, 0, vm.addr(vm.envUint("DEPLOYER_PK")), block.timestamp);
    }

    function _nextTokenId(address posm) internal view returns (uint256 id) {
        (bool ok, bytes memory data) = posm.staticcall(abi.encodeWithSignature("nextTokenId()"));
        require(ok, "nextTokenId");
        id = abi.decode(data, (uint256));
    }
}
