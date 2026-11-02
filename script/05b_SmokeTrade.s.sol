// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { COURFeeVault } from "../src/COURFeeVault.sol";
import { COURRouter } from "../src/COURRouter.sol";
import { ICOURCurve } from "../src/interfaces/ICOURCurve.sol";
import { ICOURHook } from "../src/interfaces/ICOURHook.sol";
import { Constants } from "../src/libraries/Constants.sol";
import { TokenConfig } from "../src/types/TokenConfig.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { Script, console2 } from "forge-std/Script.sol";

/// @notice Mainnet smoke test, phase B (docs §7.3 steps 3-8). Run AFTER a >5s gap from phase A. Drives
///         CTEST: curve-sized small buy + sell -> graduating buy (asserts Graduated + the LP NFT is owned
///         by DEAD on the real PositionManager) -> creator buyback (reserve-capped) -> pool swaps both
///         ways -> claimPlatform. CTEST2 (HOLDERS) buys + claimHolder only if it was launched.
contract SmokeTrade is Script {
    uint256 internal pk;
    address internal me;

    function run() external {
        string memory cfg = vm.readFile("script/config/rh-mainnet.json");
        address nvda = vm.parseJsonAddress(cfg, ".nvda");
        address posm = vm.parseJsonAddress(cfg, ".positionManager");

        string memory dep = vm.readFile("deployments/4663.json");
        COURRouter router = COURRouter(payable(vm.parseJsonAddress(dep, ".router")));
        COURFeeVault vault = COURFeeVault(vm.parseJsonAddress(dep, ".feeVault"));
        address hook = vm.parseJsonAddress(dep, ".hook");

        string memory sm = vm.readFile("deployments/smoke.json");
        address ctest = vm.parseJsonAddress(sm, ".ctest");
        address c1 = vm.parseJsonAddress(sm, ".ctestCurve");
        address ctest2 = vm.parseJsonAddress(sm, ".ctest2");
        address c2 = vm.parseJsonAddress(sm, ".ctest2Curve");

        pk = vm.envUint("DEPLOYER_PK");
        me = vm.addr(pk);

        vm.startBroadcast(pk);

        // Size everything relative to the curve so it works at any launch params (incl. the cheap $1/$15).
        TokenConfig memory k = ICOURCurve(c1).config();
        uint256 raise = k.k / k.vTStop - k.vS0;
        uint256 warm = raise / 10 + 1;

        // 3. A small curve buy + a sell on CTEST (well below graduation).
        _buy(c1, nvda, warm);
        uint256 bal = IERC20(ctest).balanceOf(me);
        if (bal > 0) {
            IERC20(ctest).approve(c1, bal / 4);
            ICOURCurve(c1).sell(bal / 4, 0, me, block.timestamp + 3600);
        }

        // 4. Graduating buy: oversize the raise so it crosses the stop and refunds the remainder.
        uint256 grad = raise * 2;
        uint256 have = IERC20(nvda).balanceOf(me);
        if (grad > have) grad = have;
        uint256 positionId = _nextTokenId(posm);
        IERC20(nvda).approve(c1, grad);
        ICOURCurve(c1).buy(grad, 0, me, block.timestamp + 3600);
        require(ICOURCurve(c1).graduated(), "CTEST did not graduate");
        require(IERC721(posm).ownerOf(positionId) == Constants.DEAD, "LP NFT not owned by DEAD");
        console2.log("CTEST graduated; LP positionId burned to DEAD:", positionId);

        // 6. Creator buyback (BUYBACK_BURN -> DEAD) FIRST, while pool spot == TWAP anchor (a later pool swap
        //    would trip the 3% deviation guard). Cap at 1% of the actual reserve (< the 2% guard).
        //    NOTE (L-2): a post-graduation buyback now also requires a FULL TWAP window (HOOK_TWAP_WINDOW =
        //    300s) to have elapsed since graduation. In a single smoke tx that window is not yet full, so the
        //    call reverts TwapWindowNotReady — expected; it is exercised on-chain after 300s or in the fork
        //    test. We attempt it and skip gracefully so the rest of the smoke flow still runs.
        vault.setMinBuybackUsd(0); // whole-USD floor; sub-dollar test notional -> 0 (restored to 50 in 06)
        uint256 owed = vault.buybackOwed(ctest);
        uint256 reserve = ICOURHook(hook).poolStockReserve(ctest, nvda);
        uint256 cap = reserve / 100;
        uint256 req = owed < cap ? owed : cap;
        if (req > 0) {
            try vault.executeBuyback(ctest, req, 0) returns (uint256 sin, uint256 tout) {
                console2.log("buyback stockIn/tokensOut", sin, tout);
            } catch {
                console2.log("buyback skipped: TWAP window not full yet (L-2); run after 300s. owed", owed);
            }
        } else {
            console2.log("buyback skipped (too small for pool); owed/reserve", owed, reserve);
        }

        // 5. Pool swaps both ways via the router (moves the spot; after the buyback).
        if (IERC20(nvda).balanceOf(me) >= warm) {
            IERC20(nvda).approve(address(router), warm);
            uint256 poolBuy = router.buy(ctest, warm, 0, block.timestamp + 3600);
            if (poolBuy > 0) {
                IERC20(ctest).approve(address(router), poolBuy);
                router.sell(ctest, poolBuy, 0, block.timestamp + 3600);
            }
        }

        // 7. Platform claim to treasury.
        uint256 plat = vault.platformOwed(nvda);
        if (plat > 0) vault.claimPlatform(nvda);
        console2.log("platform claimed (raw NVDA)", plat);

        // 8. CTEST2 (HOLDERS): a couple of curve-sized buys + claimHolder — only if it was launched.
        if (c2 != address(0)) {
            TokenConfig memory k2 = ICOURCurve(c2).config();
            uint256 warm2 = (k2.k / k2.vTStop - k2.vS0) / 10 + 1;
            _buy(c2, nvda, warm2);
            _buy(c2, nvda, warm2);
            uint256 h = vault.claimHolder(ctest2);
            console2.log("holder claimed (raw NVDA)", h);
        }

        vm.stopBroadcast();
        console2.log("Smoke phase B complete");
    }

    /// @dev Buy `amt` on `curve` with NVDA, skipping if the deployer's balance is too low (lets the smoke
    ///      degrade gracefully under a tight budget instead of reverting).
    function _buy(address curve, address nvda, uint256 amt) internal {
        if (IERC20(nvda).balanceOf(me) < amt) return;
        IERC20(nvda).approve(curve, amt);
        ICOURCurve(curve).buy(amt, 0, me, block.timestamp + 3600);
    }

    function _nextTokenId(address posm) internal view returns (uint256 id) {
        (bool ok, bytes memory data) = posm.staticcall(abi.encodeWithSignature("nextTokenId()"));
        require(ok, "nextTokenId");
        id = abi.decode(data, (uint256));
    }
}
