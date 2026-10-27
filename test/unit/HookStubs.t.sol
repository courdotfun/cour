// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { COURHook } from "../../src/COURHook.sol";
import { Errors } from "../../src/libraries/Errors.sol";
import { BaseTest } from "../utils/BaseTest.sol";
import { IHooks } from "v4-core/interfaces/IHooks.sol";
import { BalanceDelta } from "v4-core/types/BalanceDelta.sol";
import { Currency } from "v4-core/types/Currency.sol";
import { PoolKey } from "v4-core/types/PoolKey.sol";
import { ModifyLiquidityParams } from "v4-core/types/PoolOperation.sol";

/// @notice The unused IHooks entrypoints must all revert (they are not enabled in the hook's permission
///         bits, so the PoolManager never calls them; a direct caller is rejected).
contract HookStubsTest is BaseTest {
    function setUp() public {
        _deploySystem();
    }

    function _key() internal pure returns (PoolKey memory k) {
        k = PoolKey(Currency.wrap(address(0)), Currency.wrap(address(0)), 0, 60, IHooks(address(0)));
    }

    function test_unused_hooks_revert() public {
        COURHook h = hook;
        ModifyLiquidityParams memory mp;
        BalanceDelta d = BalanceDelta.wrap(0);

        vm.expectRevert(Errors.OnlyHook.selector);
        h.afterInitialize(address(0), _key(), 0, 0);
        vm.expectRevert(Errors.OnlyHook.selector);
        h.beforeAddLiquidity(address(0), _key(), mp, "");
        vm.expectRevert(Errors.OnlyHook.selector);
        h.afterAddLiquidity(address(0), _key(), mp, d, d, "");
        vm.expectRevert(Errors.OnlyHook.selector);
        h.beforeRemoveLiquidity(address(0), _key(), mp, "");
        vm.expectRevert(Errors.OnlyHook.selector);
        h.afterRemoveLiquidity(address(0), _key(), mp, d, d, "");
        vm.expectRevert(Errors.OnlyHook.selector);
        h.beforeDonate(address(0), _key(), 0, 0, "");
        vm.expectRevert(Errors.OnlyHook.selector);
        h.afterDonate(address(0), _key(), 0, 0, "");
    }

    function test_hook_entrypoints_only_pool_manager() public {
        COURHook h = hook;
        vm.expectRevert(Errors.OnlyHook.selector);
        h.beforeInitialize(address(0), _key(), 0);
    }

    function test_getHookPermissions() public view {
        assertTrue(hook.getHookPermissions().beforeSwap);
        assertTrue(hook.getHookPermissions().afterSwap);
        assertTrue(hook.getHookPermissions().beforeInitialize);
    }
}
