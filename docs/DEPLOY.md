# Deploy Runbook (Robinhood Chain mainnet, chainId 4663)

## 0. Prerequisites
- Foundry (built with forge 1.7.1), `git`.
- `./bootstrap.sh` to fetch dependencies (`lib/` is gitignored).
- Fill `.env` from `.env.example`:
  - `RH_RPC_URL=https://rpc.mainnet.chain.robinhood.com` (the bare `rpc.chain.robinhood.com` is DEAD)
  - `DEPLOYER_PK`, `DEPLOYER_ADDRESS`, `TREASURY` (defaults to the deployer for tests)
  - `ETHERSCAN_API_KEY` (for robin.etherscan.io), optional `BLOCKSCOUT_API_KEY`
- Fund the deployer with ETH on mainnet (gas + ~$180 for the smoke-test swaps).

## 1. Verify the chain (verified 2026-10-29; see CHAIN_FACTS.md)
```
forge test --match-path 'test/fork/*' -vv        # runs against RH_RPC_URL (mainnet fork)
```
Confirms every spec address has code, NVDA metadata/ERC-8056, the NVDA/USDG TWAP (~$214), and that
graduation mints the LP NFT to DEAD against the REAL PositionManager. Cancun/TSTORE is confirmed by the
live v4 PoolManager. (`script/00_VerifyChain.s.sol` is the script equivalent.)

## 2. Rehearse the WHOLE flow on a fork first (no real funds)
```
bash script/run_fork_rehearsal.sh
```
Forks mainnet with anvil, funds the deployer locally, then runs deploy → configure → smoke
(launch → buys → sell → graduate → LP-NFT-to-DEAD → pool swaps → buyback → claims → HOLDERS launch),
advancing time past the 5s anti-snipe window. Output: `docs/REHEARSAL_FORK_RESULT.md`.

## 3. Deploy core (mainnet)
```
forge script script/01_DeployCore.s.sol --rpc-url $RH_RPC_URL            # dry-run
forge script script/01_DeployCore.s.sol --rpc-url $RH_RPC_URL --broadcast --slow
```
Deploys in one nonce sequence: PriceReader → FeeVault → CurveImpl → Hook (CREATE2, HookMiner salt) →
Factory (address predicted & asserted) → Router; wires the vault; sets the factory as the PriceReader's
authorized setter. Writes `deployments/4663.json` (commit it).

## 4. Configure the closed test phase
```
forge script script/02_ConfigureStocks.s.sol --rpc-url $RH_RPC_URL --broadcast --slow
```
Bumps v3 cardinality (the live NVDA/USDG pool is already mature, so the 1800s TWAP is available),
allowlists NVDA with its USDG ref pool, sets the WETH→USDG→NVDA ETH-in path, allowlists ONLY the
deployer, and sets CHEAP TEST launch params (start $40 / grad $600). The launch allowlist ships enabled.

## 5. Smoke test (mainnet)
```
bash script/run_mainnet_smoke.sh
```
Runs phase A (acquire NVDA + launch CTEST/CTEST2), waits >5s, phase B (trade → graduate → verify the LP
NFT is owned by DEAD → pool swaps → buyback → claimPlatform → HOLDERS claimHolder), then restores params
to 4000/60000 (allowlist stays enabled). Tx hashes land in `broadcast/*/4663/run-latest.json`.
Result write-up: `docs/MAINNET_SMOKE_RESULT.md`.

## 6. Verify contracts on robin.etherscan.io (Etherscan API v2)
Robinhood's explorer is Etherscan-powered; use the v2 multichain endpoint with `chainid=4663`:
```
forge verify-contract <addr> src/COURFactory.sol:COURFactory \
  --verifier etherscan --verifier-url 'https://api.etherscan.io/v2/api?chainid=4663' \
  --etherscan-api-key $ETHERSCAN_API_KEY --constructor-args <abi-encoded-args> --watch
```
Blockscout fallback:
```
forge verify-contract <addr> src/COURFactory.sol:COURFactory \
  --verifier blockscout --verifier-url https://robinhoodchain.blockscout.com/api --chain 4663 \
  --constructor-args <abi-encoded-args>
```
Repeat for hook/curveImpl/vault/router/priceReader. Use `cast abi-encode` for constructor args.
(The method that actually worked is recorded in MAINNET_SMOKE_RESULT.md after the run.)

## 7. Hand over ownership (NOT part of the closed test; do when a multisig exists)
Deploy/confirm a Safe multisig, set `MULTISIG`, then:
```
forge script script/04_HandOver.s.sol --rpc-url $RH_RPC_URL --broadcast
```
Deploys a 48h TimelockController (proposer/executor = multisig) and initiates the Ownable2Step transfer
of factory/reader/vault/router; the timelock then `acceptOwnership()` on each via a scheduled op.

## Notes
- Never commit `.env` or print the private key. `launchFee = 0`; creators pay only gas.
- Keep the launch allowlist ENABLED until the public opening is explicitly decided.
- Transient storage (Cancun) is confirmed on-chain; no fallback guard needed.
