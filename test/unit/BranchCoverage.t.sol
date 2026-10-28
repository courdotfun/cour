// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { ICOURCurve } from "../../src/interfaces/ICOURCurve.sol";
import { ICOURFactory } from "../../src/interfaces/ICOURFactory.sol";
import { ICOURHook } from "../../src/interfaces/ICOURHook.sol";
import { PoolKeyLib } from "../../src/libraries/PoolKeyLib.sol";
import { CreatorMode } from "../../src/types/CreatorMode.sol";
import { MockERC20 } from "../mocks/MockERC20.sol";
import { MockStock } from "../mocks/MockStock.sol";
import { BaseTest } from "../utils/BaseTest.sol";

import { IPoolManager } from "v4-core/interfaces/IPoolManager.sol";
import { IUnlockCallback } from "v4-core/interfaces/callback/IUnlockCallback.sol";
import { TickMath } from "v4-core/libraries/TickMath.sol";
import { PoolKey } from "v4-core/types/PoolKey.sol";
import { SwapParams } from "v4-core/types/PoolOperation.sol";

/// @dev Minimal helper that performs a raw EXACT-OUTPUT swap (amountSpecified > 0) to exercise the hook's
///      ExactOutputNotSupported guard.
contract ExactOutSwapper is IUnlockCallback {
    IPoolManager internal pm;

    constructor(IPoolManager pm_) {
        pm = pm_;
    }

    function swap(PoolKey calldata key, bool zeroForOne) external {
        pm.unlock(abi.encode(key, zeroForOne));
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        (PoolKey memory key, bool z) = abi.decode(data, (PoolKey, bool));
        pm.swap(
            key,
            SwapParams({
                zeroForOne: z,
                amountSpecified: 1e6, // positive => exact-output
                sqrtPriceLimitX96: z ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1
            }),
            ""
        );
        return "";
    }
}

/// @notice Branch-coverage push: exercises BOTH token orderings (COUR token as currency0 and currency1)
///         through graduation + pool buy + pool sell + hook views, and the exact-output guard.
contract BranchCoverageTest is BaseTest {
    function setUp() public {
        _deploySystem();
    }

    /// @dev Launch a token whose COUR address is below (tokenZero=true) or above (false) the stock,
    ///      by trying salts until the ordering matches.
    function _launchOrdered(bool tokenZero) internal returns (address token, address curve, MockStock stock) {
        stock = _newStock(18, 100e18);
        for (uint256 i = 1; i < 300; i++) {
            (address t, address c) = _create(stock, 500, CreatorMode.CREATOR, bytes32(i));
            (, bool tokenIsZero) = PoolKeyLib.build(t, address(stock), address(hook));
            if (tokenIsZero == tokenZero) {
                return (t, c, stock);
            }
        }
        revert("no ordering found");
    }

    function _create(MockStock stock, uint16 fee, CreatorMode mode, bytes32 salt)
        internal
        returns (address token, address curve)
    {
        ICOURFactory.CreateParams memory p = ICOURFactory.CreateParams({
            name: "B",
            symbol: "B",
            metadataURI: "u",
            stock: address(stock),
            creatorFeeBps: fee,
            creatorMode: uint8(mode),
            feeRecipient: creator,
            initialBuyStock: 0,
            minInitialTokens: 0,
            salt: salt
        });
        vm.prank(creator);
        (token, curve) = factory.createToken(p);
    }

    function _graduateAndTrade(address token, address curve, MockStock stock) internal {
        vm.warp(block.timestamp + 6);
        uint256 big = 2_000e18;
        stock.mint(alice, big);
        vm.startPrank(alice);
        stock.approve(curve, big);
        ICOURCurve(curve).buy(big, 0, alice, block.timestamp);
        vm.stopPrank();
        require(ICOURCurve(curve).graduated(), "grad");

        // pool buy + sell via router (hits beforeSwap buy + afterSwap sell for this ordering)
        stock.mint(bob, 20e18);
        vm.startPrank(bob);
        stock.approve(address(router), 20e18);
        uint256 out = router.buy(token, 20e18, 0, block.timestamp);
        MockERC20(token).approve(address(router), out);
        router.sell(token, out, 0, block.timestamp);
        vm.stopPrank();

        (uint256 spot, uint256 twap) = ICOURHook(address(hook)).priceInfo(token);
        assertGt(spot, 0);
        assertGt(twap, 0);
        assertGt(ICOURHook(address(hook)).poolStockReserve(token, address(stock)), 0);
    }

    function test_both_token_orderings() public {
        (address t0, address c0, MockStock s0) = _launchOrdered(true);
        _graduateAndTrade(t0, c0, s0);
        (address t1, address c1, MockStock s1) = _launchOrdered(false);
        _graduateAndTrade(t1, c1, s1);
    }

    function test_exact_output_not_supported() public {
        (address token, address curve, MockStock stock) = _launchOrdered(true);
        vm.warp(block.timestamp + 6);
        uint256 big = 2_000e18;
        stock.mint(alice, big);
        vm.startPrank(alice);
        stock.approve(curve, big);
        ICOURCurve(curve).buy(big, 0, alice, block.timestamp);
        vm.stopPrank();

        (PoolKey memory key,) = PoolKeyLib.build(token, address(stock), address(hook));
        ExactOutSwapper sw = new ExactOutSwapper(IPoolManager(address(pm)));
        vm.expectRevert(); // ExactOutputNotSupported bubbles through the unlock
        sw.swap(key, true);
    }
}
