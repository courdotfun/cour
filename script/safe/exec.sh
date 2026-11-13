#!/usr/bin/env bash
# Combine two owner signatures and submit execTransaction. For each signature we
# AUTO-DETECT the scheme (EIP-712 v=27/28 used as-is, or eth_sign personal_sign
# which we adjust to v=31/32) by verifying it against Safe.checkNSignatures
# (eth_call). We then verify the COMBINED 2-of-3 set (and simulate the whole
# execTransaction) BEFORE broadcasting, and refuse if anything fails.
#
# Usage:
#   RPC_URL=<rpc> bash script/safe/exec.sh <txEnvFile> <addrA> <sigA> <addrB> <sigB> <senderFlags...>
#   senderFlags: --ledger | --trezor | --private-key 0x<key>
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/safe-lib.sh"

TXF="$1"; A1="$2"; S1="$3"; A2="$4"; S2="$5"; shift 5
SENDER_FLAGS=("$@")
[ -f "$TXF" ] || { echo "tx env file not found: $TXF"; exit 1; }
# shellcheck disable=SC1090
source "$TXF"
H="$SAFE_TX_HASH"
[ -n "$H" ] || { echo "SAFE_TX_HASH missing in $TXF"; exit 1; }

lc() { echo "$1" | tr 'A-Z' 'a-z'; }
[ "$(lc "$A1")" = "$(lc "$A2")" ] && { echo "the two signers must be different owners"; exit 1; }

echo "Verifying signatures against the Safe (checkNSignatures eth_call)…"
N1="$(normalize_sig "$H" "$S1")" || { echo "REJECT: signature from $A1 is not a valid owner signature for this hash"; exit 1; }
N2="$(normalize_sig "$H" "$S2")" || { echo "REJECT: signature from $A2 is not a valid owner signature for this hash"; exit 1; }
sch(){ local v; v="$(( 16#${1: -2} ))"; if [ "$v" -ge 31 ]; then echo eth_sign; else echo eip712; fi; }
echo "  $A1: valid ($(sch "$N1"))"
echo "  $A2: valid ($(sch "$N2"))"

# Concatenate in ascending owner-address order (Safe requirement).
if [[ "$(lc "$A1")" < "$(lc "$A2")" ]]; then SIGS="0x$(strip0x "$N1")$(strip0x "$N2")"; else SIGS="0x$(strip0x "$N2")$(strip0x "$N1")"; fi

echo "Verifying the combined 2-of-3 set…"
cast call "$SAFE" "checkNSignatures(bytes32,bytes,bytes,uint256)" "$H" 0x "$SIGS" 2 --rpc-url "$RPC_URL" >/dev/null \
  || { echo "REJECT: combined signatures failed checkNSignatures (wrong owners/order/threshold)"; exit 1; }

echo "Simulating execTransaction (eth_call)…"
OKSIM=$(cast call "$SAFE" \
  "execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes)(bool)" \
  "$TX_TO" "${TX_VALUE:-0}" "$TX_DATA" "$TX_OP" 0 0 0 "$ZERO" "$ZERO" "$SIGS" --rpc-url "$RPC_URL" 2>&1) \
  || { echo "REJECT: execTransaction simulation reverted: $OKSIM"; exit 1; }
echo "  simulation OK (returns $OKSIM)"

echo "Broadcasting execTransaction…"
cast send "$SAFE" \
  "execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes)" \
  "$TX_TO" "${TX_VALUE:-0}" "$TX_DATA" "$TX_OP" 0 0 0 "$ZERO" "$ZERO" "$SIGS" \
  --rpc-url "$RPC_URL" "${SENDER_FLAGS[@]}"
