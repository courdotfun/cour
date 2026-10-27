// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { ICOURCurve } from "../../src/interfaces/ICOURCurve.sol";
import { Constants } from "../../src/libraries/Constants.sol";
import { CreatorMode } from "../../src/types/CreatorMode.sol";
import { MockERC20 } from "../mocks/MockERC20.sol";
import { MockStock } from "../mocks/MockStock.sol";
import { BaseTest } from "../utils/BaseTest.sol";

/// @notice Fuzz across stock decimals {6,8,18}, USD price $1..$5000, fee 100..1000 bps, random sizes.
contract CurveFuzzTest is BaseTest {
    function setUp() public {
        _deploySystem();
    }

    function _mkStock(uint256 decSeed, uint256 priceUsd) internal returns (MockStock s, uint8 d) {
        uint8[3] memory ds = [6, 8, 18];
        d = ds[decSeed % 3];
        uint256 priceX18 = bound(priceUsd, 1, 5000) * 1e18;
        s = _newStock(d, priceX18);
    }

    function testFuzz_no_free_money(uint256 decSeed, uint256 priceUsd, uint16 feeSeed, uint256 amtSeed) public {
        (MockStock stock, uint8 d) = _mkStock(decSeed, priceUsd);
        uint16 feeBps = uint16(bound(feeSeed, 100, 1000));
        (address token, address curve) = _launch(stock, feeBps, CreatorMode.CREATOR, 0);

        // Modest buy (avoid graduation): 0.001 .. 50 whole stock.
        uint256 stockIn = bound(amtSeed, 10 ** uint256(d) / 1000 + 1, 50 * 10 ** uint256(d));
        stock.mint(alice, stockIn);
        vm.startPrank(alice);
        stock.approve(curve, stockIn);
        (uint256 tokensOut,) = ICOURCurve(curve).buy(stockIn, 0, alice, block.timestamp);
        vm.stopPrank();
        if (tokensOut == 0 || ICOURCurve(curve).graduated()) return;

        vm.startPrank(alice);
        MockERC20(token).approve(curve, tokensOut);
        uint256 back = ICOURCurve(curve).sell(tokensOut, 0, alice, block.timestamp);
        vm.stopPrank();

        // Round trip must never profit.
        assertLe(back, stockIn, "no free money");
    }

    function testFuzz_supply_constant(uint256 decSeed, uint256 priceUsd, uint256 amtSeed) public {
        (MockStock stock, uint8 d) = _mkStock(decSeed, priceUsd);
        (address token, address curve) = _launch(stock, 500, CreatorMode.CREATOR, 0);
        uint256 stockIn = bound(amtSeed, 10 ** uint256(d), 100 * 10 ** uint256(d));
        _buyCurve(curve, stock, alice, stockIn);
        assertEq(MockERC20(token).totalSupply(), Constants.TOTAL_SUPPLY);
    }

    function testFuzz_graduation_solvency(uint256 decSeed, uint256 priceUsd) public {
        (MockStock stock, uint8 d) = _mkStock(decSeed, priceUsd);
        (address token, address curve) = _launch(stock, 500, CreatorMode.CREATOR, 0);

        // Big buy to graduate.
        uint256 stockIn = 100_000 * 10 ** uint256(d);
        stock.mint(alice, stockIn);
        vm.startPrank(alice);
        stock.approve(curve, stockIn);
        ICOURCurve(curve).buy(stockIn, 0, alice, block.timestamp);
        vm.stopPrank();

        if (ICOURCurve(curve).graduated()) {
            assertEq(MockERC20(token).balanceOf(curve), 0, "no stranded tokens");
            assertEq(MockERC20(token).totalSupply(), Constants.TOTAL_SUPPLY);
        }
    }
}
