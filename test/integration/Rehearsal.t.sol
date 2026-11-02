// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { ICOURCurve } from "../../src/interfaces/ICOURCurve.sol";
import { ICOURFactory } from "../../src/interfaces/ICOURFactory.sol";
import { Constants } from "../../src/libraries/Constants.sol";
import { CreatorMode } from "../../src/types/CreatorMode.sol";
import { TokenConfig } from "../../src/types/TokenConfig.sol";
import { MockERC20 } from "../mocks/MockERC20.sol";
import { MockStock } from "../mocks/MockStock.sol";
import { BaseTest } from "../utils/BaseTest.sol";
import { FixedPointMathLib } from "solady/utils/FixedPointMathLib.sol";

/// @notice Always-runnable launch rehearsal (local, mock-paired). Writes a FULL step-by-step human
///         summary to docs/REHEARSAL_RESULT.md implementing docs §2.1: EVERY trade is logged (initial
///         buy, the blocked dt=0 sniper, the decaying-tax snipers, the 20 random buys/sells, and the
///         graduating big buy) with dt / gross / fee / tax / net / tokensOut / vS / vT / progress / mcap,
///         so a human can reconcile each number with a calculator. It also asserts the conservation
///         identities that explain the previously-"missing" ~36.75M tokens: they were simply the 20
///         random trades that the old summary table never printed. Fork variant:
///         script/03_LaunchRehearsal.s.sol.
contract RehearsalTest is BaseTest {
    MockStock internal stock;
    address internal token;
    address internal curve;
    uint256 internal constant STOCK_USD_X18 = 100e18; // mock NVDA @ $100
    uint8 internal constant STOCK_DEC = 18;

    string internal _md;
    uint256 internal _step;
    uint64 internal _launchedAt;

    // cross-phase results (kept in storage to avoid stack-too-deep in the main flow)
    bool internal _dt0Reverts;
    bool internal _graduated;
    uint256 internal _used;
    uint256 internal _sold;
    uint256 internal _buyersHold;
    uint256 internal _burned;
    uint256 internal _poolBuyOut;
    uint256 internal _poolSellOut;
    uint256 internal _platformOwed;

    function test_rehearsal() public {
        _deploySystem();
        stock = _newStock(STOCK_DEC, STOCK_USD_X18);
        _writeHeader();
        _phaseLaunch();
        _phaseSnipers();
        _phaseRandom();
        _phaseBigBuy();
        _phaseReconcile();
        _phasePostGrad();
        vm.writeFile("docs/REHEARSAL_RESULT.md", _md);
        _assertAll();
    }

    // ---------------------------------------------------------------- phases

    function _writeHeader() internal {
        _md = "# COUR Launch Rehearsal Result (local, mock NVDA @ $100)\n\n";
        _md = string.concat(
            _md, "Token: CTEST / mNVDA | fee 5% | mode BUYBACK_BURN | start $4,000 -> grad $60,000 mcap\n\n"
        );
        _md = string.concat(
            _md,
            "Every trade is shown so the numbers reconcile. Units: stock & tokens in WHOLE units (/1e18). ",
            "`net` = net stock into the curve (buys) or net stock paid out (sells, shown as -). ",
            "`tokensOut` = tokens delivered (buys) or tokens sold back (sells, shown as -). ",
            "`dt` = seconds since launch. `prog%` = curve progress. `mcap$` = fully-diluted mcap USD.\n\n"
        );
        _md = string.concat(
            _md,
            "| # | action | dt | gross | fee | tax | net | tokensOut | vS | vT | prog% | mcap$ |\n",
            "|--|--|--|--|--|--|--|--|--|--|--|--|\n"
        );
    }

    function _phaseLaunch() internal {
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
        _launchedAt = ICOURCurve(curve).config().launchedAt;
        _logState("launch+initialBuy(15, tax-free)", 15e18, 0, 0, MockERC20(token).balanceOf(creator), true);
    }

    function _phaseSnipers() internal {
        // dt=0 sniper rejected (99% tax + fee > 100%).
        stock.mint(alice, 5e18);
        vm.startPrank(alice);
        stock.approve(curve, 5e18);
        try ICOURCurve(curve).buy(5e18, 0, alice, block.timestamp) { }
        catch {
            _dt0Reverts = true;
        }
        vm.stopPrank();
        _md = string.concat(
            _md, "| ", _u(++_step), " | dt=0 sniper BLOCKED (revert) | 0 | 5 | - | - | - | - | - | - | - |\n"
        );

        vm.warp(block.timestamp + 1);
        _buyLogged(alice, 5e18, "buy sniper dt=1");
        vm.warp(block.timestamp + 1);
        _buyLogged(bob, 5e18, "buy sniper dt=2");
        vm.warp(block.timestamp + 4); // past window
        _buyLogged(carol, 5e18, "buy dt>=5 (no tax)");
    }

    function _phaseRandom() internal {
        // 20 small random buys/sells = the previously-UNREPORTED step-4c trades.
        for (uint256 i; i < 20; i++) {
            if (i % 2 == 0) {
                _buyLogged(alice, 1e18, string.concat("random buy #", _u(i)));
            } else {
                uint256 bal = MockERC20(token).balanceOf(bob);
                if (bal > 0) _sellLogged(bob, bal / 4 + 1, string.concat("random sell #", _u(i)));
            }
        }
    }

    function _phaseBigBuy() internal {
        uint256 big = 2_000e18;
        stock.mint(alice, big);
        vm.startPrank(alice);
        stock.approve(curve, big);
        (uint256 gotBig, uint256 used) = ICOURCurve(curve).buy(big, 0, alice, block.timestamp);
        vm.stopPrank();
        _used = used;
        _graduated = ICOURCurve(curve).graduated();
        _logState(
            string.concat("BIG BUY -> GRADUATE (used ", _u(used / 1e18), " of 2000, refund rest)"),
            big,
            0,
            0,
            gotBig,
            true
        );
    }

    function _phaseReconcile() internal {
        TokenConfig memory cfg = ICOURCurve(curve).config();
        _sold = cfg.vT0 - cfg.vTStop;
        uint256 poolTokens = MockERC20(token).balanceOf(address(pm));
        uint256 deadTokens = MockERC20(token).balanceOf(Constants.DEAD);
        _buyersHold = MockERC20(token).balanceOf(creator) + MockERC20(token).balanceOf(alice)
            + MockERC20(token).balanceOf(bob) + MockERC20(token).balanceOf(carol);
        _md = string.concat(
            _md,
            "\n### Token reconciliation at graduation\n\n",
            "- Total sold on the curve (= `vT0 - vTStop`): **",
            _u(_sold / 1e18),
            "** whole tokens (the invariant ~794,786,904 the OLD report under-counted by ~36.75M).\n",
            "- Held by all buyers (creator+alice+bob+carol): **",
            _u(_buyersHold / 1e18),
            "**  (== total sold).\n"
        );
        _md = string.concat(
            _md,
            "- Into the v4 pool: **",
            _u(poolTokens / 1e18),
            "**, burned-to-DEAD dust: **",
            _u(deadTokens),
            "** (raw).\n",
            "- Identity: pool + DEAD == TOTAL_SUPPLY - sold == ",
            _u((Constants.TOTAL_SUPPLY - _sold) / 1e18),
            " whole tokens. No tokens are lost.\n"
        );
    }

    function _phasePostGrad() internal {
        // L-2: post-graduation buyback requires a full TWAP window; let it elapse.
        vm.warp(block.timestamp + Constants.HOOK_TWAP_WINDOW + 1);
        uint256 deadBefore = MockERC20(token).balanceOf(Constants.DEAD);
        uint256 buybackOwed = vault.buybackOwed(token);
        uint256 req = buybackOwed < 1e18 ? buybackOwed : 1e18;
        vm.prank(creator);
        (, _burned) = vault.executeBuyback(token, req, 0);
        uint256 deadAfter = MockERC20(token).balanceOf(Constants.DEAD);
        require(deadAfter - deadBefore == _burned, "burn sink");

        uint256 poolIn = 20e18;
        stock.mint(bob, poolIn);
        vm.startPrank(bob);
        stock.approve(address(router), poolIn);
        _poolBuyOut = router.buy(token, poolIn, 0, block.timestamp);
        MockERC20(token).approve(address(router), _poolBuyOut);
        _poolSellOut = router.sell(token, _poolBuyOut, 0, block.timestamp);
        vm.stopPrank();

        _platformOwed = vault.platformOwed(address(stock));
        vault.claimPlatform(address(stock));

        _md = string.concat(
            _md,
            "\n### Post-graduation\n\n| Step | Value |\n|--|--|\n",
            "| dt=0 sniper blocked | ",
            _dt0Reverts ? "yes" : "no",
            " |\n| Pool buy (20 NVDA) tokens out | ",
            _u(_poolBuyOut / 1e18),
            " |\n| Pool sell stock out | ",
            _u(_poolSellOut / 1e18),
            " |\n| Tokens burned via buyback | ",
            _u(_burned / 1e18),
            " |\n| Platform fees claimed (NVDA) | ",
            _u(_platformOwed / 1e18),
            " |\n\nGenerated by test/integration/Rehearsal.t.sol (forge test --match-test test_rehearsal).\n"
        );
    }

    function _assertAll() internal view {
        assertTrue(_dt0Reverts, "dt=0 blocked");
        assertTrue(_graduated, "graduated");
        assertLt(_used, 2_000e18, "refund on graduation");
        assertApproxEqAbs(_sold / 1e18, 794_786_904, 1, "sold ~= 794,786,904 whole tokens");
        assertEq(_buyersHold, _sold, "buyers hold exactly the sold amount");
        assertEq(
            MockERC20(token).balanceOf(address(pm)) + MockERC20(token).balanceOf(Constants.DEAD),
            Constants.TOTAL_SUPPLY - _sold,
            "pool+dead == supply - sold"
        );
        assertEq(MockERC20(token).balanceOf(curve), 0, "curve drained");
        assertGt(_poolBuyOut, 0);
        assertGt(_poolSellOut, 0);
        assertGt(_burned, 0, "buyback burned tokens");
        assertGt(_platformOwed, 0);
    }

    // ---------------------------------------------------------------- logging helpers

    function _buyLogged(address user, uint256 gross, string memory label) internal returns (uint256 tokensOut) {
        (, uint256 fee, uint256 tax) = ICOURCurve(curve).quoteBuy(gross);
        stock.mint(user, gross);
        vm.startPrank(user);
        stock.approve(curve, gross);
        (tokensOut,) = ICOURCurve(curve).buy(gross, 0, user, block.timestamp);
        vm.stopPrank();
        _logState(label, gross, fee, tax, tokensOut, true);
    }

    function _sellLogged(address user, uint256 tokensIn, string memory label) internal returns (uint256 stockOut) {
        (uint256 net, uint256 fee) = ICOURCurve(curve).quoteSell(tokensIn);
        vm.startPrank(user);
        MockERC20(token).approve(curve, tokensIn);
        stockOut = ICOURCurve(curve).sell(tokensIn, 0, user, block.timestamp);
        vm.stopPrank();
        _logState(label, tokensIn, fee, 0, net, false);
    }

    /// @dev Append one fully-detailed row. `isBuy` toggles the sign conventions in the net/tokensOut cols.
    function _logState(string memory label, uint256 gross, uint256 fee, uint256 tax, uint256 outAmt, bool isBuy)
        internal
    {
        uint256 vS_ = ICOURCurve(curve).vS();
        uint256 vT_ = ICOURCurve(curve).vT();
        uint256 prog = ICOURCurve(curve).graduated() ? Constants.BPS : ICOURCurve(curve).progressBps();
        _md = string.concat(
            _md,
            "| ",
            _u(++_step),
            " | ",
            label,
            " | ",
            _u(block.timestamp - _launchedAt),
            " | ",
            _u(gross / 1e18),
            " | ",
            _u(fee / 1e18),
            " | ",
            _u(tax / 1e18),
            " | "
        );
        _md = string.concat(
            _md,
            isBuy ? _u((gross - fee - tax) / 1e18) : string.concat("-", _u(outAmt / 1e18)),
            " | ",
            isBuy ? _u(outAmt / 1e18) : string.concat("-", _u(gross / 1e18)),
            " | ",
            _u(vS_ / 1e18),
            " | ",
            _u(vT_ / 1e18),
            " | ",
            _bpsToPct(prog),
            " | ",
            _u(_mcapUsd(vS_, vT_)),
            " |\n"
        );
    }

    function _mcapUsd(uint256 vS_, uint256 vT_) internal pure returns (uint256) {
        uint256 pStockRawPerWhole = FixedPointMathLib.fullMulDiv(vS_, 1e18, vT_);
        uint256 pUsdX18 = FixedPointMathLib.fullMulDiv(pStockRawPerWhole, STOCK_USD_X18, 10 ** uint256(STOCK_DEC));
        return FixedPointMathLib.fullMulDiv(pUsdX18, 1_000_000_000, 1e18);
    }

    function _bpsToPct(uint256 bps) internal pure returns (string memory) {
        return string.concat(_u(bps / 100), ".", _u((bps % 100) / 10), _u(bps % 10));
    }

    function _u(uint256 x) internal pure returns (string memory) {
        return vm.toString(x);
    }
}
