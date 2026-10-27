// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {BaseTest} from "../utils/BaseTest.sol";
import {MockStock} from "../mocks/MockStock.sol";
import {MockERC20} from "../mocks/MockERC20.sol";
import {ICOURFactory} from "../../src/interfaces/ICOURFactory.sol";
import {ICOURCurve} from "../../src/interfaces/ICOURCurve.sol";
import {CreatorMode} from "../../src/types/CreatorMode.sol";
import {Errors} from "../../src/libraries/Errors.sol";

/// @notice Anti-snipe launch tax on the curve, and the tax-free creator initial buy.
contract LaunchTaxFlowTest is BaseTest {
    MockStock internal stock;

    function setUp() public {
        _deploySystem();
        stock = _newStock(18, 100e18);
    }

    function _launchNoWarp(uint256 initialBuy) internal returns (address token, address curve) {
        ICOURFactory.CreateParams memory p = ICOURFactory.CreateParams({
            name: "N",
            symbol: "S",
            metadataURI: "u",
            stock: address(stock),
            creatorFeeBps: 500,
            creatorMode: uint8(CreatorMode.CREATOR),
            feeRecipient: creator,
            initialBuyStock: initialBuy,
            minInitialTokens: 0,
            salt: keccak256(abi.encode(initialBuy))
        });
        if (initialBuy > 0) {
            stock.mint(creator, initialBuy);
            vm.prank(creator);
            stock.approve(address(factory), initialBuy);
        }
        vm.prank(creator);
        (token, curve) = factory.createToken(p);
    }

    function test_buy_in_first_second_reverts() public {
        (, address curve) = _launchNoWarp(0);
        // dt = 0: 99% tax + 5% fee > 100% -> clean revert.
        stock.mint(alice, 10e18);
        vm.startPrank(alice);
        stock.approve(curve, 10e18);
        vm.expectRevert(Errors.ZeroAmount.selector);
        ICOURCurve(curve).buy(10e18, 0, alice, block.timestamp);
        vm.stopPrank();
    }

    function test_tax_decays_more_tokens_later() public {
        (, address curveA) = _launchNoWarp(0);
        // Buy at dt=2 (tax ~4.62%).
        vm.warp(block.timestamp + 2);
        uint256 gotEarly = _buyCurve(curveA, stock, alice, 10e18);

        // Fresh launch, buy same size after the window (no tax).
        (, address curveB) = _launchNoWarp(0);
        vm.warp(block.timestamp + 10);
        uint256 gotLate = _buyCurve(curveB, stock, bob, 10e18);

        assertLt(gotEarly, gotLate, "in-window buy taxed -> fewer tokens");
    }

    function test_initial_buy_is_tax_free() public {
        // Initial buy executes atomically at dt=0 but is tax-free (fee still applies).
        (address token, address curve) = _launchNoWarp(10e18);
        uint256 creatorTokens = MockERC20(token).balanceOf(creator);
        assertGt(creatorTokens, 0, "creator received initial tokens tax-free");

        // Compare: a normal dt=0 buy would have reverted; after window a 10-stock buy yields a similar order.
        vm.warp(block.timestamp + 10);
        uint256 normal = _buyCurve(curve, stock, alice, 10e18);
        // Initial buy (first on curve, lower price) should yield MORE tokens than a later same-size buy.
        assertGt(creatorTokens, normal, "earlier tax-free buy cheaper");
    }
}
