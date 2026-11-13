#!/usr/bin/env bash
# Shared helpers for driving the COUR Safe (2-of-3) on Robinhood Chain (4663)
# WITHOUT app.safe.global (which doesn't support chain 4663). Pure cast/foundry.
#
# Signature scheme: owners sign the raw safeTxHash (which IS the Safe EIP-712
# digest returned by getTransactionHash) with NO message prefix (`--no-hash`),
# producing v=27/28 — exactly what Safe's checkSignatures expects for the EIP-712
# path (ecrecover(safeTxHash, v, r, s) == owner). Signatures are concatenated in
# ASCENDING owner-address order (Safe requirement).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# node on Windows/Git-Bash needs a drive-letter path (pwd -W), not MSYS /c/...
ROOT_NODE="$(cd "$ROOT" && pwd -W 2>/dev/null || echo "$ROOT")"
DEPLOY_JSON="$ROOT_NODE/deployments/4663.json"

# Read a JSON field from deployments/4663.json (e.g. dep .factory)
dep() { node -e "const d=JSON.parse(require('fs').readFileSync('$DEPLOY_JSON','utf8'));const p='$1'.replace(/^\./,'').split('.');let v=d;for(const k of p)v=v?.[k];process.stdout.write(String(v??''))"; }

# Read a key from the repo .env (value only; never printed by callers).
envval() { grep -E "^$1=" "$ROOT/.env" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r"'; }

: "${RPC_URL:=$(envval RH_RPC_URL)}"          # owners: your own 4663 RPC
: "${SAFE:=}"                                  # allow override (e.g. fork sim)
[ -z "$SAFE" ] && SAFE="$(dep .safeMultisig)"
[ -z "$SAFE" ] && SAFE="$(envval MULTISIG)"
FACTORY="$(dep .factory)"
PRICE_READER="$(dep .priceReader)"
FEE_VAULT="$(dep .feeVault)"
ROUTER="$(dep .router)"

# Canonical Safe v1.4.1 MultiSendCallOnly (CALL-only; verified live on 4663).
MULTISEND_CALLONLY="0x9641d764fc13c8B624c04430C7356C1C7C8102e2"
ZERO="0x0000000000000000000000000000000000000000"

# strip 0x and l-pad/upper helpers
strip0x() { echo "${1#0x}"; }

# Pack ONE MultiSend inner call (operation=0 CALL): op(1) to(20) value(32) len(32) data
# usage: ms_pack <to> <valueWei> <dataHex0x>
ms_pack() {
  local to data len
  to="$(printf '%040s' "$(strip0x "$1")" | tr ' ' 0)"
  local val; val="$(printf '%064x' "$2")"
  data="$(strip0x "$3")"
  len="$(printf '%064x' $(( ${#data} / 2 )))"
  printf '00%s%s%s%s' "$to" "$val" "$len" "$data"
}

# getTransactionHash for a MultiSend-delegatecall tx (operation=1), current nonce.
# usage: safe_tx_hash <multisendCalldata0x> <nonce>
safe_tx_hash() {
  cast call "$SAFE" \
    "getTransactionHash(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,uint256)(bytes32)" \
    "$MULTISEND_CALLONLY" 0 "$1" 1 0 0 0 "$ZERO" "$ZERO" "$2" --rpc-url "$RPC_URL"
}

# getTransactionHash for a direct single CALL (operation=0) to `to` with `data`.
# usage: safe_tx_hash_call <to> <data0x> <nonce>
safe_tx_hash_call() {
  cast call "$SAFE" \
    "getTransactionHash(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,uint256)(bytes32)" \
    "$1" 0 "$2" 0 0 0 0 "$ZERO" "$ZERO" "$3" --rpc-url "$RPC_URL"
}

# Write the EIP-712 SafeTx typed-data JSON (for `cast wallet sign --data`).
# usage: write_eip712 <outfile> <to> <value> <data0x> <operation> <nonce>
write_eip712() {
  node "$ROOT_NODE/script/safe/make-712.mjs" "$1" 4663 "$SAFE" "$2" "$3" "$4" "$5" "$6" 1>&2
}

# Verify a SINGLE signature against the Safe via checkNSignatures (eth_call).
# Returns 0 (valid, signer is an owner) / non-zero otherwise.
verify_sig_single() { # <safeTxHash> <sig0x>
  cast call "$SAFE" "checkNSignatures(bytes32,bytes,bytes,uint256)" "$1" 0x "$2" 1 --rpc-url "$RPC_URL" >/dev/null 2>&1
}

# Flip a 65-byte signature's v byte by +4 (EIP-712 27/28 -> eth_sign 31/32).
flip_v_plus4() { # <sig0x> -> prints adjusted sig
  local s v; s="$(strip0x "$1")"; v=$(( 16#${s: -2} + 4 ))
  printf '0x%s%02x' "${s:0:128}" "$v"
}

# Normalize a signature to a Safe-valid form: as-is if it verifies (EIP-712
# path a), else try v+4 (eth_sign path b). Prints the valid sig; empty on failure.
normalize_sig() { # <safeTxHash> <sig0x>
  if verify_sig_single "$1" "$2"; then echo "$2"; return 0; fi
  local f; f="$(flip_v_plus4 "$2")"
  if verify_sig_single "$1" "$f"; then echo "$f"; return 0; fi
  return 1
}
