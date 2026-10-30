// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { LibClone } from "solady/utils/LibClone.sol";

import { COURCurve } from "../../src/COURCurve.sol";
import { COURFeeVault } from "../../src/COURFeeVault.sol";
import { COURToken } from "../../src/COURToken.sol";
import { ICOURCurve } from "../../src/interfaces/ICOURCurve.sol";
import { Constants } from "../../src/libraries/Constants.sol";
import { CurveMath } from "../../src/libraries/CurveMath.sol";
import { CreatorMode } from "../../src/types/CreatorMode.sol";
import { TokenConfig } from "../../src/types/TokenConfig.sol";

import { MockStock } from "../mocks/MockStock.sol";

/// @dev Minimal HEVM cheatcode surface used by the harness (Medusa-compatible).
interface IHevm {
    function warp(uint256) external;
}

/// @title CourFuzz
/// @notice Stateful Medusa/Echidna harness for the COUR bonding curve + fee vault.
/// @dev FALLBACK (focused) topology per the fizz run brief: no v4 pool. This harness itself plays the
///      role of the COURFactory — it clones the curve, deploys the token, registers the token with the
///      vault, and implements `curveOf` / `graduate` so the real COURCurve + COURFeeVault run unmodified.
///      The harness contract is the sole trader and the fee recipient (creator). A fresh MockStock is
///      used for every launch so each (token, stock) pair's vault accounting stays isolated, which keeps
///      the bucket-conservation invariant exact. On graduation the harness relaunches a new token so the
///      fuzzer keeps exercising live-curve paths for the whole campaign.
///
///      Invariants (see PROPERTIES.md): global ones are `property_*()` oracles; per-action ones
///      (round-trip no-profit, 20/80 split, graduation token count) are inline `assert`s in handlers.
contract CourFuzz {
    IHevm internal constant vm = IHevm(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);
    address internal constant DEAD = 0x000000000000000000000000000000000000dEaD;
    address internal constant TREASURY = address(0x7EA5);
    address internal constant HOOK_STUB = address(0x4001);
    address internal constant ROUTER_STUB = address(0x4002);
    address internal constant PRICE_STUB = address(0x4003);
    address internal constant PM_STUB = address(0x4004);

    // Launch parameters (constant across launches so the curve shape is stable & graduation reachable).
    uint8 internal constant STOCK_DECIMALS = 18;
    uint256 internal constant STOCK_PRICE_X18 = 30e18; // USD per whole stock (1e18-scaled)
    uint16 internal constant FEE_BPS = 300; // 3% creator fee (within 1%..10% bounds)

    // Clamp bounds for a buy's gross stock-in. vS0 ~ 1.4e20; this range both nudges and can graduate.
    uint256 internal constant MIN_BUY = 1e15;
    uint256 internal constant MAX_BUY = 600e18;

    COURCurve internal curveImpl;
    COURFeeVault internal vault;

    // current live launch
    MockStock internal stock;
    COURToken internal token;
    COURCurve internal curve;
    mapping(address => address) public curveOf; // factory role: token => curve

    uint256 internal launchNonce;

    // ghost: did the last handled action cause a graduation (so round-trip/other checks can skip)
    bool internal lastGraduated;

    constructor() {
        curveImpl = new COURCurve(address(this), address(0)); // feeVault wired after vault exists
        // feeVault immutable on the impl must point at the real vault; redeploy impl with vault addr.
        vault = new COURFeeVault(address(this), TREASURY, PM_STUB);
        curveImpl = new COURCurve(address(this), address(vault));
        vault.wire(address(this), HOOK_STUB, ROUTER_STUB, PRICE_STUB);
        // NOTE: do NOT _launch() here. _launch() -> vault.registerToken() -> factory.curveOf() calls back
        // into THIS contract, but during construction this address has no code yet, so the typed call
        // decodes empty and reverts ("Failed to initialize the test chain" under medusa). Launch lazily
        // on the first handler call (when the harness is fully deployed) via _ensureActive().
    }

    // ---------------------------------------------------------------- factory role

    /// @dev Called by the graduating curve (which believes we are the factory). Checks invariant SP-04
    ///      (tokens sold == vT0 - vTStop) then flags for relaunch on the next handler entry.
    function graduate(address t) external {
        require(msg.sender == address(curve), "only live curve");
        require(t == address(token), "token mismatch");
        TokenConfig memory c = curve.config();
        uint256 sold = Constants.TOTAL_SUPPLY - IERC20(address(token)).balanceOf(address(curve));
        uint256 expected = c.vT0 - c.vTStop;
        assert(sold == expected); // SP-04
        lastGraduated = true;
    }

    // ---------------------------------------------------------------- launch plumbing

    function _launch() internal {
        launchNonce++;
        stock = new MockStock("Mock Stock", "mSTK", STOCK_DECIMALS);

        curve = COURCurve(LibClone.clone(address(curveImpl)));

        token = new COURToken(
            "COUR Fuzz", "CFZ", "ipfs://fuzz", address(curve), address(stock), address(this), address(0)
        );
        curveOf[address(token)] = address(curve);

        CurveMath.LaunchParams memory lp = CurveMath.computeLaunchParams(
            STOCK_PRICE_X18, STOCK_DECIMALS, Constants.START_MC_USD, Constants.GRAD_MC_USD
        );

        uint64 launchedAt = uint64(block.timestamp);
        // Jump past the 5s anti-snipe window so buys are tax-free (tax paths covered elsewhere).
        vm.warp(block.timestamp + 10);

        TokenConfig memory cfg = TokenConfig({
            token: address(token),
            stock: address(stock),
            creator: address(this),
            creatorFeeBps: FEE_BPS,
            mode: CreatorMode.CREATOR,
            stockDecimals: STOCK_DECIMALS,
            launchedAt: launchedAt,
            vS0: lp.vS0,
            vT0: lp.vT0,
            k: lp.k,
            vTStop: lp.vTStop
        });

        curve.initialize(cfg);
        vault.registerToken(address(token), address(stock), address(this), FEE_BPS, CreatorMode.CREATOR, address(this));
        lastGraduated = false;
    }

    function _ensureActive() internal {
        if (address(curve) == address(0)) {
            _launch(); // lazy first launch (see constructor note)
            return;
        }
        if (lastGraduated || curve.graduated()) _launch();
    }

    function _clamp(uint256 x, uint256 lo, uint256 hi) internal pure returns (uint256) {
        if (hi <= lo) return lo;
        return lo + (x % (hi - lo + 1));
    }

    function _diffLe(uint256 a, uint256 b, uint256 tol) internal pure returns (bool) {
        return a > b ? a - b <= tol : b - a <= tol;
    }

    // ---------------------------------------------------------------- handlers

    /// @notice Buy tokens on the live curve. Folds in the 20/80 fee-split check (SP-03) for non-grad buys.
    function handler_buy(uint256 stockInSeed) external {
        _ensureActive();
        uint256 gross = _clamp(stockInSeed, MIN_BUY, MAX_BUY);

        // Expected fee (tax == 0 outside the window) for the split assertion.
        (uint256 tokensOutQ, uint256 feeQ, uint256 taxQ) = curve.quoteBuy(gross);
        bool willGraduate = (curve.vT() - tokensOutQ) <= curve.config().vTStop;

        uint256 platBefore = vault.platformOwed(address(stock));
        uint256 creatorBefore = vault.creatorOwed(address(token));

        stock.mint(address(this), gross);
        stock.approve(address(curve), gross);
        try curve.buy(gross, 0, address(this), block.timestamp) returns (uint256, uint256) {
            if (!willGraduate && taxQ == 0 && !curve.graduated()) {
                // SP-03: platform == floor(20% of fee), creator-side == remainder, per notify.
                uint256 expectPlat = (feeQ * Constants.PLATFORM_SHARE_BPS) / Constants.BPS;
                assert(vault.platformOwed(address(stock)) - platBefore == expectPlat);
                assert(vault.creatorOwed(address(token)) - creatorBefore == feeQ - expectPlat);
            }
        } catch {
            // Reverts (slippage caps, zero-net dust buys, rounding) are acceptable.
        }
    }

    /// @notice Sell tokens the harness currently holds back to the live curve.
    function handler_sell(uint256 tokensSeed) external {
        _ensureActive();
        uint256 bal = IERC20(address(token)).balanceOf(address(this));
        if (bal == 0) return;
        uint256 tokensIn = _clamp(tokensSeed, 1, bal);
        IERC20(address(token)).approve(address(curve), tokensIn);
        try curve.sell(tokensIn, 0, address(this), block.timestamp) returns (uint256) { } catch { }
    }

    /// @notice Atomic buy then immediate sell of exactly what was received. SP-02: never profits the trader.
    function handler_roundTrip(uint256 stockInSeed) external {
        _ensureActive();
        uint256 gross = _clamp(stockInSeed, MIN_BUY, MAX_BUY);

        stock.mint(address(this), gross);
        uint256 stockBefore = IERC20(address(stock)).balanceOf(address(this));
        stock.approve(address(curve), gross);

        uint256 got;
        try curve.buy(gross, 0, address(this), block.timestamp) returns (uint256 out, uint256) {
            got = out;
        } catch {
            return;
        }
        if (curve.graduated() || lastGraduated) return; // graduated: sell path closed, skip round-trip check
        if (got == 0) return;

        IERC20(address(token)).approve(address(curve), got);
        try curve.sell(got, 0, address(this), block.timestamp) returns (uint256) {
            uint256 stockAfter = IERC20(address(stock)).balanceOf(address(this));
            // SP-02: a buy immediately unwound by a sell must not return more stock than was put in.
            assert(stockAfter <= stockBefore);
        } catch { }
    }

    /// @notice Creator claims accrued fees (harness is the fee recipient).
    function handler_claimCreator(uint256) external {
        _ensureActive();
        try vault.claim(address(token)) returns (uint256) { } catch { }
    }

    /// @notice Platform (treasury) side is claimed to the treasury.
    function handler_claimPlatform(uint256) external {
        _ensureActive();
        try vault.claimPlatform(address(stock)) returns (uint256) { } catch { }
    }

    // ---------------------------------------------------------------- property oracles

    /// @notice GL-01: fixed token supply is constant forever.
    function property_totalSupply() external view returns (bool) {
        if (address(token) == address(0)) return true; // not launched yet (lazy init)
        return IERC20(address(token)).totalSupply() == Constants.TOTAL_SUPPLY;
    }

    /// @notice SP-01: curve solvency — real stock held >= net stock raised (vS - vS0).
    function property_solvency() external view returns (bool) {
        if (address(curve) == address(0)) return true;
        if (curve.graduated()) return true;
        TokenConfig memory c = curve.config();
        uint256 net = curve.vS() - c.vS0;
        return IERC20(address(stock)).balanceOf(address(curve)) >= net;
    }

    /// @notice SP-05: reserve ranges pre-graduation — vS >= vS0 and vTStop <= vT <= vT0.
    function property_reserveRanges() external view returns (bool) {
        if (address(curve) == address(0)) return true;
        if (curve.graduated()) return true;
        TokenConfig memory c = curve.config();
        uint256 _vS = curve.vS();
        uint256 _vT = curve.vT();
        return _vS >= c.vS0 && _vT <= c.vT0 && _vT >= c.vTStop;
    }

    /// @notice GL-02: vault bucket conservation — owed buckets sum to the vault's stock balance (±dust).
    function property_vaultBuckets() external view returns (bool) {
        if (address(token) == address(0)) return true;
        uint256 bal = IERC20(address(stock)).balanceOf(address(vault));
        uint256 sum =
            vault.creatorOwed(address(token)) + vault.buybackOwed(address(token)) + vault.platformOwed(address(stock));
        return _diffLe(bal, sum, 1);
    }
}
