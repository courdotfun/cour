// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { ICOURCurve } from "../../src/interfaces/ICOURCurve.sol";
import { Constants } from "../../src/libraries/Constants.sol";
import { CreatorMode } from "../../src/types/CreatorMode.sol";
import { MockERC20 } from "../mocks/MockERC20.sol";
import { MockStock } from "../mocks/MockStock.sol";
import { BaseTest } from "../utils/BaseTest.sol";

contract SmokeTest is BaseTest {
    function setUp() public {
        _deploySystem();
    }

    function test_deploy_wired() public view {
        assertEq(address(factory.feeVault()), address(vault));
        assertEq(factory.hook(), address(hook));
        assertTrue(uint160(address(hook)) & 0x3FFF != 0);
    }

    function test_launch_and_buy() public {
        MockStock stock = _newStock(18, 100e18); // $100 stock
        (address token, address curve) = _launch(stock, 500, CreatorMode.CREATOR, 0);

        assertEq(MockERC20(token).totalSupply(), Constants.TOTAL_SUPPLY);
        assertEq(MockERC20(token).balanceOf(curve), Constants.TOTAL_SUPPLY);

        uint256 got = _buyCurve(curve, stock, alice, 10 * 1e18); // 10 stock in
        assertGt(got, 0);
        assertEq(MockERC20(token).balanceOf(alice), got);
        // fee accrued to vault (CREATOR mode)
        assertGt(vault.creatorOwed(token), 0);
    }

    function test_buy_then_sell_no_free_money() public {
        MockStock stock = _newStock(18, 100e18);
        (address token, address curve) = _launch(stock, 300, CreatorMode.CREATOR, 0);

        uint256 got = _buyCurve(curve, stock, alice, 100e18);
        uint256 back = _sellCurve(curve, token, alice, got);
        // Round-trip must lose money (fees + curve rounding): back < 100 stock in.
        assertLt(back, 100e18);
    }
}
