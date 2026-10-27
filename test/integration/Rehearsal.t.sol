// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { ICOURCurve } from "../../src/interfaces/ICOURCurve.sol";
import { ICOURFactory } from "../../src/interfaces/ICOURFactory.sol";
import { Constants } from "../../src/libraries/Constants.sol";
import { CreatorMode } from "../../src/types/CreatorMode.sol";
import { MockERC20 } from "../mocks/MockERC20.sol";
import { MockStock } from "../mocks/MockStock.sol";
import { BaseTest } from "../utils/BaseTest.sol";

/// @notice Always-runnable launch rehearsal (local, mock-paired) implementing docs §10. Writes a human
///         summary to docs/REHEARSAL_RESULT.md. The fork variant is script/03_LaunchRehearsal.s.sol.
contract RehearsalTest is BaseTest {
    MockStock internal stock;
    address internal token;
    address internal curve;

    function test_rehearsal() public {
        _deploySystem();
        stock = _newStock(18, 100e18); // NVDA ~ $100

        // 3. Launch CTEST / NVDA, 5% fee, BUYBACK_BURN, initial buy 15 NVDA (tax-free, < 50% supply cap).
        uint256 initBuy = 15e18;
        stock.mint(creator, initBuy);
        vm.prank(creator);
        stock.approve(address(factory), initBuy);
        ICOURFactory.CreateParams memory p = ICOURFactory.CreateParams({
            name: "COUR Test",
            symbol: "CTEST",
            metadataURI: "ipfs://rehearsal",
            stock: address(stock),
            creatorFeeBps: 500,
            creatorMode: uint8(CreatorMode.BUYBACK_BURN),
            feeRecipient: creator,
            initialBuyStock: initBuy,
            minInitialTokens: 0,
            salt: bytes32(uint256(1))
        });
        vm.prank(creator);
        (token, curve) = factory.createToken(p);
        uint256 initialTokens = MockERC20(token).balanceOf(creator);

        // 4a. Sniper buy at dt=0 is rejected (99% tax + fee > 100%).
        bool dt0Reverts;
        stock.mint(alice, 5e18);
        vm.startPrank(alice);
        stock.approve(curve, 5e18);
        try ICOURCurve(curve).buy(5e18, 0, alice, block.timestamp) { }
            catch {
            dt0Reverts = true;
        }
        vm.stopPrank();

        // 4b. Snipers at dt=1 and dt=2 pay a decaying tax (fewer tokens for the same 5 NVDA).
        vm.warp(block.timestamp + 1);
        uint256 tDt1 = _buyCurve(curve, stock, alice, 5e18);
        vm.warp(block.timestamp + 1);
        uint256 tDt2 = _buyCurve(curve, stock, bob, 5e18);
        vm.warp(block.timestamp + 4); // past window
        uint256 tDtClear = _buyCurve(curve, stock, carol, 5e18);

        // 4c. 20 small random buys/sells (kept well below graduation).
        for (uint256 i; i < 20; i++) {
            if (i % 2 == 0) {
                _buyCurve(curve, stock, alice, 1e18);
            } else {
                uint256 bal = MockERC20(token).balanceOf(bob);
                if (bal > 0) _sellCurve(curve, token, bob, bal / 4 + 1);
            }
        }

        // 4d. Big buy crosses the stop point -> refund + graduation in the same tx.
        uint256 big = 2_000e18;
        stock.mint(alice, big);
        vm.startPrank(alice);
        stock.approve(curve, big);
        uint256 balBefore = stock.balanceOf(alice);
        (uint256 gotBig, uint256 used) = ICOURCurve(curve).buy(big, 0, alice, block.timestamp);
        vm.stopPrank();
        balBefore;
        bool graduated = ICOURCurve(curve).graduated();

        // 5. Creator buyback on the v4 pool right after graduation (spot == TWAP, deviation guard passes).
        //    BUYBACK_BURN -> tokens to DEAD. Small amount within the min-$50 and 2%-of-reserve guards.
        uint256 deadBefore = MockERC20(token).balanceOf(Constants.DEAD);
        uint256 buybackOwed = vault.buybackOwed(token);
        uint256 req = buybackOwed < 1e18 ? buybackOwed : 1e18; // ~$100, above the $50 floor
        vm.prank(creator);
        (, uint256 burned) = vault.executeBuyback(token, req, 0);
        uint256 deadAfter = MockERC20(token).balanceOf(Constants.DEAD);

        // 5b. Pool swaps both ways via the router.
        uint256 poolIn = 20e18;
        stock.mint(bob, poolIn);
        vm.startPrank(bob);
        stock.approve(address(router), poolIn);
        uint256 poolBuyOut = router.buy(token, poolIn, 0, block.timestamp);
        MockERC20(token).approve(address(router), poolBuyOut);
        uint256 poolSellOut = router.sell(token, poolBuyOut, 0, block.timestamp);
        vm.stopPrank();

        // 5c. Platform claim to treasury.
        uint256 platformOwed = vault.platformOwed(address(stock));
        vault.claimPlatform(address(stock));

        _writeResult(
            initialTokens,
            dt0Reverts,
            tDt1,
            tDt2,
            tDtClear,
            gotBig,
            used,
            graduated,
            poolBuyOut,
            poolSellOut,
            deadAfter - deadBefore,
            platformOwed
        );

        // Assertions that make this a real test, not just a report generator.
        assertTrue(dt0Reverts, "dt=0 blocked");
        // (tax decay in isolation is asserted in LaunchTaxFlow.t.sol; here buys move the price too.)
        assertTrue(graduated, "graduated");
        assertLt(used, big, "refund on graduation");
        assertGt(poolBuyOut, 0);
        assertGt(poolSellOut, 0);
        assertGt(burned, 0, "buyback burned tokens");
        assertEq(deadAfter - deadBefore, burned, "burned tokens to DEAD");
        assertGt(platformOwed, 0);
    }

    function _writeResult(
        uint256 initialTokens,
        bool dt0Reverts,
        uint256 tDt1,
        uint256 tDt2,
        uint256 tDtClear,
        uint256 gotBig,
        uint256 used,
        bool graduated,
        uint256 poolBuyOut,
        uint256 poolSellOut,
        uint256 burned,
        uint256 platformOwed
    ) internal {
        string memory s = "# COUR Launch Rehearsal Result (local, mock NVDA @ $100)\n\n";
        s = string.concat(
            s, "Token: CTEST / mNVDA | fee 5% | mode BUYBACK_BURN | start $4,000 -> grad $60,000 mcap\n\n"
        );
        s = string.concat(s, "| Step | Value |\n|---|---|\n");
        s = string.concat(s, "| Initial buy (15 NVDA, tax-free) tokens | ", vm.toString(initialTokens / 1e18), " |\n");
        s = string.concat(s, "| dt=0 sniper blocked (99% tax) | ", dt0Reverts ? "yes" : "no", " |\n");
        s = string.concat(s, "| 5 NVDA buy @ dt=1 tokens | ", vm.toString(tDt1 / 1e18), " |\n");
        s = string.concat(s, "| 5 NVDA buy @ dt=2 tokens | ", vm.toString(tDt2 / 1e18), " |\n");
        s = string.concat(s, "| 5 NVDA buy @ dt>=5 tokens | ", vm.toString(tDtClear / 1e18), " |\n");
        s = string.concat(s, "| Big buy tokens out | ", vm.toString(gotBig / 1e18), " |\n");
        s = string.concat(s, "| Big buy stock used (of 2000) | ", vm.toString(used / 1e18), " |\n");
        s = string.concat(s, "| Graduated | ", graduated ? "yes" : "no", " |\n");
        s = string.concat(s, "| Pool buy (20 NVDA) tokens out | ", vm.toString(poolBuyOut / 1e18), " |\n");
        s = string.concat(s, "| Pool sell stock out | ", vm.toString(poolSellOut / 1e18), " |\n");
        s = string.concat(s, "| Tokens burned via buyback | ", vm.toString(burned / 1e18), " |\n");
        s = string.concat(s, "| Platform fees claimed (NVDA) | ", vm.toString(platformOwed / 1e18), " |\n");
        s = string.concat(
            s, "\nGenerated by test/integration/Rehearsal.t.sol (forge test --match-test test_rehearsal).\n"
        );
        vm.writeFile("docs/REHEARSAL_RESULT.md", s);
    }
}
