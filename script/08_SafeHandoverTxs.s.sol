// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { Script, console2 } from "forge-std/Script.sol";

/// @notice Generate two Safe{Wallet} "Transaction Builder" JSON files that the
///         MULTISIG imports to drive the Timelock through the Ownable2Step handover:
///           1) deployments/safe-handover-schedule.json  — schedule acceptOwnership
///              on factory/priceReader/feeVault/router (one batch).
///           2) deployments/safe-handover-execute.json    — execute the same ops
///              (import & run AFTER the 48h timelock delay elapses).
///
///         Reads TIMELOCK from env (printed by 04_HandOver) and the 4 target
///         contracts from deployments/4663.json. No broadcast — only writes files.
///
///         Run:
///           TIMELOCK=0x.. forge script script/08_SafeHandoverTxs.s.sol:SafeHandoverTxs
contract SafeHandoverTxs is Script {
    uint256 constant DELAY = 48 hours;
    // Ownable2Step.acceptOwnership() selector.
    bytes constant ACCEPT = hex"79ba5097";

    function run() external {
        string memory dep = vm.readFile("deployments/4663.json");
        address timelock = vm.envAddress("TIMELOCK");
        address[4] memory targets = [
            vm.parseJsonAddress(dep, ".factory"),
            vm.parseJsonAddress(dep, ".priceReader"),
            vm.parseJsonAddress(dep, ".feeVault"),
            vm.parseJsonAddress(dep, ".router")
        ];

        string memory schedule = _file(
            "COUR handover - schedule acceptOwnership (timelock 48h)", timelock, targets, true
        );
        string memory execute = _file(
            "COUR handover - execute acceptOwnership (after 48h)", timelock, targets, false
        );
        vm.writeFile("deployments/safe-handover-schedule.json", schedule);
        vm.writeFile("deployments/safe-handover-execute.json", execute);

        console2.log("Wrote deployments/safe-handover-schedule.json and safe-handover-execute.json");
        console2.log("Import schedule now; import execute after 48h. Timelock:", timelock);
    }

    function _file(string memory name, address timelock, address[4] memory targets, bool isSchedule)
        internal
        pure
        returns (string memory)
    {
        string memory txs = "";
        for (uint256 i = 0; i < targets.length; i++) {
            bytes memory data = isSchedule
                ? abi.encodeWithSignature(
                    "schedule(address,uint256,bytes,bytes32,bytes32,uint256)",
                    targets[i], uint256(0), ACCEPT, bytes32(0), bytes32(0), DELAY
                )
                : abi.encodeWithSignature(
                    "execute(address,uint256,bytes,bytes32,bytes32)",
                    targets[i], uint256(0), ACCEPT, bytes32(0), bytes32(0)
                );
            string memory entry = string.concat(
                '{"to":"', vm.toString(timelock),
                '","value":"0","data":"', vm.toString(data),
                '","contractMethod":null,"contractInputsValues":null}'
            );
            txs = i == 0 ? entry : string.concat(txs, ",", entry);
        }
        return string.concat(
            '{"version":"1.0","chainId":"4663","createdAt":0,',
            '"meta":{"name":"', name, '","description":"COUR Ownable2Step handover via TimelockController",',
            '"txBuilderVersion":"1.16.5"},',
            '"transactions":[', txs, ']}'
        );
    }
}
