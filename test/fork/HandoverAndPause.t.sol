// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { TimelockController } from "@openzeppelin/contracts/governance/TimelockController.sol";
import { Test } from "forge-std/Test.sol";

interface IPausable {
    function setLaunchesPaused(bool) external;
    function launchesPaused() external view returns (bool);
}

/// @notice Fork dry-run of the production hand-over (04_HandOver) and the emergency pause procedure against
///         the LIVE final deployment on Robinhood Chain 4663. Uses a fake multisig EOA as the Timelock
///         proposer/executor (the real Safe is a human step). Skips cleanly when RH_RPC_URL is unset.
contract HandoverAndPauseTest is Test {
    // Final deployment (deployments/4663.json, tag audit-freeze-v1).
    address constant FACTORY = 0x771a90Ff8E9Be8dC9091494D9466C35D162c0f4C;
    address constant PRICE_READER = 0xF7C914E7B7580a7653DcC3b7574bf041F615e359;
    address constant FEE_VAULT = 0x69263a34BebDeF24Db3384bfdf9c52794B3a0C76;
    address constant ROUTER = 0x835Afd54F9BA20b18b6807B44886123E85A586f9;

    address constant FAKE_MULTISIG = address(0xA11CE); // stands in for the real Safe 2-of-3

    bool internal active;

    function setUp() public {
        string memory rpc = vm.envOr("RH_RPC_URL", string(""));
        if (bytes(rpc).length == 0) {
            emit log("RH_RPC_URL unset: skipping handover/pause fork test");
            return;
        }
        vm.createSelectFork(rpc);
        active = true;
    }

    modifier onFork() {
        if (!active) return;
        _;
    }

    function test_handover_to_timelock_transfers_all_four() public onFork {
        address[4] memory targets = [FACTORY, PRICE_READER, FEE_VAULT, ROUTER];
        bytes memory data = abi.encodeWithSignature("acceptOwnership()");

        address owner = Ownable2Step(FACTORY).owner();
        // sanity: the deployer owns all four today
        for (uint256 i; i < targets.length; i++) {
            assertEq(Ownable2Step(targets[i]).owner(), owner, "unexpected owner pre-handover");
        }

        // Deploy the 48h timelock with the (fake) multisig as proposer + executor.
        address[] memory ms = new address[](1);
        ms[0] = FAKE_MULTISIG;
        TimelockController tl = new TimelockController(48 hours, ms, ms, address(0));

        // Step 1: current owner begins the 2-step transfer for each contract.
        vm.startPrank(owner);
        for (uint256 i; i < targets.length; i++) {
            Ownable2Step(targets[i]).transferOwnership(address(tl));
        }
        vm.stopPrank();

        // Step 2: multisig schedules every acceptOwnership op (48h delay), then after the delay executes them.
        vm.startPrank(FAKE_MULTISIG);
        for (uint256 i; i < targets.length; i++) {
            tl.schedule(targets[i], 0, data, bytes32(0), bytes32(uint256(i)), 48 hours);
        }
        vm.warp(block.timestamp + 48 hours + 1);
        for (uint256 i; i < targets.length; i++) {
            tl.execute(targets[i], 0, data, bytes32(0), bytes32(uint256(i)));
            assertEq(Ownable2Step(targets[i]).owner(), address(tl), "ownership not transferred to timelock");
        }
        vm.stopPrank();
    }

    function test_emergency_pause_toggle() public onFork {
        address owner = Ownable2Step(FACTORY).owner();
        bool before = IPausable(FACTORY).launchesPaused();

        vm.startPrank(owner);
        IPausable(FACTORY).setLaunchesPaused(true);
        assertTrue(IPausable(FACTORY).launchesPaused(), "pause did not take");
        IPausable(FACTORY).setLaunchesPaused(false);
        assertFalse(IPausable(FACTORY).launchesPaused(), "unpause did not take");
        // restore observed starting state on the fork
        IPausable(FACTORY).setLaunchesPaused(before);
        vm.stopPrank();
    }
}
