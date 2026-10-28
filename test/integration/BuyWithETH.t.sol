// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { Errors } from "../../src/libraries/Errors.sol";
import { CreatorMode } from "../../src/types/CreatorMode.sol";
import { MockERC20 } from "../mocks/MockERC20.sol";
import { MockStock } from "../mocks/MockStock.sol";
import { BaseTest } from "../utils/BaseTest.sol";

/// @notice §2.4: buyWithETH routes ETH -> WETH -> (v3 multi-hop, configured path) -> stock -> token,
///         enforces slippage/deadline, and refunds every residual (local, MockV3Router + MockWETH).
contract BuyWithETHTest is BaseTest {
    MockStock internal stock;
    address internal token;
    address internal usdg = makeAddr("USDG");

    function setUp() public {
        _deploySystem();
        stock = _newStock(18, 100e18);
        (token,) = _launch(stock, 500, CreatorMode.CREATOR, 0); // warps +6 past the anti-snipe window
    }

    function _setMultiHop() internal {
        // WETH -(0.01%)- USDG -(0.05%)- stock (the mock only reads the endpoints).
        bytes memory path = abi.encodePacked(address(weth), uint24(100), usdg, uint24(500), address(stock));
        vm.prank(admin);
        router.setEthInPath(address(stock), path);
    }

    function test_buyWithETH_multihop_refunds_nothing_left() public {
        _setMultiHop();
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        uint256 got = router.buyWithETH{ value: 0.5 ether }(token, 0, block.timestamp);

        assertGt(got, 0, "received tokens");
        assertEq(MockERC20(token).balanceOf(alice), got, "tokens to buyer");
        // Router custodies nothing.
        assertEq(stock.balanceOf(address(router)), 0, "no stock left");
        assertEq(MockERC20(token).balanceOf(address(router)), 0, "no token left");
        assertEq(weth.balanceOf(address(router)), 0, "no WETH left");
        assertEq(address(router).balance, 0, "no ETH left");
    }

    function test_buyWithETH_direct_fallback() public {
        // Direct WETH -> stock path (the §2.4 fallback when no USDG route is configured).
        bytes memory path = abi.encodePacked(address(weth), uint24(500), address(stock));
        vm.prank(admin);
        router.setEthInPath(address(stock), path);
        vm.deal(bob, 1 ether);
        vm.prank(bob);
        uint256 got = router.buyWithETH{ value: 0.3 ether }(token, 0, block.timestamp);
        assertGt(got, 0);
        assertEq(MockERC20(token).balanceOf(bob), got);
    }

    function test_buyWithETH_path_not_configured() public {
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        vm.expectRevert(Errors.PathNotConfigured.selector);
        router.buyWithETH{ value: 0.1 ether }(token, 0, block.timestamp);
    }

    function test_buyWithETH_slippage() public {
        _setMultiHop();
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        vm.expectRevert(Errors.Slippage.selector);
        router.buyWithETH{ value: 0.5 ether }(token, type(uint256).max, block.timestamp);
    }

    function test_buyWithETH_expired() public {
        _setMultiHop();
        vm.deal(alice, 1 ether);
        vm.warp(block.timestamp + 100);
        vm.prank(alice);
        vm.expectRevert(Errors.Expired.selector);
        router.buyWithETH{ value: 0.5 ether }(token, 0, block.timestamp - 1);
    }

    function test_buyWithETH_zero_value() public {
        _setMultiHop();
        vm.prank(alice);
        vm.expectRevert(Errors.ZeroAmount.selector);
        router.buyWithETH{ value: 0 }(token, 0, block.timestamp);
    }

    function test_setEthInPath_only_owner() public {
        bytes memory path = abi.encodePacked(address(weth), uint24(500), address(stock));
        vm.prank(alice);
        vm.expectRevert();
        router.setEthInPath(address(stock), path);
    }
}
