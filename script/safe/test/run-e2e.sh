#!/usr/bin/env bash
# End-to-end proof for script/safe/signer.html WITHOUT the real chain/owners:
# fork a public Ethereum RPC as chain-id 4663 (so the CANONICAL Safe v1.4.1
# factory/singleton/MultiSend are present at their real addresses), deploy a real
# 2-of-3 Safe with anvil test owners + 4 Ownable2Step mocks, then drive signer.html
# in a headless browser (fake injected provider) to sign with 2 owners and execute.
# Asserts owner()==Safe on all four mocks. Nothing touches production.
#
# Usage:  MAINNET_RPC=<eth rpc> bash script/safe/test/run-e2e.sh
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
ROOT_W="$(cd "$ROOT" && pwd -W 2>/dev/null || echo "$ROOT")"
cd "$ROOT"
: "${MAINNET_RPC:=https://ethereum-rpc.publicnode.com}"
: "${ANVIL_PORT:=8545}"
ANVIL_RPC="http://127.0.0.1:${ANVIL_PORT}"
ZERO="0x0000000000000000000000000000000000000000"
MULTISEND="0x9641d764fc13c8B624c04430C7356C1C7C8102e2"

# anvil deterministic accounts (publicly known test keys — NOT secrets)
A0=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266; K0=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
A1=0x70997970C51812dc3A010C7d01b50e0d17dc79C8; K1=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
A2=0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC; K2=0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a
A3=0x90F79bf6EB2c4f870365E785982E1f101E93b906

echo "Building signer.html (inline ethers)…"
node "$HERE/../build-signer.mjs"

echo "Starting anvil fork of $MAINNET_RPC as chain 4663…"
anvil --fork-url "$MAINNET_RPC" --chain-id 4663 --port "$ANVIL_PORT" --silent &
ANVIL=$!
trap 'kill $ANVIL 2>/dev/null || true' EXIT
for i in $(seq 1 60); do cast chain-id --rpc-url "$ANVIL_RPC" >/dev/null 2>&1 && break; sleep 1; done
echo "anvil up (chain $(cast chain-id --rpc-url "$ANVIL_RPC"))"

echo "Deploying real 2-of-3 Safe (anvil owners A1/A2/A3)…"
SAFE_OUT=$(DEPLOYER_PK=$K0 OWNER_1=$A1 OWNER_2=$A2 OWNER_3=$A3 SAFE_SALT=424242 \
  forge script script/07_DeploySafe.s.sol:DeploySafe --rpc-url "$ANVIL_RPC" --broadcast --slow 2>&1)
SAFE=$(echo "$SAFE_OUT" | grep -oiE "deployed: 0x[0-9a-fA-F]{40}" | grep -oiE "0x[0-9a-fA-F]{40}" | head -1)
[ -n "$SAFE" ] || { echo "FAIL: no Safe address. forge tail:"; echo "$SAFE_OUT" | tail -20; exit 1; }
echo "Safe: $SAFE  (threshold $(cast call "$SAFE" 'getThreshold()(uint256)' --rpc-url "$ANVIL_RPC"))"

echo "Deploying 4 Ownable2Step mocks + transferOwnership(Safe)…"
MOCK_OUT=$(DEPLOYER_PK=$K0 SAFE=$SAFE \
  forge script script/safe/test/DeployMocks.s.sol:DeployMocks --rpc-url "$ANVIL_RPC" --broadcast --slow 2>&1)
pick(){ echo "$MOCK_OUT" | grep -oiE "$1=0x[0-9a-fA-F]{40}" | grep -oiE "0x[0-9a-fA-F]{40}" | head -1; }
MF=$(pick MOCK_FACTORY); MP=$(pick MOCK_PRICEREADER); MV=$(pick MOCK_FEEVAULT); MR=$(pick MOCK_ROUTER)
echo "  mocks: $MF $MP $MV $MR"
[ -n "$MF" ] && [ -n "$MP" ] && [ -n "$MV" ] && [ -n "$MR" ] || { echo "FAIL: missing mock addr"; echo "$MOCK_OUT" | tail -20; exit 1; }

echo "Building accept-712 JSON for the mocks…"
OUTJ="$ROOT_W/script/safe/test/accept-712.e2e.json"   # Windows-style path for node
HASH_JS=$(node "$HERE/build-accept-json.mjs" "$OUTJ" 4663 "$SAFE" 0 "$MF" "$MP" "$MV" "$MR")
TXDATA=$(node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('$OUTJ','utf8')).message.data)")
HASH_CAST=$(cast call "$SAFE" \
  "getTransactionHash(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,uint256)(bytes32)" \
  "$MULTISEND" 0 "$TXDATA" 1 0 0 0 "$ZERO" "$ZERO" 0 --rpc-url "$ANVIL_RPC")
echo "  safeTxHash (browser-math) = $HASH_JS"
echo "  safeTxHash (cast on-chain)= $HASH_CAST"
[ "$(echo "$HASH_JS" | tr A-Z a-z)" = "$(echo "$HASH_CAST" | tr A-Z a-z)" ] || { echo "FAIL: hash mismatch"; exit 1; }
echo "  hash cross-check OK ✓"

echo "Writing e2e config…"
CFG="$HERE/e2e.config.json"
cat > "$CFG" <<JSON
{
  "signerHtml": "/$ROOT_W/script/safe/signer.html",
  "anvilRpc": "$ANVIL_RPC",
  "acceptJson": "$OUTJ",
  "safe": "$SAFE",
  "mocks": ["$MF","$MP","$MV","$MR"],
  "ownerA": { "addr": "$A1", "key": "$K1" },
  "ownerB": { "addr": "$A2", "key": "$K2" },
  "executor": { "addr": "$A1", "key": "$K1" }
}
JSON

echo "Running Playwright E2E…"
node "$HERE/e2e.mjs" "$CFG"

echo "=== ASSERT owner()==Safe on all 4 mocks (independent cast check) ==="
PASS=1
for N in "factory:$MF" "priceReader:$MP" "feeVault:$MV" "router:$MR"; do
  o=$(cast call "${N#*:}" "owner()(address)" --rpc-url "$ANVIL_RPC")
  if [ "$(echo "$o" | tr A-Z a-z)" = "$(echo "$SAFE" | tr A-Z a-z)" ]; then echo "  ${N%%:*}: OK ($o)"; else echo "  ${N%%:*}: FAIL ($o)"; PASS=0; fi
done
[ "$PASS" = 1 ] && echo "E2E PASSED ✅" || { echo "E2E FAILED ❌"; exit 1; }
