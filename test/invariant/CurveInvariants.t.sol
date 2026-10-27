// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {BaseTest} from "../utils/BaseTest.sol";
import {CurveHandler} from "./CurveHandler.sol";
import {MockStock} from "../mocks/MockStock.sol";
import {MockERC20} from "../mocks/MockERC20.sol";
import {ICOURCurve} from "../../src/interfaces/ICOURCurve.sol";
import {CreatorMode} from "../../src/types/CreatorMode.sol";
import {Constants} from "../../src/libraries/Constants.sol";

/// @notice Handler-based invariants on the bonding curve (CREATOR mode, pre-graduation).
contract CurveInvariantsTest is BaseTest {
    CurveHandler internal handler;
    MockStock internal stock;
    address internal token;
    address internal curve;

    function setUp() public {
        _deploySystem();
        stock = _newStock(18, 100e18);
        (token, curve) = _launch(stock, 500, CreatorMode.CREATOR, 0);
        handler = new CurveHandler(curve, address(stock), token);
        targetContract(address(handler));
    }

    /// @dev supply is fixed forever.
    function invariant_supply_constant() public view {
        assertEq(MockERC20(token).totalSupply(), Constants.TOTAL_SUPPLY);
    }

    /// @dev reserve bounds hold pre-graduation.
    function invariant_reserve_bounds() public view {
        if (ICOURCurve(curve).graduated()) return;
        ICOURCurve c = ICOURCurve(curve);
        assertGe(c.vS(), c.config().vS0, "vS >= vS0");
        assertLe(c.vT(), c.config().vT0, "vT <= vT0");
        assertGe(c.vT(), c.config().vTStop, "vT >= vTStop");
    }

    /// @dev curve solvency: real stock held >= stock owed to redeemers (vS - vS0), curve-favouring dust aside.
    function invariant_curve_solvency() public view {
        if (ICOURCurve(curve).graduated()) return;
        ICOURCurve c = ICOURCurve(curve);
        uint256 owed = c.vS() - c.config().vS0;
        assertGe(stock.balanceOf(curve), owed, "curve solvent");
    }

    /// @dev every stock fee that entered the vault is fully attributed to buckets (CREATOR + platform).
    function invariant_vault_buckets_match_balance() public view {
        uint256 buckets = vault.creatorOwed(token) + vault.platformOwed(address(stock));
        // dust tolerance: at most 1 wei per op is impossible here (split is exact: platform=floor, creator=rest).
        assertEq(stock.balanceOf(address(vault)), buckets, "vault buckets == balance");
    }
}
