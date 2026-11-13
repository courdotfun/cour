#!/usr/bin/env bash
# Build the ONE Safe MultiSend transaction that accepts ownership of all four
# Ownable2Step COUR contracts (Factory, PriceReader, FeeVault, Router), compute
# its safeTxHash + EIP-712 typed data, and print a DRY-RUN + per-owner signing
# commands (hardware-wallet friendly).
#
# Usage:  RPC_URL=<your 4663 rpc> bash script/safe/accept-ownership.sh
# Output: script/safe/out/accept.env        (TX_* , NONCE, SAFE_TX_HASH)
#         script/safe/out/accept-712.json   (EIP-712 typed data to sign)
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/safe-lib.sh"

ACCEPT="0x79ba5097" # acceptOwnership()
NONCE="$(cast call "$SAFE" "nonce()(uint256)" --rpc-url "$RPC_URL" | awk '{print $1}')"
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
write_eip712 "$ROOT/script/safe/out/accept-712.json" "$MULTISEND_CALLONLY" 0 "$TX_DATA" 1 "$NONCE"

cat <<EOF

=========================================================================
  COUR Safe — accept ownership (Factory/PriceReader/FeeVault/Router)
=========================================================================
  DRY-RUN — match this against your hardware-wallet screen:
    Safe:        $SAFE
    to:          $MULTISEND_CALLONLY   (MultiSendCallOnly)
    operation:   1 (delegatecall)      value: 0     nonce: $NONCE
    batch:       4 inner CALLs, each acceptOwnership() [selector 0x79ba5097]:
                   1) Factory      $FACTORY
                   2) PriceReader  $PRICE_READER
                   3) FeeVault     $FEE_VAULT
                   4) Router       $ROUTER
    safeTxHash:  $SAFE_TX_HASH

  STEP 1 — TWO different owners each sign (hardware wallet). Try (a); if the
  device refuses typed data, use (b):
    (a) EIP-712 (preferred, shows SafeTx on-device; signature used as-is):
        cast wallet sign --ledger --data --from-file script/safe/out/accept-712.json
        # Trezor: swap --ledger for --trezor
    (b) eth_sign fallback (blind hash; exec.sh auto-adjusts v):
        cast wallet sign --ledger $SAFE_TX_HASH
  Record which OWNER ADDRESS produced each 0x… signature.

  STEP 2 — owner #1 (largest balance) executes; sigs auto-detected/sorted/verified:
    RPC_URL=$RPC_URL bash script/safe/exec.sh script/safe/out/accept.env \\
      <ownerAddrA> <sigA> <ownerAddrB> <sigB> --ledger

  STEP 3 — verify owner()==Safe on all four:
    for C in $FACTORY $PRICE_READER $FEE_VAULT $ROUTER; do \\
      cast call \$C 'owner()(address)' --rpc-url $RPC_URL; done
=========================================================================
EOF
