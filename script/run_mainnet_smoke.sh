#!/usr/bin/env bash
# Mainnet smoke test driver (docs §7.3). Assumes 01_DeployCore + 02_ConfigureStocks already ran on
# mainnet (deployments/4663.json exists, NVDA allowlisted, TEST params 40/600, deployer allowlisted).
# Runs phase A (acquire NVDA + launch), waits past the 5s anti-snipe window, runs phase B (trade ->
# graduate -> LP NFT to DEAD -> pool swaps -> buyback -> claims), then restores params to 4000/60000.
# Usage: bash script/run_mainnet_smoke.sh
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env; set +a
RPC="$RH_RPC_URL"
LOG=docs/_mainnet_smoke.log
: > "$LOG"

echo "[smoke] deployer balance: $(cast balance $DEPLOYER_ADDRESS --rpc-url $RPC)"
run() { echo "=== $1 ===" | tee -a "$LOG"; forge script "$1" --rpc-url "$RPC" --broadcast --slow 2>&1 | tee -a "$LOG"; }

run script/05a_SmokeLaunch.s.sol:SmokeLaunch
echo "[smoke] waiting 12s for the anti-snipe window to clear..."
sleep 12
run script/05b_SmokeTrade.s.sol:SmokeTrade
run script/06_RestoreParams.s.sol:RestoreParams

echo "[smoke] DONE. Tx hashes are in broadcast/*/4663/run-latest.json and $LOG"
echo "[smoke] Explorer: https://robin.etherscan.io/address/$DEPLOYER_ADDRESS"
