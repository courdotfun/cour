// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { ICOURCurve } from "../../src/interfaces/ICOURCurve.sol";
import { Constants } from "../../src/libraries/Constants.sol";
import { CreatorMode } from "../../src/types/CreatorMode.sol";
import { TokenConfig } from "../../src/types/TokenConfig.sol";
import { MockERC20 } from "../mocks/MockERC20.sol";
import { MockStock } from "../mocks/MockStock.sol";
import { BaseTest } from "../utils/BaseTest.sol";

/// @notice L-4 hardening proof: the initial graduation pool price and LP size are derived from the curve's
///         INTERNAL accounting (vS0/vTStop/k), NOT from `balanceOf`. Therefore stock/token DONATED to the
///         curve before graduation cannot move the pool price or inflate the burned LP — the donated excess
///         is routed to the platform bucket (stock) / DEAD (tokens) instead.
contract GraduationDonationTest is BaseTest {
    function setUp() public {
        _deploySystem();
    }

    /// Donate both stock AND tokens to the curve just before graduation, then assert the on-chain pool price
    /// still equals the curve graduation price (within 0.1%) and donations were swept, not added to the LP.
    function test_donation_does_not_move_pool_price_or_inflate_lp() public {
        MockStock stock = _newStock(18, 100e18); // NVDA ~ $100
        (address token, address curve) = _launch(stock, 500, CreatorMode.BUYBACK_BURN, 0);
        TokenConfig memory cfg = ICOURCurve(curve).config();
        uint256 raise = cfg.k / cfg.vTStop - cfg.vS0;

        // Warm the curve, and give alice some tokens to donate from.
        _buyCurve(curve, stock, alice, raise / 10 + 1);
        uint256 aliceTokens = MockERC20(token).balanceOf(alice);
        assertGt(aliceTokens, 0);

        // ---- DONATIONS (pushed straight to the curve, bypassing buy/sell accounting) ----
        uint256 stockDonation = raise / 4 + 123e18; // sizeable, well above dust
        MockStock(address(stock)).mint(address(this), stockDonation);
        IERC20(address(stock)).transfer(curve, stockDonation);

        uint256 tokenDonation = aliceTokens / 2;
        vm.prank(alice);
        MockERC20(token).transfer(curve, tokenDonation);

        // Sanity: the curve now holds MORE than its accounting (donations present).
        uint256 acctStockPre = ICOURCurve(curve).vS() - cfg.vS0;
        assertGt(stock.balanceOf(curve), acctStockPre, "stock donation inflates curve balanceOf");

        uint256 platBefore = vault.platformOwed(address(stock));
        uint256 deadTokBefore = MockERC20(token).balanceOf(Constants.DEAD);

        // ---- GRADUATE ----
        uint256 big = raise * 2;
        stock.mint(carol, big);
        vm.startPrank(carol);
        stock.approve(curve, big);
        ICOURCurve(curve).buy(big, 0, carol, block.timestamp);
        vm.stopPrank();
        assertTrue(ICOURCurve(curve).graduated(), "graduated");

        // ---- price check: pool spot == curve graduation price within 0.1%, donations notwithstanding ----
        uint256 vsFinal = ICOURCurve(curve).vS();
        uint256 poolTokens = MockERC20(token).balanceOf(address(pm));
        uint256 poolStock = stock.balanceOf(address(pm));
        uint256 curvePriceX18 = (vsFinal * 1e18) / cfg.vTStop;
        uint256 poolPriceX18 = (poolStock * 1e18) / poolTokens;
        assertApproxEqRel(poolPriceX18, curvePriceX18, 1e15, "pool price == curve price (0.1%) despite donation");

        // ---- LP is sized from accounting, not balanceOf: pool stock ~= accounting raise (NOT + donation) --
        uint256 realStockRaised = vsFinal - cfg.vS0;
        assertApproxEqRel(poolStock, realStockRaised, 2e15, "pool stock ~= accounting raise (donation excluded)");
        assertLt(poolStock, realStockRaised + stockDonation, "donation did NOT enter the pool");

        // ---- donations were swept out: stock -> platform bucket, tokens -> DEAD ----
        // platGain = swept stock (donation + LP rounding remainder) + the graduating buy's platform fee
        // share (credited after this snapshot). It must therefore be AT LEAST the donation, and the swept
        // portion exactly reconciles via conservation below.
        uint256 platGain = vault.platformOwed(address(stock)) - platBefore;
        assertGe(platGain, stockDonation, "platform bucket captured at least the stock donation");

        // Conservation: every unit of stock the factory pulled from the curve (accounting raise + donation)
        // either went into the pool or was swept to the platform bucket — none lost, and the swept amount
        // strictly exceeds the donation (donation + LP rounding remainder). The pool-size assert above
        // already proves the donation (>> 0.2% of the raise) is NOT in the LP.
        uint256 sweptStock = realStockRaised + stockDonation - poolStock;
        assertGt(sweptStock, stockDonation, "swept stock exceeds donation by the LP rounding remainder");

        uint256 deadTokGain = MockERC20(token).balanceOf(Constants.DEAD) - deadTokBefore;
        assertGe(deadTokGain, tokenDonation, "token donation routed to DEAD (plus any rounding dust)");

        // ---- nothing stranded on curve/factory ----
        assertEq(stock.balanceOf(curve), 0, "curve stock drained");
        assertEq(MockERC20(token).balanceOf(curve), 0, "curve token drained");
        assertEq(stock.balanceOf(address(factory)), 0, "factory holds no stock");
        assertEq(MockERC20(token).balanceOf(address(factory)), 0, "factory holds no tokens");
    }

    /// Fuzz: across decimals/prices and donation sizes, the pool price stays pinned to the curve price.
    function testFuzz_donation_price_invariant(uint8 decSel, uint256 priceWhole, uint256 donSeed) public {
        uint8 dec = [6, 8, 18][uint256(decSel) % 3];
        priceWhole = bound(priceWhole, 1, 5000);
        MockStock stock = _newStock(dec, priceWhole * 1e18);
        (, address curve) = _launch(stock, 500, CreatorMode.BUYBACK_BURN, 0);
        TokenConfig memory cfg = ICOURCurve(curve).config();
        uint256 raise = cfg.k / cfg.vTStop - cfg.vS0;

        // Donate a bounded amount of stock to the curve.
        uint256 stockDonation = bound(donSeed, 0, raise * 3 + 1);
        if (stockDonation > 0) {
            MockStock(address(stock)).mint(address(this), stockDonation);
            IERC20(address(stock)).transfer(curve, stockDonation);
        }

        uint256 big = raise * 2 + 1;
        stock.mint(carol, big);
        vm.startPrank(carol);
        stock.approve(curve, big);
        ICOURCurve(curve).buy(big, 0, carol, block.timestamp);
        vm.stopPrank();
        assertTrue(ICOURCurve(curve).graduated(), "graduated");

        uint256 vsFinal = ICOURCurve(curve).vS();
        uint256 poolStock = stock.balanceOf(address(pm));
        uint256 realStockRaised = vsFinal - cfg.vS0;
        // Pool stock reflects accounting, never the donation.
        assertApproxEqRel(poolStock, realStockRaised, 3e15, "pool stock tracks accounting, not donation");
        assertEq(stock.balanceOf(curve), 0, "curve stock drained");
        assertEq(stock.balanceOf(address(factory)), 0, "factory stock drained");
    }
}
