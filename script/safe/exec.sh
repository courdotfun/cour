#!/usr/bin/env bash
# Combine two owner signatures (sorted by owner address ASCENDING, as Safe requires)
# and submit execTransaction. One owner (or any funded account) pays gas.
#
# Usage:
#   RPC_URL=<rpc> bash script/safe/exec.sh <txEnvFile> <addrA> <sigA> <addrB> <sigB> <senderFlags...>
#   senderFlags: --ledger | --trezor | --private-key 0x<key>  (passed to `cast send`)
# Example:
#   RPC_URL=$RH_RPC_URL bash script/safe/exec.sh script/safe/out/accept.env \
#     0xAAAA… 0xsigA… 0xBBBB… 0xsigB… --ledger
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/safe-lib.sh"

TXF="$1"; A1="$2"; S1="$3"; A2="$4"; S2="$5"; shift 5
SENDER_FLAGS=("$@")
[ -f "$TXF" ] || { echo "tx env file not found: $TXF"; exit 1; }
# shellcheck disable=SC1090
source "$TXF"

lc() { echo "$1" | tr 'A-Z' 'a-z'; }
la="$(lc "$A1")"; lb="$(lc "$A2")"
[ "$la" = "$lb" ] && { echo "the two signers must be different owners"; exit 1; }

# Concatenate signatures in ascending owner-address order.
if [[ "$la" < "$lb" ]]; then
  SIGS="0x$(strip0x "$S1")$(strip0x "$S2")"
else
  SIGS="0x$(strip0x "$S2")$(strip0x "$S1")"
fi

echo "Safe:        $SAFE"
echo "to/op:       $TX_TO / op=$TX_OP   nonce=$NONCE"
echo "safeTxHash:  ${SAFE_TX_HASH:-<n/a>}"
echo "signatures:  ${#SIGS} chars (2 x 65-byte, sorted)"
echo "submitting execTransaction…"

cast send "$SAFE" \
  "execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes)" \
  "$TX_TO" "${TX_VALUE:-0}" "$TX_DATA" "$TX_OP" 0 0 0 "$ZERO" "$ZERO" "$SIGS" \
  --rpc-url "$RPC_URL" "${SENDER_FLAGS[@]}"
