// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { ICOURCurve } from "../../src/interfaces/ICOURCurve.sol";
import { Constants } from "../../src/libraries/Constants.sol";
import { CreatorMode } from "../../src/types/CreatorMode.sol";
import { TokenConfig } from "../../src/types/TokenConfig.sol";
import { MockERC20 } from "../mocks/MockERC20.sol";
import { MockStock } from "../mocks/MockStock.sol";
import { BaseTest } from "../utils/BaseTest.sol";

/// @notice Proves token/stock conservation across launch -> trading -> graduation. This is the hard
///         proof behind docs §2.1: the "missing ~36.75M tokens" the human review flagged in
///         REHEARSAL_RESULT.md are NOT lost — they were sold in the 20 unreported random trades of
///         Rehearsal.t.sol step 4c. Tokens sold at graduation ALWAYS equal `vT0 - vTStop`
///         (= 794,786,904e18 for the default Q=15), independent of stock price and decimals, because
///         the curve delivers exactly the reserve delta on every trade. Everything else
///         (TOTAL_SUPPLY - sold) goes to the pool, minus curve-favouring dust sent to DEAD.
contract GraduationIdentityTest is BaseTest {
    /// @dev Canonical case: the exact number the human reviewer should see reconciled.
    uint256 internal constant EXPECTED_SOLD_WHOLE = 794_786_904;

    function test_graduation_conservation_canonical() public {
        _deploySystem();
        MockStock stock = _newStock(18, 100e18); // NVDA ~ $100, 18 decimals
        _assertGraduationIdentities(stock, true);
    }

    /// @notice On-chain pool price == curve graduation price within 0.1%, across all three decimal
    ///         widths at realistic equity prices.
    function test_pool_price_realistic_cases() public {
        uint8[3] memory decs = [uint8(6), 8, 18];
        uint256[3] memory prices = [uint256(10), 250, 5000];
        for (uint256 i; i < 3; i++) {
            for (uint256 j; j < 3; j++) {
                _deploySystem();
                MockStock stock = _newStock(decs[i], prices[j] * 1e18);
                _assertGraduationIdentities(stock, true);
            }
        }
    }

    /// @notice Fuzz the exact conservation + math identities across decimals {6,8,18} and price $1..$5000.
    function testFuzz_graduation_conservation(uint8 decSel, uint256 priceWhole) public {
        uint8 dec = [6, 8, 18][uint256(decSel) % 3];
        priceWhole = bound(priceWhole, 1, 5000);
        _deploySystem();
        MockStock stock = _newStock(dec, priceWhole * 1e18);
        _assertGraduationIdentities(stock, false);
    }

    /// @dev Drive one token from launch to graduation and assert every conservation identity.
    ///      `checkOnChainPrice` runs the 0.1% on-chain pool-price check (only meaningful at
    ///      representable price scales).
    function _assertGraduationIdentities(MockStock stock, bool checkOnChainPrice) internal {
        (address token, address curve) = _launch(stock, 500, CreatorMode.BUYBACK_BURN, 0);
        TokenConfig memory cfg = ICOURCurve(curve).config();

        // The curve holds the entire supply at launch.
        assertEq(MockERC20(token).balanceOf(curve), Constants.TOTAL_SUPPLY, "curve holds full supply");

        // Size warm-up/big buys relative to the ACTUAL graduation raise (k/vTStop - vS0, gross estimate)
        // so this works across every decimals/price combo (fixed stock-unit sizes graduate early at high
        // price / low decimals).
        uint256 raise = cfg.k / cfg.vTStop - cfg.vS0; // ~ net stock needed to reach the stop
        uint256 warm = raise / 20 + 1; // each warm-up buy: well under the raise

        // A handful of ordinary buys/sells (these DO move the price and sell tokens).
        _buyCurve(curve, stock, alice, warm);
        _buyCurve(curve, stock, bob, warm);
        uint256 bobBal = MockERC20(token).balanceOf(bob);
        if (bobBal > 0) _sellCurve(curve, token, bob, bobBal / 2);

        // Big buy crosses the stop -> graduation in the same tx (with refund).
        uint256 big = raise * 2 + warm; // deliberately more than needed -> refund
        stock.mint(carol, big);
        vm.startPrank(carol);
        stock.approve(curve, big);
        (uint256 gotBig, uint256 used) = ICOURCurve(curve).buy(big, 0, carol, block.timestamp);
        vm.stopPrank();

        assertTrue(ICOURCurve(curve).graduated(), "graduated");
        assertLt(used, big, "refund on graduation");
        assertGt(gotBig, 0, "big buy delivered tokens");

        // -------- Identity 1: tokens sold == vT0 - vTStop (exact, price/decimals-independent) --------
        // Price/decimals-INDEPENDENT: sold is always vT0 - vTStop (= Q=15 constant). Pin it everywhere.
        uint256 sold = cfg.vT0 - cfg.vTStop;
        // Reviewer's figure is the rounded 794,786,904; the exact floor is 794,786,903.xx tokens.
        assertApproxEqAbs(sold, EXPECTED_SOLD_WHOLE * 1e18, 1e18, "sold ~= 794,786,904e18 (Q=15)");

        // The curve emptied out: no tokens and no stock stranded on the curve or factory.
        assertEq(MockERC20(token).balanceOf(curve), 0, "curve token balance drained");
        assertEq(stock.balanceOf(curve), 0, "curve stock balance drained");
        assertEq(MockERC20(token).balanceOf(address(factory)), 0, "factory holds no tokens");
        assertEq(stock.balanceOf(address(factory)), 0, "factory holds no stock");

        // -------- Identity 2: every token is accounted for (none vanish) --------
        // buyers hold exactly `sold`; pool + DEAD-dust hold exactly TOTAL_SUPPLY - sold.
        uint256 poolTokens = MockERC20(token).balanceOf(address(pm));
        uint256 deadTokens = MockERC20(token).balanceOf(Constants.DEAD);
        assertEq(poolTokens + deadTokens, Constants.TOTAL_SUPPLY - sold, "pool+dead == supply - sold");

        uint256 buyersHold =
            MockERC20(token).balanceOf(alice) + MockERC20(token).balanceOf(bob) + MockERC20(token).balanceOf(carol);
        assertEq(buyersHold, sold, "buyers hold exactly the sold amount");

        uint256 vsFinal = ICOURCurve(curve).vS();
        uint256 stockInPool = stock.balanceOf(address(pm));
        assertGt(poolTokens, 0, "pool received tokens");
        assertGt(stockInPool, 0, "pool received stock");

        // -------- Identity 3 (math, exact for all decimals/prices): leftover valued at the graduation
        // price EXACTLY equals the real stock raised -> the full-range LP is balanced at graduation.
        // Cross-multiplied to avoid precision loss: tokenLeftover * vsFinal == stockRaised * vTStop.
        uint256 tokenLeftoverExp = Constants.TOTAL_SUPPLY - sold;
        uint256 realStockRaised = vsFinal - cfg.vS0; // curve's real stock balance is exactly this
        assertApproxEqRel(
            tokenLeftoverExp * vsFinal, realStockRaised * cfg.vTStop, 1e12, "LP balanced: leftover*price==raised"
        );

        // -------- Identity 4: pool stock == real stock raised (minus the rounding dust swept to platform)
        assertLe(stockInPool, realStockRaised, "pool stock <= raised (dust swept out)");
        assertApproxEqRel(stockInPool, realStockRaised, 2e15, "pool stock ~= raised (0.2%)");

        // -------- Identity 3b (on-chain, realistic scales only): the actual pool spot price matches the
        // curve graduation price within 0.1%. At sub-representable micro prices (e.g. 6-dec stock < ~$10)
        // Uniswap's sqrtPriceX96 tick granularity -- not COUR -- dominates, so this is checked where the
        // price is representable (pinCanonical + the realistic-cases test below).
        if (checkOnChainPrice) {
            uint256 spotX18 = (vsFinal * 1e18) / cfg.vTStop;
            uint256 impliedX18 = (stockInPool * 1e18) / poolTokens;
            assertApproxEqRel(impliedX18, spotX18, 1e15, "pool price ~= curve price (0.1%)");
        }
    }
}
