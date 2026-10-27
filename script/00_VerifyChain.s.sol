// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { IUniswapV3PoolMinimal } from "../src/interfaces/IUniswapV3PoolMinimal.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { Script, console2 } from "forge-std/Script.sol";

/// @notice Verify every §2 Robinhood Chain address has code and the expected selectors respond.
///         Run on a fork: `forge script script/00_VerifyChain.s.sol --rpc-url $RH_RPC_URL`.
contract VerifyChain is Script {
    function run() external view {
        string memory cfg = vm.readFile("script/config/rh-mainnet.json");
        string[8] memory keys = [
            ".poolManager",
            ".positionManager",
            ".v3Factory",
            ".v3NonfungiblePositionManager",
            ".v3SwapRouter02",
            ".weth",
            ".usdg",
            ".nvda"
        ];
        for (uint256 i; i < keys.length; i++) {
            address a = vm.parseJsonAddress(cfg, keys[i]);
            uint256 size;
            assembly {
                size := extcodesize(a)
            }
            console2.log(keys[i], a, size > 0 ? "OK" : "NO CODE");
            require(size > 0, "missing code");
        }
        address nvda = vm.parseJsonAddress(cfg, ".nvda");
        console2.log("NVDA decimals", IERC20Metadata(nvda).decimals());
        address pool = vm.parseJsonAddress(cfg, ".nvdaUsdgPool");
        (, int24 tick,,,,,) = IUniswapV3PoolMinimal(pool).slot0();
        console2.log("NVDA/USDG pool tick", int256(tick));
    }
}
