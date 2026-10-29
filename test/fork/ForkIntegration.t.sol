// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { Test } from "forge-std/Test.sol";
import { IPoolManager } from "v4-core/interfaces/IPoolManager.sol";
import { Hooks } from "v4-core/libraries/Hooks.sol";

import { COURCurve } from "../../src/COURCurve.sol";
import { COURFactory } from "../../src/COURFactory.sol";
import { COURFeeVault } from "../../src/COURFeeVault.sol";
import { COURHook } from "../../src/COURHook.sol";
import { COURRouter } from "../../src/COURRouter.sol";
import { GraduationImpl } from "../../src/GraduationImpl.sol";
import { ICOURCurve } from "../../src/interfaces/ICOURCurve.sol";
import { ICOURFactory } from "../../src/interfaces/ICOURFactory.sol";
import { ICOURPriceReader } from "../../src/interfaces/ICOURPriceReader.sol";
import { Constants } from "../../src/libraries/Constants.sol";
import { CreatorMode } from "../../src/types/CreatorMode.sol";
import { TokenConfig } from "../../src/types/TokenConfig.sol";
import { MockPriceReader } from "../mocks/MockPriceReader.sol";
import { MockStock } from "../mocks/MockStock.sol";

/// @notice Mainnet-fork proof that graduation mints the LP position NFT to DEAD against the REAL v4
///         PositionManager + Permit2 (docs §2.3/§4). Skips cleanly when RH_RPC_URL is unset. Uses a mock
///         stock + mock price reader so the test is deterministic and independent of live NVDA pricing;
///         the graduation path itself hits the real mainnet PositionManager/PoolManager/Permit2.
contract ForkIntegrationTest is Test {
    address constant POOL_MANAGER = 0x8366a39CC670B4001A1121B8F6A443A643e40951;
    address constant POSITION_MANAGER = 0x58daec3116aae6D93017bAAea7749052E8a04fA7;

    bool internal active;

    COURFactory internal factory;
    COURFeeVault internal vault;
    COURHook internal hook;
    COURRouter internal router;
    MockPriceReader internal oracle;

    address internal admin = makeAddr("admin");
    address internal treasury = makeAddr("treasury");
    address internal creator = makeAddr("creator");
    address internal buyer = makeAddr("buyer");

    function setUp() public {
        string memory rpc = vm.envOr("RH_RPC_URL", string(""));
        if (bytes(rpc).length == 0) {
            emit log("RH_RPC_URL unset: skipping fork integration");
            return;
        }
        vm.createSelectFork(rpc);
        active = true;
        _deployOnFork();
    }

    modifier onFork() {
        if (!active) return;
        _;
    }

    function _deployOnFork() internal {
        oracle = new MockPriceReader();
        vm.prank(admin);
        vault = new COURFeeVault(admin, treasury, POOL_MANAGER);

        uint160 flags = uint160(
            Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG
                | Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG | Hooks.AFTER_SWAP_RETURNS_DELTA_FLAG
        );
        address hookAddr = address((uint160(0x7654) << 144) | flags);
        GraduationImpl gradImpl = new GraduationImpl();
        address predictedFactory = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 1);
        COURCurve curveImpl = new COURCurve(predictedFactory, address(vault));
        deployCodeTo("COURHook.sol:COURHook", abi.encode(POOL_MANAGER, predictedFactory, address(vault)), hookAddr);
        hook = COURHook(hookAddr);
        factory = new COURFactory(
            admin,
            POOL_MANAGER,
            POSITION_MANAGER,
            hookAddr,
            address(vault),
            address(oracle),
            address(curveImpl),
            address(gradImpl)
        );
        require(address(factory) == predictedFactory, "factory predict");
        router = new COURRouter(admin, POOL_MANAGER, address(factory), address(0), address(0));
        vm.startPrank(admin);
        vault.wire(address(factory), hookAddr, address(router), address(oracle));
        factory.setLaunchAllowlistEnabled(false);
        vm.stopPrank();
    }

    function test_fork_graduation_mints_nft_to_dead() public onFork {
        MockStock stock = new MockStock("Mock NVDA", "mNVDA", 18);
        oracle.setPrice(address(stock), 100e18);
        oracle.setLiq(address(stock), 1_000_000);
        vm.prank(admin);
        factory.setStock(address(stock), true, address(0), ICOURPriceReader.RefKind.NONE);

        ICOURFactory.CreateParams memory p = ICOURFactory.CreateParams({
            name: "COUR Fork",
            symbol: "CFORK",
            metadataURI: "ipfs://fork",
            stock: address(stock),
            creatorFeeBps: 500,
            creatorMode: uint8(CreatorMode.BUYBACK_BURN),
            feeRecipient: creator,
            initialBuyStock: 0,
            minInitialTokens: 0,
            salt: bytes32(uint256(0xF0))
        });
        vm.prank(creator);
        (address token, address curve) = factory.createToken(p);
        vm.warp(block.timestamp + 6);

        TokenConfig memory cfg = ICOURCurve(curve).config();
        uint256 big = (cfg.k / cfg.vTStop - cfg.vS0) * 2;

        uint256 positionId = _posmNextTokenId();
        stock.mint(buyer, big);
        vm.startPrank(buyer);
        stock.approve(curve, big);
        uint256 gasBefore = gasleft();
        ICOURCurve(curve).buy(big, 0, buyer, block.timestamp);
        uint256 gasUsed = gasBefore - gasleft();
        vm.stopPrank();

        assertTrue(ICOURCurve(curve).graduated(), "graduated on fork");
        // The REAL mainnet PositionManager now holds a position NFT owned by DEAD.
        assertEq(IERC721(POSITION_MANAGER).ownerOf(positionId), Constants.DEAD, "LP NFT -> DEAD (real posm)");
        emit log_named_uint("graduation gas (incl. real posm mint)", gasUsed);

        // Pool trades after graduation (buy via the real PoolManager through the router).
        stock.mint(buyer, 10e18);
        vm.startPrank(buyer);
        stock.approve(address(router), 10e18);
        uint256 poolOut = router.buy(token, 10e18, 0, block.timestamp);
        vm.stopPrank();
        assertGt(poolOut, 0, "pool trades post-graduation");
    }

    function _posmNextTokenId() internal view returns (uint256 id) {
        (bool ok, bytes memory data) = POSITION_MANAGER.staticcall(abi.encodeWithSignature("nextTokenId()"));
        require(ok, "nextTokenId");
        id = abi.decode(data, (uint256));
    }
}
