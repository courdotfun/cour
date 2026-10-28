// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { ICOURFactory } from "../../src/interfaces/ICOURFactory.sol";
import { ICOURPriceReader } from "../../src/interfaces/ICOURPriceReader.sol";
import { Errors } from "../../src/libraries/Errors.sol";
import { CreatorMode } from "../../src/types/CreatorMode.sol";
import { TokenConfig } from "../../src/types/TokenConfig.sol";
import { MockStock } from "../mocks/MockStock.sol";
import { BaseTest } from "../utils/BaseTest.sol";

contract AdminTest is BaseTest {
    MockStock internal stock;

    function setUp() public {
        _deploySystem();
        stock = new MockStock("S", "S", 18);
        oracle.setPrice(address(stock), 100e18);
        oracle.setLiq(address(stock), 1_000_000);
    }

    function _params(address s, uint16 fee, uint8 mode, uint256 initBuy)
        internal
        view
        returns (ICOURFactory.CreateParams memory p)
    {
        p = ICOURFactory.CreateParams({
            name: "N",
            symbol: "SY",
            metadataURI: "u",
            stock: s,
            creatorFeeBps: fee,
            creatorMode: mode,
            feeRecipient: creator,
            initialBuyStock: initBuy,
            minInitialTokens: 0,
            salt: keccak256(abi.encode(s, fee, mode, initBuy))
        });
    }

    function test_stock_not_allowed() public {
        vm.prank(creator);
        vm.expectRevert(Errors.StockNotAllowed.selector);
        factory.createToken(_params(address(stock), 500, 0, 0));
    }

    function test_fee_out_of_range() public {
        vm.prank(admin);
        factory.setStock(address(stock), true, address(0), ICOURPriceReader.RefKind.NONE);
        vm.prank(creator);
        vm.expectRevert(Errors.FeeOutOfRange.selector);
        factory.createToken(_params(address(stock), 50, 0, 0)); // < 1%
        vm.prank(creator);
        vm.expectRevert(Errors.FeeOutOfRange.selector);
        factory.createToken(_params(address(stock), 1500, 0, 0)); // > 10%
    }

    function test_wrong_mode() public {
        vm.prank(admin);
        factory.setStock(address(stock), true, address(0), ICOURPriceReader.RefKind.NONE);
        vm.prank(creator);
        vm.expectRevert(Errors.WrongMode.selector);
        factory.createToken(_params(address(stock), 500, 4, 0)); // mode 4 invalid
    }

    function test_wrong_launch_fee() public {
        vm.prank(admin);
        factory.setStock(address(stock), true, address(0), ICOURPriceReader.RefKind.NONE);
        vm.deal(creator, 1 ether);
        vm.prank(creator);
        vm.expectRevert(Errors.WrongLaunchFee.selector);
        factory.createToken{ value: 1 }(_params(address(stock), 500, 0, 0));
    }

    function test_thin_reference_pool() public {
        oracle.setLiq(address(stock), 10); // below $50k floor
        vm.prank(admin);
        factory.setStock(address(stock), true, address(0), ICOURPriceReader.RefKind.NONE);
        vm.prank(creator);
        vm.expectRevert(Errors.ThinReferencePool.selector);
        factory.createToken(_params(address(stock), 500, 0, 0));
    }

    function test_launches_paused() public {
        vm.startPrank(admin);
        factory.setStock(address(stock), true, address(0), ICOURPriceReader.RefKind.NONE);
        factory.setLaunchesPaused(true);
        vm.stopPrank();
        vm.prank(creator);
        vm.expectRevert(Errors.LaunchesPaused.selector);
        factory.createToken(_params(address(stock), 500, 0, 0));
    }

    function test_initial_buy_too_large() public {
        vm.prank(admin);
        factory.setStock(address(stock), true, address(0), ICOURPriceReader.RefKind.NONE);
        // Enormous initial buy -> would exceed 50% / graduate -> clean revert.
        uint256 huge = 1_000_000e18;
        stock.mint(creator, huge);
        vm.prank(creator);
        stock.approve(address(factory), huge);
        vm.prank(creator);
        vm.expectRevert(Errors.InitialBuyTooLarge.selector);
        factory.createToken(_params(address(stock), 500, 0, huge));
    }

    function test_only_owner_admin() public {
        vm.prank(alice);
        vm.expectRevert();
        factory.setStock(address(stock), true, address(0), ICOURPriceReader.RefKind.NONE);
        vm.prank(alice);
        vm.expectRevert();
        factory.setLaunchesPaused(true);
    }

    function test_launch_allowlist() public {
        vm.startPrank(admin);
        factory.setStock(address(stock), true, address(0), ICOURPriceReader.RefKind.NONE);
        factory.setLaunchAllowlistEnabled(true);
        vm.stopPrank();
        assertTrue(factory.launchAllowlistEnabled(), "enabled");

        // Creator not on the allowlist -> revert.
        vm.prank(creator);
        vm.expectRevert(Errors.NotAllowlisted.selector);
        factory.createToken(_params(address(stock), 500, 0, 0));

        // Allowlist the creator -> launch succeeds.
        vm.prank(admin);
        factory.setLaunchAllowlist(creator, true);
        assertTrue(factory.launchAllowlist(creator), "allowlisted");
        vm.prank(creator);
        (address token, address curve) = factory.createToken(_params(address(stock), 500, 0, 0));
        assertTrue(token != address(0), "launched");

        // Allowlist gates LAUNCHES ONLY: a non-allowlisted user can still TRADE the existing token.
        vm.warp(block.timestamp + 6); // past the anti-snipe window
        uint256 got = _buyCurve(curve, stock, bob, 1e18);
        assertGt(got, 0, "trading unaffected by allowlist");

        // Disabling the allowlist lets anyone launch again.
        vm.prank(admin);
        factory.setLaunchAllowlistEnabled(false);
        assertFalse(factory.launchAllowlistEnabled(), "disabled");
        vm.prank(bob);
        (address t2,) = factory.createToken(_params(address(stock), 600, 0, 0));
        assertTrue(t2 != address(0), "open launch");
    }

    function test_allowlist_only_owner() public {
        vm.prank(alice);
        vm.expectRevert();
        factory.setLaunchAllowlist(alice, true);
        vm.prank(alice);
        vm.expectRevert();
        factory.setLaunchAllowlistEnabled(false);
    }

    function test_admin_cannot_change_existing_token() public {
        vm.prank(admin);
        factory.setStock(address(stock), true, address(0), ICOURPriceReader.RefKind.NONE);
        vm.prank(creator);
        (address token,) = factory.createToken(_params(address(stock), 700, 2, 0));
        TokenConfig memory before = factory.tokenConfig(token);

        // Change global launch params; existing token config must be untouched.
        vm.prank(admin);
        factory.setLaunchParams(8_000, 120_000, 100_000, 0);
        TokenConfig memory afterCfg = factory.tokenConfig(token);
        assertEq(afterCfg.creatorFeeBps, before.creatorFeeBps);
        assertEq(uint8(afterCfg.mode), uint8(before.mode));
        assertEq(afterCfg.vS0, before.vS0);
        assertEq(afterCfg.vTStop, before.vTStop);
    }
}
