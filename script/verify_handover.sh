#!/usr/bin/env bash
# Prove the COUR admin handover on-chain:
#   1. owner() == $TIMELOCK for factory / priceReader / feeVault / router
#   2. the deployer EOA is powerless (an admin call reverts)
# Requires: cast, TIMELOCK env, RH_RPC_URL env (or default public RPC).
set -euo pipefail

RPC="${RH_RPC_URL:-https://rpc.mainnet.chain.robinhood.com}"
DEP="deployments/4663.json"
TIMELOCK="${TIMELOCK:?set TIMELOCK=0x... (printed by 04_HandOver)}"

read_addr() { node -e "console.log(require('./$DEP').$1)"; }

FACTORY=$(read_addr factory)
PRICE=$(read_addr priceReader)
VAULT=$(read_addr feeVault)
ROUTER=$(read_addr router)
DEPLOYER=$(read_addr deployer)

tl=$(echo "$TIMELOCK" | tr '[:upper:]' '[:lower:]')
fail=0

check_owner() {
  local name="$1" addr="$2"
  local owner
  owner=$(cast call "$addr" "owner()(address)" --rpc-url "$RPC" | tr '[:upper:]' '[:lower:]')
  if [ "$owner" = "$tl" ]; then
    echo "  OK   $name owner() == TIMELOCK"
  else
    echo "  FAIL $name owner() = $owner (expected $tl)"
    fail=1
  fi
}

echo "== owner() checks (expect == $TIMELOCK) =="
check_owner factory "$FACTORY"
check_owner priceReader "$PRICE"
check_owner feeVault "$VAULT"
check_owner router "$ROUTER"

echo "== deployer powerless check =="
# An admin-only call from the deployer must revert now that owner == timelock.
if cast call "$FACTORY" "setLaunchesPaused(bool)" true --from "$DEPLOYER" --rpc-url "$RPC" >/dev/null 2>&1; then
  echo "  FAIL deployer setLaunchesPaused did NOT revert — deployer still has power"
  fail=1
else
  echo "  OK   deployer setLaunchesPaused reverts (no admin power)"
fi

if [ "$fail" = 0 ]; then
  echo "HANDOVER VERIFIED ✓  — now remove DEPLOYER_PK from .env"
else
  echo "HANDOVER NOT COMPLETE ✗ (acceptOwnership may still be pending the 48h timelock)"
  exit 1
fi
