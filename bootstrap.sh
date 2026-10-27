#!/usr/bin/env bash
# Reproduces the exact dependency tree for COUR Phase 1.
# `lib/` is gitignored; run this once after cloning.
set -euo pipefail

forge install foundry-rs/forge-std --no-git
forge install OpenZeppelin/openzeppelin-contracts@v5.1.0 --no-git
forge install Vectorized/solady --no-git
forge install Uniswap/v4-periphery --no-git

# v4-periphery ships its own pinned, self-consistent v4-core + permit2 + solmate
# as git submodules. forge --no-git does not populate them, so init them here.
( cd lib/v4-periphery && git submodule update --init --recursive )

# The top-level v4-core forge pulls has empty submodules under --no-git and is
# unused: all v4-core imports resolve to lib/v4-periphery/lib/v4-core via
# remappings.txt. Remove it to avoid a broken, half-populated copy.
rm -rf lib/v4-core

echo "bootstrap complete — run: forge build && forge test"
