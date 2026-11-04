// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { IUniswapV3PoolMinimal } from "../../src/interfaces/IUniswapV3PoolMinimal.sol";
import { TickMath } from "v4-core/libraries/TickMath.sol";

/// @notice Mock Uniswap v3 pool returning a configurable constant tick so the PriceReader's TWAP math
///         can be unit-tested without a fork. `observe` yields tickCumulatives consistent with `curTick`.
///         `slot0.sqrtPriceX96` is derived from `curTick` and `liquidity()` is configurable so the
///         in-range-reserve floor (L-3) can be exercised. Set `revertObserve` to simulate a pool with
///         insufficient history (TwapNotReady).
contract MockV3Pool is IUniswapV3PoolMinimal {
    address public immutable override token0;
    address public immutable override token1;
    uint24 public constant override fee = 3000;
    int24 public curTick;
    bool public revertObserve;
    uint16 public cardinalityNext;
    uint128 public liq = 1e18;

    constructor(address t0, address t1, int24 tick) {
        (token0, token1) = t0 < t1 ? (t0, t1) : (t1, t0);
        curTick = tick;
    }

    function setTick(int24 t) external {
        curTick = t;
    }

    function setLiquidity(uint128 l) external {
        liq = l;
    }

    function setRevertObserve(bool v) external {
        revertObserve = v;
    }

    function liquidity() external view override returns (uint128) {
        return liq;
    }

    function slot0() external view override returns (uint160, int24 tick, uint16, uint16, uint16, uint8, bool) {
        return (TickMath.getSqrtPriceAtTick(curTick), curTick, 0, 0, 0, 0, true);
    }

    function observe(uint32[] calldata secondsAgos)
        external
        view
        override
        returns (int56[] memory tickCumulatives, uint160[] memory secondsPerLiquidityCumulativeX128s)
    {
        require(!revertObserve, "OLD");
        tickCumulatives = new int56[](secondsAgos.length);
        secondsPerLiquidityCumulativeX128s = new uint160[](secondsAgos.length);
        uint256 t = block.timestamp;
        for (uint256 i = 0; i < secondsAgos.length; i++) {
            // cumulative tick at (now - secondsAgos[i]) == curTick * (now - secondsAgos[i])
            uint256 at = t - secondsAgos[i];
            tickCumulatives[i] = int56(curTick) * int56(uint56(at));
        }
    }

    function increaseObservationCardinalityNext(uint16 n) external override {
        cardinalityNext = n;
    }
}
