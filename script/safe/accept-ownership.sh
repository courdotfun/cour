#!/usr/bin/env bash
# Build the ONE Safe MultiSend transaction that accepts ownership of all four
# Ownable2Step COUR contracts (Factory, PriceReader, FeeVault, Router), compute
# its safeTxHash, and print the exact per-owner signing commands.
#
# Usage:  RPC_URL=<your 4663 rpc> bash script/safe/accept-ownership.sh
# Output: script/safe/out/accept.env  (TX_TO, TX_DATA, TX_OP, NONCE, SAFE_TX_HASH)
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/safe-lib.sh"

ACCEPT="0x79ba5097" # acceptOwnership()
NONCE="$(cast call "$SAFE" "nonce()(uint256)" --rpc-url "$RPC_URL" | awk '{print $1}')"

# Pack 4 acceptOwnership CALLs into MultiSend `transactions` bytes (ms_pack → raw hex).
PACKED="0x$(ms_pack "$FACTORY" 0 "$ACCEPT")$(ms_pack "$PRICE_READER" 0 "$ACCEPT")$(ms_pack "$FEE_VAULT" 0 "$ACCEPT")$(ms_pack "$ROUTER" 0 "$ACCEPT")"
TX_DATA="$(cast calldata "multiSend(bytes)" "$PACKED")"
SAFE_TX_HASH="$(safe_tx_hash "$TX_DATA" "$NONCE")"

mkdir -p "$ROOT/script/safe/out"
cat > "$ROOT/script/safe/out/accept.env" <<EOF
# COUR Safe acceptOwnership (MultiSend) — generated $(date -u +%Y-%m-%dT%H:%M:%SZ)
SAFE=$SAFE
TX_TO=$MULTISEND_CALLONLY
TX_VALUE=0
TX_OP=1
TX_DATA=$TX_DATA
NONCE=$NONCE
SAFE_TX_HASH=$SAFE_TX_HASH
EOF

cat <<EOF

=========================================================================
  COUR Safe — accept ownership of Factory/PriceReader/FeeVault/Router
=========================================================================
  Safe:        $SAFE
  Via:         MultiSendCallOnly $MULTISEND_CALLONLY (operation=1 delegatecall)
  Nonce:       $NONCE
  safeTxHash:  $SAFE_TX_HASH

  STEP 1 — TWO different owners each sign the hash (hardware wallet):
    Ledger:  cast wallet sign --ledger      --no-hash $SAFE_TX_HASH
    Trezor:  cast wallet sign --trezor       --no-hash $SAFE_TX_HASH
    (--no-hash signs the raw safeTxHash = Safe EIP-712 digest; gives v=27/28.)
    Each prints a 0x…(65-byte) signature. Note which OWNER ADDRESS produced it.

  STEP 2 — execute (any one owner, needs gas), signatures auto-sorted:
    RPC_URL=$RPC_URL bash script/safe/exec.sh script/safe/out/accept.env \\
      <ownerAddrA> <sigA> <ownerAddrB> <sigB> --ledger

  STEP 3 — verify:
    for C in $FACTORY $PRICE_READER $FEE_VAULT $ROUTER; do \\
      cast call \$C 'owner()(address)' --rpc-url $RPC_URL; done
    # all four must equal the Safe $SAFE
=========================================================================
EOF
