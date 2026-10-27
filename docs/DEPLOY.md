# Deploy Runbook

## 0. Prerequisites
- Foundry (this repo built with forge 1.7.1), `git`.
- `./bootstrap.sh` to fetch dependencies (`lib/` is gitignored).
- Fill `.env` from `.env.example`: `RH_RPC_URL`, `DEPLOYER_PK`, `TREASURY`, `MULTISIG`, optional `BLOCKSCOUT_API_KEY`.

## 1. Verify the chain (required first)
```
forge script script/00_VerifyChain.s.sol --rpc-url $RH_RPC_URL
```
Confirms every §2 address has code, prints NVDA decimals and the NVDA/USDG pool tick. Record results in `docs/CHAIN_FACTS.md` under "Verified / Corrected". Also confirm the chain supports Cancun/transient storage.

## 2. Deploy core (order enforced by the script)
```
forge script script/01_DeployCore.s.sol --rpc-url $RH_RPC_URL           # dry-run
forge script script/01_DeployCore.s.sol --rpc-url $RH_RPC_URL --broadcast
```
Deploys, in one nonce sequence: PriceReader → FeeVault → CurveImpl → Hook (CREATE2, salt mined by HookMiner for the permission bits) → Factory (address predicted & asserted) → Router; then wires the vault and sets the factory as the PriceReader's authorized setter. Note the printed addresses.

## 3. Configure stocks
Set `COUR_FACTORY` and `COUR_PRICE_READER` in `.env`, fill `wethUsdgPool` in `script/config/rh-mainnet.json` if using the WETH route, then:
```
forge script script/02_ConfigureStocks.s.sol --rpc-url $RH_RPC_URL --broadcast
```
Bumps v3 observation cardinality (wait for the TWAP window to fill before launching) and allowlists NVDA with its USDG reference pool. Repeat per additional stock.

## 4. Rehearse on a fork (recommended)
```
anvil --fork-url $RH_RPC_URL --chain-id 4663 &
forge script script/03_LaunchRehearsal.s.sol --rpc-url http://127.0.0.1:8545
```
(Fork-free equivalent, always runnable: `forge test --match-test test_rehearsal` → writes `docs/REHEARSAL_RESULT.md`.)

## 5. Hand over ownership
Deploy/confirm a Safe multisig on Robinhood Chain, set `MULTISIG`, `COUR_FEE_VAULT`:
```
forge script script/04_HandOver.s.sol --rpc-url $RH_RPC_URL --broadcast
```
Deploys a 48h `TimelockController` (proposer/executor = multisig) and initiates `Ownable2Step` transfer of factory/reader/vault. The timelock must then `acceptOwnership()` on each via a scheduled multisig op.

## 6. Verify contracts on Blockscout
```
forge verify-contract <addr> src/COURFactory.sol:COURFactory \
  --verifier blockscout --verifier-url https://robinhoodchain.blockscout.com/api \
  --chain 4663 --constructor-args <abi-encoded-args>
```
Repeat for each contract (hook/curve/vault/router/reader). Use `cast abi-encode` for constructor args.

## Notes
- Never commit `.env` or print the private key.
- `launchFee = 0`; creators pay only gas.
- If transient storage is unsupported on-chain, swap `ReentrancyGuardTransient` for the storage guard and re-test before step 2.
