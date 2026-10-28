// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { Test } from "forge-std/Test.sol";
import { IAllowanceTransfer } from "permit2/src/interfaces/IAllowanceTransfer.sol";
import { DeployPermit2 } from "permit2/test/utils/DeployPermit2.sol";
import { PoolManager } from "v4-core/PoolManager.sol";
import { IPoolManager } from "v4-core/interfaces/IPoolManager.sol";
import { Hooks } from "v4-core/libraries/Hooks.sol";
import { PositionManager } from "v4-periphery/src/PositionManager.sol";
import { IPositionDescriptor } from "v4-periphery/src/interfaces/IPositionDescriptor.sol";
import { IWETH9 } from "v4-periphery/src/interfaces/external/IWETH9.sol";

import { COURCurve } from "../../src/COURCurve.sol";
import { COURFactory } from "../../src/COURFactory.sol";
import { COURFeeVault } from "../../src/COURFeeVault.sol";
import { COURHook } from "../../src/COURHook.sol";
import { COURRouter } from "../../src/COURRouter.sol";
import { ICOURCurve } from "../../src/interfaces/ICOURCurve.sol";
import { ICOURFactory } from "../../src/interfaces/ICOURFactory.sol";
import { ICOURPriceReader } from "../../src/interfaces/ICOURPriceReader.sol";
import { Constants } from "../../src/libraries/Constants.sol";
import { CreatorMode } from "../../src/types/CreatorMode.sol";

import { MockERC20 } from "../mocks/MockERC20.sol";
import { MockPriceReader } from "../mocks/MockPriceReader.sol";
import { MockStock } from "../mocks/MockStock.sol";

/// @notice Full-system test harness: real v4 PoolManager, COUR core, hook placed at a flag-valid address.
abstract contract BaseTest is Test, DeployPermit2 {
    PoolManager internal pm;
    PositionManager internal posm;
    address internal permit2;
    COURFactory internal factory;
    COURCurve internal curveImpl;
    COURHook internal hook;
    COURFeeVault internal vault;
    COURRouter internal router;
    MockPriceReader internal oracle;
    MockERC20 internal weth;

    address internal admin = makeAddr("admin");
    address internal treasury = makeAddr("treasury");
    address internal creator = makeAddr("creator");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");

    function _deploySystem() internal {
        pm = new PoolManager(admin);
        weth = new MockERC20("Wrapped ETH", "WETH", 18);
        oracle = new MockPriceReader();

        vm.startPrank(admin);
        vault = new COURFeeVault(admin, treasury, address(pm));
        vm.stopPrank();

        // Real v4 PositionManager (for graduation LP NFT -> DEAD) + canonical Permit2 (etched).
        permit2 = deployPermit2();
        posm = new PositionManager(
            IPoolManager(address(pm)),
            IAllowanceTransfer(permit2),
            100_000,
            IPositionDescriptor(address(0)),
            IWETH9(address(0))
        );

        // Hook address must carry exactly the permission bits. Place it via deployCodeTo.
        uint160 flags = uint160(
            Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG
                | Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG | Hooks.AFTER_SWAP_RETURNS_DELTA_FLAG
        );
        address hookAddr = address((uint160(0x4444) << 144) | flags);

        // Predict the factory CREATE address: only curveImpl is `new`-ed between now and the factory.
        address predictedFactory = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 1);

        curveImpl = new COURCurve(predictedFactory, address(vault));
        deployCodeTo("COURHook.sol:COURHook", abi.encode(address(pm), predictedFactory, address(vault)), hookAddr);
        hook = COURHook(hookAddr);

        factory = new COURFactory(
            admin, address(pm), address(posm), hookAddr, address(vault), address(oracle), address(curveImpl)
        );
        require(address(factory) == predictedFactory, "factory predict");

        router = new COURRouter(address(pm), address(factory), address(0), address(weth));

        vm.prank(admin);
        vault.wire(address(factory), hookAddr, address(router), address(oracle));

        // The launch allowlist ships enabled (closed test phase); disable it for the general test
        // harness so existing suites launch freely. The allowlist itself is exercised in Admin.t.sol.
        vm.prank(admin);
        factory.setLaunchAllowlistEnabled(false);
    }

    // ----------------------------------------------------------------- helpers

    function _newStock(uint8 decimals_, uint256 priceUsdX18) internal returns (MockStock s) {
        s = new MockStock("Mock NVDA", "mNVDA", decimals_);
        oracle.setPrice(address(s), priceUsdX18);
        oracle.setLiq(address(s), 1_000_000); // $1M ref liq, above the floor
        vm.prank(admin);
        factory.setStock(address(s), true, address(0), ICOURPriceReader.RefKind.NONE);
    }

    function _launch(MockStock stock, uint16 feeBps, CreatorMode mode, uint256 initialBuyStock)
        internal
        returns (address token, address curve)
    {
        ICOURFactory.CreateParams memory p = ICOURFactory.CreateParams({
            name: "COUR Test",
            symbol: "CTEST",
            metadataURI: "ipfs://test",
            stock: address(stock),
            creatorFeeBps: feeBps,
            creatorMode: uint8(mode),
            feeRecipient: creator,
            initialBuyStock: initialBuyStock,
            minInitialTokens: 0,
            salt: keccak256(abi.encode(block.timestamp, stock, feeBps, mode))
        });
        if (initialBuyStock > 0) {
            stock.mint(creator, initialBuyStock);
            vm.prank(creator);
            stock.approve(address(factory), initialBuyStock);
        }
        vm.prank(creator);
        (token, curve) = factory.createToken(p);
        // Advance past the 5s anti-snipe window by default (tax-specific tests call createToken directly).
        vm.warp(block.timestamp + 6);
    }

    /// @notice Give `user` stock and buy on the curve directly (payer == user).
    function _buyCurve(address curve, MockStock stock, address user, uint256 stockIn)
        internal
        returns (uint256 tokensOut)
    {
        stock.mint(user, stockIn);
        vm.startPrank(user);
        stock.approve(curve, stockIn);
        (tokensOut,) = ICOURCurve(curve).buy(stockIn, 0, user, block.timestamp);
        vm.stopPrank();
    }

    function _sellCurve(address curve, address token, address user, uint256 tokensIn)
        internal
        returns (uint256 stockOut)
    {
        vm.startPrank(user);
        MockERC20(token).approve(curve, tokensIn);
        stockOut = ICOURCurve(curve).sell(tokensIn, 0, user, block.timestamp);
        vm.stopPrank();
    }
}
