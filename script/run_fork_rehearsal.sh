#!/usr/bin/env bash
# Fork rehearsal (docs §5): spin up an anvil fork of Robinhood Chain mainnet, deploy the full COUR core,
# configure NVDA with TEST params, and run the complete smoke test (launch -> buys -> sell -> graduate ->
# LP NFT to DEAD -> pool swaps -> buyback -> claims -> HOLDERS launch). No real funds required.
# Usage: bash script/run_fork_rehearsal.sh   (expects .env with RH_RPC_URL, DEPLOYER_PK, DEPLOYER_ADDRESS, TREASURY)
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env; set +a

RPC_LOCAL=http://127.0.0.1:8545
LOG=docs/_rehearsal_fork.log
: > "$LOG"

echo "[rehearsal] starting anvil fork of $RH_RPC_URL (chain 4663)..."
anvil --fork-url "$RH_RPC_URL" --chain-id 4663 --port 8545 --silent &
ANVIL_PID=$!
trap 'kill $ANVIL_PID 2>/dev/null || true' EXIT

# Wait for anvil to be ready.
for i in $(seq 1 30); do
  if cast chain-id --rpc-url $RPC_LOCAL >/dev/null 2>&1; then break; fi
  sleep 1
done
echo "[rehearsal] anvil ready, chain-id=$(cast chain-id --rpc-url $RPC_LOCAL)"

# Fund the deployer with 100 ETH on the fork (0x56BC75E2D63100000).
cast rpc anvil_setBalance "$DEPLOYER_ADDRESS" 0x56BC75E2D63100000 --rpc-url $RPC_LOCAL >/dev/null
echo "[rehearsal] deployer balance: $(cast balance $DEPLOYER_ADDRESS --rpc-url $RPC_LOCAL)"

export SMOKE_HOLDERS=true # fork has plenty of funds: exercise the HOLDERS path too
run() { echo "=== $1 ===" | tee -a "$LOG"; forge script "$1" --rpc-url $RPC_LOCAL --broadcast 2>&1 | tee -a "$LOG" | grep -E "script ran|Logs:|  [A-Za-z]|address|positionId|graduated|claimed|buyback" || true; }

run script/01_DeployCore.s.sol:DeployCore
run script/02_ConfigureStocks.s.sol:ConfigureStocks
run script/05a_SmokeLaunch.s.sol:SmokeLaunch

echo "[rehearsal] advancing time +10s past the anti-snipe window"
cast rpc evm_increaseTime 10 --rpc-url $RPC_LOCAL >/dev/null
cast rpc evm_mine --rpc-url $RPC_LOCAL >/dev/null

run script/05b_SmokeTrade.s.sol:SmokeTrade
run script/06_RestoreParams.s.sol:RestoreParams

echo "[rehearsal] DONE. Full log: $LOG"
