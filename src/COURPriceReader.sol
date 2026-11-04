// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { ICOURPriceReader } from "./interfaces/ICOURPriceReader.sol";
import { IStockToken8056 } from "./interfaces/IStockToken8056.sol";
import { IUniswapV3PoolMinimal } from "./interfaces/IUniswapV3PoolMinimal.sol";
import { Constants } from "./libraries/Constants.sol";
import { Errors } from "./libraries/Errors.sol";
import { V3Oracle } from "./libraries/V3Oracle.sol";
import { FixedPointMathLib } from "solady/utils/FixedPointMathLib.sol";
import { Ownable, Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

/// @title COURPriceReader
/// @notice Oracle-free USD pricing for stock tokens. Every price is a Uniswap v3 TWAP on Robinhood
///         Chain: either a direct STOCK/USDG pool, or STOCK/WETH priced through WETH/USDG. Returns the
///         USD price of one WHOLE stock token scaled by 1e18, raw-unit aware (never assumes 18 decimals).
contract COURPriceReader is ICOURPriceReader, Ownable2Step {
    struct Ref {
        address pool;
        RefKind kind;
    }

    address public immutable usdg;
    address public immutable weth;
    uint8 public immutable usdgDecimals;
    uint32 public twapWindow = Constants.TWAP_WINDOW;

    /// @notice WETH/USDG pool used to value the WETH leg of STOCK/WETH routes.
    address public wethUsdgPool;

    /// @notice Address (the factory) additionally authorized to configure reference pools.
    address public authorizedSetter;

    mapping(address => Ref) public refOf;

    constructor(address owner_, address usdg_, address weth_) Ownable(owner_) {
        if (usdg_ == address(0) || weth_ == address(0)) revert Errors.ZeroAddress();
        usdg = usdg_;
        weth = weth_;
        usdgDecimals = IERC20Metadata(usdg_).decimals();
    }

    // ----------------------------------------------------------------- admin

    function setAuthorizedSetter(address setter) external onlyOwner {
        authorizedSetter = setter;
    }

    function setWethUsdgPool(address pool) external onlyOwner {
        wethUsdgPool = pool;
    }

    function setTwapWindow(uint32 w) external onlyOwner {
        require(w >= 60, "window");
        twapWindow = w;
    }

    /// @inheritdoc ICOURPriceReader
    function setRefPool(address stock, address refPool, RefKind kind) external {
        if (msg.sender != owner() && msg.sender != authorizedSetter) revert Errors.OnlyFactory();
        refOf[stock] = Ref(refPool, kind);
    }

    // --------------------------------------------------------------- pricing

    /// @inheritdoc ICOURPriceReader
    function stockUsd(address stock) public view returns (uint256 priceX18, uint8 source) {
        Ref memory r = refOf[stock];
        if (r.kind == RefKind.NONE || r.pool == address(0)) revert Errors.StockNotAllowed();

        uint8 d = IERC20Metadata(stock).decimals();
        uint256 oneWhole = 10 ** uint256(d);

        if (r.kind == RefKind.USDG) {
            int24 tick = _meanTick(r.pool, twapWindow);
            uint256 quoteUsdg = V3Oracle.getQuoteAtTick(tick, oneWhole, stock, usdg);
            priceX18 = (quoteUsdg * Constants.PRICE_PRECISION) / (10 ** uint256(usdgDecimals));
            source = 1;
        } else {
            // STOCK/WETH priced through WETH/USDG.
            int24 tick = _meanTick(r.pool, twapWindow);
            uint256 stockInWeth = V3Oracle.getQuoteAtTick(tick, oneWhole, stock, weth); // raw WETH (18dp)
            uint256 wethUsdX18 = _wethUsd();
            priceX18 = (stockInWeth * wethUsdX18) / 1e18;
            source = 2;
        }
        if (priceX18 == 0) revert Errors.TwapNotReady();
    }

    /// @inheritdoc ICOURPriceReader
    /// @dev L-3 hardening: reserves are the pool's in-range (virtual) reserves derived from the active
    ///      `liquidity` and `slot0.sqrtPriceX96`, NOT raw `balanceOf`. A one-off donation into the pool
    ///      moves neither L nor the price, so it can no longer inflate this floor proxy.
    function refLiquidityUsd(address stock) external view returns (uint256) {
        Ref memory r = refOf[stock];
        if (r.pool == address(0)) return 0;
        if (r.kind == RefKind.USDG) {
            uint256 reserve = _inRangeReserve(r.pool, usdg);
            return (reserve * 2) / (10 ** uint256(usdgDecimals)); // both sides ~ 2x the USDG reserve
        } else {
            uint256 reserve = _inRangeReserve(r.pool, weth);
            uint256 wethUsdX18 = _wethUsd();
            return (reserve * wethUsdX18 * 2) / 1e36;
        }
    }

    /// @inheritdoc ICOURPriceReader
    function uiMultiplier(address stock) external view returns (uint256) {
        try IStockToken8056(stock).uiMultiplier() returns (uint256 m) {
            return m == 0 ? 1e18 : m;
        } catch {
            return 1e18;
        }
    }

    /// @inheritdoc ICOURPriceReader
    function bumpCardinality(address pool, uint16 n) external {
        IUniswapV3PoolMinimal(pool).increaseObservationCardinalityNext(n);
    }

    /// @notice Public TWAP mean-tick helper (reverts TwapNotReady if the pool lacks history).
    function consult(address pool, uint32 secondsAgo) external view returns (int24) {
        return _meanTick(pool, secondsAgo);
    }

    // --------------------------------------------------------------- internal

    /// @dev In-range (virtual) reserve of `token` at the pool's current price, from the active liquidity
    ///      `L` and `slot0.sqrtPriceX96`. For token0: amount0 = L * 2^96 / sqrtP; for token1:
    ///      amount1 = L * sqrtP / 2^96. Donation-resistant — raw transfers change neither L nor sqrtP.
    ///      Returns 0 when the pool is uninitialized (sqrtP == 0) or has no active liquidity.
    function _inRangeReserve(address pool, address token) internal view returns (uint256) {
        (uint160 sqrtPriceX96,,,,,,) = IUniswapV3PoolMinimal(pool).slot0();
        if (sqrtPriceX96 == 0) return 0;
        uint256 l = IUniswapV3PoolMinimal(pool).liquidity();
        if (l == 0) return 0;
        if (token == IUniswapV3PoolMinimal(pool).token0()) {
            return FixedPointMathLib.fullMulDiv(l, 1 << 96, sqrtPriceX96);
        }
        return FixedPointMathLib.fullMulDiv(l, sqrtPriceX96, 1 << 96);
    }

    function _wethUsd() internal view returns (uint256 wethUsdX18) {
        address pool = wethUsdgPool;
        if (pool == address(0)) revert Errors.TwapNotReady();
        int24 tick = _meanTick(pool, twapWindow);
        uint256 quoteUsdg = V3Oracle.getQuoteAtTick(tick, 1e18, weth, usdg);
        wethUsdX18 = (quoteUsdg * Constants.PRICE_PRECISION) / (10 ** uint256(usdgDecimals));
    }

    /// @dev consult with a clean custom error when the TWAP window is not yet available.
    function _meanTick(address pool, uint32 w) internal view returns (int24) {
        uint32[] memory sa = new uint32[](2);
        sa[0] = w;
        sa[1] = 0;
        try IUniswapV3PoolMinimal(pool).observe(sa) returns (int56[] memory tc, uint160[] memory) {
            int56 delta = tc[1] - tc[0];
            int24 t = int24(delta / int56(uint56(w)));
            if (delta < 0 && (delta % int56(uint56(w)) != 0)) t--;
            return t;
        } catch {
            revert Errors.TwapNotReady();
        }
    }
}
