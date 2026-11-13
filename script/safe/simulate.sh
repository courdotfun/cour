#!/usr/bin/env bash
# End-to-end dry run of the Safe acceptOwnership flow on an anvil FORK of 4663,
# using FAKE owners (anvil default accounts) whose keys we control. Proves the
# whole mechanism — safeTxHash, --no-hash signing, ascending-address sig sort,
# MultiSend delegatecall, execTransaction — results in owner()==Safe on all four
# contracts. Does NOT touch the real Safe or real owners.
#
# Usage:  FORK_RPC=http://127.0.0.1:8599 bash script/safe/simulate.sh
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
ROOT_NODE="$(cd "$ROOT" && pwd -W 2>/dev/null || echo "$ROOT")"
cd "$ROOT"   # forge needs cwd at the foundry project root (relative script paths)
: "${FORK_RPC:=http://127.0.0.1:8599}"
ANVIL_RPC="http://127.0.0.1:8545"

# anvil deterministic accounts (publicly known test keys — NOT secrets)
A0=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266; K0=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
A1=0x70997970C51812dc3A010C7d01b50e0d17dc79C8; K1=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
A2=0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC; K2=0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a
A3=0x90F79bf6EB2c4f870365E785982E1f101E93b906; K3=0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6

dep(){ node -e "const d=JSON.parse(require('fs').readFileSync('$ROOT_NODE/deployments/4663.json','utf8'));process.stdout.write(String(d['$1']||''))"; }
DEPLOYER=$(dep deployer); FACTORY=$(dep factory); PR=$(dep priceReader); FV=$(dep feeVault); RT=$(dep router)

echo "Starting anvil fork of 4663…"
anvil --fork-url "$FORK_RPC" --chain-id 4663 --silent &
ANVIL=$!
trap 'kill $ANVIL 2>/dev/null || true' EXIT
for i in $(seq 1 30); do cast chain-id --rpc-url "$ANVIL_RPC" >/dev/null 2>&1 && break; sleep 1; done
echo "anvil up (chain $(cast chain-id --rpc-url $ANVIL_RPC))"

# fund deployer, the fake-safe deployer (A0), and an executor on the fork
for ACC in "$DEPLOYER" "$A0" "$A1" "$A2"; do
  cast rpc anvil_setBalance "$ACC" 0xDE0B6B3A7640000 --rpc-url "$ANVIL_RPC" >/dev/null
done

echo "Deploying FAKE 2-of-3 Safe (anvil owners)…"
OUT=$(DEPLOYER_PK=$K0 OWNER_1=$A1 OWNER_2=$A2 OWNER_3=$A3 SAFE_SALT=987654321 \
  forge script script/07_DeploySafe.s.sol:DeploySafe --rpc-url "$ANVIL_RPC" --broadcast --slow 2>&1 || true)
set +e +o pipefail
FAKE_SAFE=$(echo "$OUT" | grep -oiE "deployed: 0x[0-9a-fA-F]{40}" | grep -oE "0x[0-9a-fA-F]{40}" | head -1)
set -e -o pipefail
echo "fake Safe: $FAKE_SAFE"
[ -n "$FAKE_SAFE" ] || { echo "FAIL: deploy produced no safe. forge output:"; echo "$OUT" | tail -25; exit 1; }

echo "Impersonating deployer → transferOwnership(fakeSafe) on 4 contracts…"
cast rpc anvil_impersonateAccount "$DEPLOYER" --rpc-url "$ANVIL_RPC" >/dev/null
for C in "$FACTORY" "$PR" "$FV" "$RT"; do
  cast send "$C" "transferOwnership(address)" "$FAKE_SAFE" --from "$DEPLOYER" --unlocked --rpc-url "$ANVIL_RPC" >/dev/null
done

echo "Building accept tx for the fake Safe…"
SAFE="$FAKE_SAFE" RPC_URL="$ANVIL_RPC" bash "$HERE/accept-ownership.sh" >/dev/null
# shellcheck disable=SC1091
source "$ROOT/script/safe/out/accept.env"
echo "safeTxHash: $SAFE_TX_HASH"

echo "Two owners sign (--no-hash) …"
SIG1=$(cast wallet sign --no-hash "$SAFE_TX_HASH" --private-key "$K1")
SIG2=$(cast wallet sign --no-hash "$SAFE_TX_HASH" --private-key "$K2")

echo "execTransaction via exec.sh (auto-sorted) …"
SAFE="$FAKE_SAFE" RPC_URL="$ANVIL_RPC" bash "$HERE/exec.sh" "$ROOT/script/safe/out/accept.env" \
  "$A1" "$SIG1" "$A2" "$SIG2" --private-key "$K1" >/dev/null
echo "executed."

echo "=== ASSERT owner()==fakeSafe on all 4 ==="
PASS=1
for N in "factory:$FACTORY" "priceReader:$PR" "feeVault:$FV" "router:$RT"; do
  o=$(cast call "${N#*:}" "owner()(address)" --rpc-url "$ANVIL_RPC")
  if [ "$(echo "$o" | tr A-Z a-z)" = "$(echo "$FAKE_SAFE" | tr A-Z a-z)" ]; then echo "  ${N%%:*}: OK ($o)"; else echo "  ${N%%:*}: FAIL ($o)"; PASS=0; fi
done
[ "$PASS" = 1 ] && echo "SIMULATION PASSED ✅" || { echo "SIMULATION FAILED ❌"; exit 1; }
