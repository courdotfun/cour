// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { IStockToken8056 } from "../../src/interfaces/IStockToken8056.sol";
import { IUniswapV3PoolMinimal } from "../../src/interfaces/IUniswapV3PoolMinimal.sol";
import { V3Oracle } from "../../src/libraries/V3Oracle.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { Test } from "forge-std/Test.sol";

/// @notice Robinhood Chain mainnet fork checks. SKIPS CLEANLY when RH_RPC_URL is unset so CI without a
///         secret stays green. When set, verifies §2 addresses have code and NVDA pricing is sane.
contract ForkChainTest is Test {
    // §2 addresses
    address constant POOL_MANAGER = 0x8366a39CC670B4001A1121B8F6A443A643e40951;
    address constant POSITION_MANAGER = 0x58daec3116aae6D93017bAAea7749052E8a04fA7;
    address constant V3_FACTORY = 0x1f7d7550B1b028f7571E69A784071F0205FD2EfA;
    address constant V3_NPM = 0x73991a25C818Bf1f1128dEAaB1492D45638DE0D3;
    address constant V3_SWAP_ROUTER02 = 0xCaf681a66D020601342297493863E78C959E5cb2;
    address constant USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;
    address constant WETH = 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73;
    address constant NVDA = 0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC;
    address constant NVDA_USDG_POOL = 0xd4EB21209C4D6093f80B5b84f5C45cc093EA14a3;

    bool internal active;

    function setUp() public {
        string memory rpc = vm.envOr("RH_RPC_URL", string(""));
        if (bytes(rpc).length == 0) {
            emit log("RH_RPC_URL unset: skipping fork tests");
            return;
        }
        vm.createSelectFork(rpc);
        active = true;
    }

    modifier onFork() {
        if (!active) return;
        _;
    }

    function test_addresses_have_code() public onFork {
        address[9] memory addrs =
            [POOL_MANAGER, POSITION_MANAGER, V3_FACTORY, V3_NPM, V3_SWAP_ROUTER02, USDG, WETH, NVDA, NVDA_USDG_POOL];
        for (uint256 i; i < addrs.length; i++) {
            assertGt(addrs[i].code.length, 0, "no code at chain-fact address");
        }
    }

    function test_nvda_metadata_and_8056() public onFork {
        uint8 d = IERC20Metadata(NVDA).decimals();
        emit log_named_uint("NVDA decimals", d);
        // ERC-8056 multiplier should be readable (>0).
        uint256 m = IStockToken8056(NVDA).uiMultiplier();
        emit log_named_uint("NVDA uiMultiplier", m);
        assertGt(m, 0);
    }

    function test_nvda_usd_price_sane() public onFork {
        // Pull the v3 TWAP and sanity-check NVDA USD is in a plausible range ($1..$100k/share).
        int24 meanTick = V3Oracle.consult(NVDA_USDG_POOL, 600);
        uint8 dStock = IERC20Metadata(NVDA).decimals();
        uint8 dUsdg = IERC20Metadata(USDG).decimals();
        uint256 quoteUsdg = V3Oracle.getQuoteAtTick(meanTick, 10 ** dStock, NVDA, USDG);
        uint256 priceUsdX18 = (quoteUsdg * 1e18) / (10 ** dUsdg);
        emit log_named_uint("NVDA USD (x1e18)", priceUsdX18);
        assertGt(priceUsdX18, 1e18, "> $1");
        assertLt(priceUsdX18, 100_000e18, "< $100k");
    }
}
