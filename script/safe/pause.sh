#!/usr/bin/env bash
# Build a Safe transaction to call COURFactory.setLaunchesPaused(bool) — the
# emergency "stop new launches" switch — once the Safe owns the Factory.
# (Single direct CALL, operation=0; no MultiSend needed.)
#
# Usage:  RPC_URL=<rpc> bash script/safe/pause.sh true    # pause new launches
#         RPC_URL=<rpc> bash script/safe/pause.sh false   # resume
# Output: script/safe/out/pause-<true|false>.env  + signing/exec instructions.
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/safe-lib.sh"

VAL="${1:-true}"
[ "$VAL" = "true" ] || [ "$VAL" = "false" ] || { echo "usage: pause.sh <true|false>"; exit 1; }

TX_DATA="$(cast calldata "setLaunchesPaused(bool)" "$VAL")"
NONCE="$(cast call "$SAFE" "nonce()(uint256)" --rpc-url "$RPC_URL" | awk '{print $1}')"
SAFE_TX_HASH="$(safe_tx_hash_call "$FACTORY" "$TX_DATA" "$NONCE")"

mkdir -p "$ROOT/script/safe/out"
OUT="$ROOT/script/safe/out/pause-$VAL.env"
cat > "$OUT" <<EOF
# COUR Safe setLaunchesPaused($VAL) — generated $(date -u +%Y-%m-%dT%H:%M:%SZ)
SAFE=$SAFE
TX_TO=$FACTORY
TX_VALUE=0
TX_OP=0
TX_DATA=$TX_DATA
NONCE=$NONCE
SAFE_TX_HASH=$SAFE_TX_HASH
EOF

cat <<EOF

=========================================================================
  COUR Safe — setLaunchesPaused($VAL)   (incident switch; onlyOwner)
=========================================================================
  Safe:        $SAFE
  Target:      COURFactory $FACTORY (operation=0 CALL)
  Nonce:       $NONCE
  safeTxHash:  $SAFE_TX_HASH

  TWO owners sign:
    cast wallet sign --ledger --no-hash $SAFE_TX_HASH      # (or --trezor)
  Execute:
    RPC_URL=$RPC_URL bash script/safe/exec.sh $OUT \\
      <ownerAddrA> <sigA> <ownerAddrB> <sigB> --ledger
  Verify:
    cast call $FACTORY 'launchesPaused()(bool)' --rpc-url $RPC_URL   # expect $VAL
=========================================================================
EOF
